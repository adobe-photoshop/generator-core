/*
 * Copyright (c) 2013 Adobe Systems Incorporated. All rights reserved.
 *  
 * Permission is hereby granted, free of charge, to any person obtaining a
 * copy of this software and associated documentation files (the "Software"), 
 * to deal in the Software without restriction, including without limitation 
 * the rights to use, copy, modify, merge, publish, distribute, sublicense, 
 * and/or sell copies of the Software, and to permit persons to whom the 
 * Software is furnished to do so, subject to the following conditions:
 *  
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *  
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, 
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER 
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING 
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER 
 * DEALINGS IN THE SOFTWARE.
 * 
 */

(function () {
    "use strict";

    // Dependencies
    // ------------
    
    var util = require("util"),
        EventEmitter = require("events").EventEmitter,
        net = require("net"),
        Q = require("q"),
        psCrypto = require("./ps_crypto");
    
    // Constants
    // ---------
    
    // Connection constants
    var DEFAULT_PASSWORD       = "password",
        DEFAULT_PORT           = 49494,
        DEFAULT_HOSTNAME       = "localhost",
        KEEPALIVE_DELAY        = 1000; //milliseconds
        
    var CONNECTION_STATES = {
        NONE           : 0,
        CONNECTING     : 1,
        AUTHENTICATING : 2,
        OPEN           : 3,
        CLOSING        : 4,
        CLOSED         : 5,
        DESTROYED      : 6
    };
    
    // Protocol constants
    var MESSAGE_LENGTH_OFFSET     = 0,
        MESSAGE_STATUS_OFFSET     = 4,
        MESSAGE_STATUS_LENGTH     = 4,
        MESSAGE_PAYLOAD_OFFSET    = MESSAGE_STATUS_OFFSET + MESSAGE_STATUS_LENGTH,
        PAYLOAD_HEADER_LENGTH     = 12,
        PAYLOAD_PROTOCOL_OFFSET   = 0,
        PAYLOAD_ID_OFFSET         = 4,
        PAYLOAD_TYPE_OFFSET       = 8,
        MAX_MESSAGE_ID            = 128,
        PROTOCOL_VERSION          = 1,
        MESSAGE_TYPE_JAVASCRIPT   = 2,
        MESSAGE_TYPE_PIXMAP       = 3,
        STATUS_NO_COMM_ERROR      = 0;
        
    // PhotoshopClient Class
    // =====================
    
    // Constructor
    // -----------
    
    function PhotoshopClient(options, connectListener) {
        var self = this;
        
        if (!self instanceof PhotoshopClient) {
            return new PhotoshopClient(options, connectListener);
        } else {
            if (options.hasOwnProperty("password")) { self._password = options.password; }
            if (options.hasOwnProperty("port")) { self._port = options.port; }
            if (options.hasOwnProperty("hostname")) { self._hostname = options.hostname; }
            if (options.hasOwnProperty("inputFd")) { self._inputFd = options.inputFd; }
            if (options.hasOwnProperty("outputFd")) { self._outputFd = options.outputFd; }
            
            self._receiveBuffer = new Buffer(0);
            self._commandDeferreds = {};
            
            if (connectListener) {
                this.once("connect", connectListener);
            }
            
            var connectionPromise = null;
            var cryptoPromise = null;
            
            if (typeof self._inputFd === "number" && typeof self._outputFd === "number") {
                connectionPromise = self._connectPipe();
                var cryptoDeferred = Q.defer();
                cryptoDeferred.resolve();
                cryptoPromise = cryptoDeferred.promise;
            } else if (self._hostname && typeof self._port === "number") {
                connectionPromise = self._connectSocket();
                cryptoPromise = self._initCrypto();
            } else {
                var connectionDeferred = Q.defer();
                connectionDeferred.reject();
                connectionPromise = connectionDeferred.promise;
            }
            
            Q.all([
                connectionPromise,
                cryptoPromise
            ]).then(
                self._authenticate.bind(self)
            ).done(
                function () {
                    self.emit("connect");
                },
                function (err) {
                    self.emit("error", err);
                    self.disconnect();
                }
            );
        }
    }
    util.inherits(PhotoshopClient, EventEmitter);

    // Member Variables
    // ----------------
    
    PhotoshopClient.prototype._password = DEFAULT_PASSWORD;
    PhotoshopClient.prototype._port = DEFAULT_PORT;
    PhotoshopClient.prototype._hostname = DEFAULT_HOSTNAME;
    PhotoshopClient.prototype._connectionState = CONNECTION_STATES.NONE;
    PhotoshopClient.prototype._lastMessageID = 0;
    PhotoshopClient.prototype._crypto = null;
    PhotoshopClient.prototype._receiveBuffer = null;
    PhotoshopClient.prototype._commandDeferreds = null;
    PhotoshopClient.prototype._applicationPath = null;
    
    // Methods
    // -------
    
    PhotoshopClient.prototype._initCrypto = function () {
        var self = this;
        var cryptoDeferred = Q.defer();
        psCrypto.createPSCrypto(self._password, function (err, crypto) {
            if (err) {
                cryptoDeferred.reject(err);
            } else {
                self._crypto = crypto;
                cryptoDeferred.resolve();
            }
        });
        return cryptoDeferred.promise;
    };
    
    PhotoshopClient.prototype._connectPipe = function () {
        var self = this;
        var fs = require("fs");
        var result = false;
        
        console.log("opening input pipe %d and output pipe %d", self._inputFd, self._outputFd);
        try {
            self._connectionState = CONNECTION_STATES.CONNECTING;
            
            self._readStream = fs.createReadStream(null, {fd: self._inputFd});

            self._readStream.on("data", function (incomingBuffer) {
                self._receiveBuffer = Buffer.concat([self._receiveBuffer, incomingBuffer]);
                self._processReceiveBuffer();
            });

            self._readStream.on("error", function (err) {
                self.emit("error", "Pipe error: " + err);
                self.disconnect();
            });
                    
            self._readStream.on("close", function () {
                self._connectionState = CONNECTION_STATES.CLOSED;
                self.emit("close");
            });
            
            self._writeStream = fs.createWriteStream(null, {fd: self._outputFd});

            self._writeStream.on("error", function (err) {
                self.emit("error", "Pipe error: " + err);
                self.disconnect();
            });
                    
            self._writeStream.on("close", function () {
                self._connectionState = CONNECTION_STATES.CLOSED;
                self.emit("close");
            });
            
            result = true;
        } catch (e) {
            self.emit("error", "Pipe error: " + e);
            self.disconnect();
        }
        
        return result;
    };
    
    PhotoshopClient.prototype._connectSocket = function () {
        var self = this;
        var connectSocketDeferred = Q.defer();
        
        self._socket = new net.Socket();
        self._connectionState = CONNECTION_STATES.CONNECTING;
        
        console.log("connecting to %s:%d", self._hostname, self._port);
        self._socket.connect(self._port, self._hostname);
        
        // register event handlers for socket
        
        self._socket.on("connect", function () {
            self._socket.setKeepAlive(true, KEEPALIVE_DELAY);
            self._socket.setNoDelay();
            connectSocketDeferred.resolve(self);
            self._writeStream = self._socket;
        });

        self._socket.on("error", function (err) {
            if (connectSocketDeferred.promise.isPending()) {
                connectSocketDeferred.reject(err);
            }
            self.emit("error", "Socket error: " + err);
            self.disconnect();
        });
                
        self._socket.on("close", function () {
            self._connectionState = CONNECTION_STATES.CLOSED;
            self.emit("close");
        });
        
        self._socket.on("data", function (incomingBuffer) {
            self._receiveBuffer = Buffer.concat([self._receiveBuffer, incomingBuffer]);
            self._processReceiveBuffer();
        });
        
        return connectSocketDeferred.promise;
    };
    
    // The messaging protocol does not have an explicit authentication mechanism.
    // To check if we have the right password, we send a JSX command and see if
    // we get the expected response or an error.
    PhotoshopClient.prototype._authenticate = function () {
        var self = this,
            authenticateDeferred = Q.defer();
        
        self._connectionState = CONNECTION_STATES.AUTHENTICATING;
        
        var authErrorHandler = function () {
            authenticateDeferred.reject("Incorrect password");
        };
        self.on("communicationsError", authErrorHandler);
        self.sendCommand("1+1").then(
            function (response) {
                if (response.type === MESSAGE_TYPE_JAVASCRIPT) {
                    if (response.message === 2) {
                        self._connectionState = CONNECTION_STATES.OPEN;
                        self.removeListener("communicationsError", authErrorHandler);
                        self.addListener("communicationsError", function (err) {
                            self.emit("error", err);
                            self.disconnect();
                        });
                        authenticateDeferred.resolve();
                    } else {
                        authenticateDeferred.reject("Incorrect password");
                    }
                } else {
                    authenticateDeferred.reject("Incorrect password");
                }
            },
            function (err) {
                authenticateDeferred.reject("Error authenticating: " + err);
            }
        );
                
        return authenticateDeferred.promise;
    };
    
    PhotoshopClient.prototype.isConnected = function () {
        return (this._connectionState === CONNECTION_STATES.OPEN);
    };
    
    PhotoshopClient.prototype.disconnect = function (listener) {
        if (!listener) {
            listener = function () { };
        }

        if (this._socket) {
            var currentState = this._connectionState;
            switch (currentState) {
            case CONNECTION_STATES.NONE:
                this._connectionState = CONNECTION_STATES.CLOSED;
                process.nextTick(listener);
                return true;
            case CONNECTION_STATES.CONNECTING:
                this._connectionState = CONNECTION_STATES.CLOSING;
                this._socket.once("close", listener);
                this._socket.end();
                return true;
            case CONNECTION_STATES.AUTHENTICATING:
                this._connectionState = CONNECTION_STATES.CLOSING;
                this._socket.once("close", listener);
                this._socket.end();
                return true;
            case CONNECTION_STATES.OPEN:
                this._connectionState = CONNECTION_STATES.CLOSING;
                this._socket.once("close", listener);
                this._socket.end();
                return true;
            case CONNECTION_STATES.CLOSING:
                this._socket.once("close", listener);
                return true;
            case CONNECTION_STATES.CLOSED:
                process.nextTick(listener);
                return true;
            case CONNECTION_STATES.DESTROYED:
                process.nextTick(listener);
                return true;
            }
        } else {
            if (this._readStream) {
                try {
                    this._readStream.close();
                } catch (readCloseError) {
                    // do nothing
                }
                this._writeStream = null;
            }
            
            if (this._writeStream) {
                try {
                    this._writeStream.close();
                } catch (writeCloseError) {
                    // do nothing
                }
                this._writeStream = null;
            }
            
            this._connectionState = CONNECTION_STATES.CLOSED;
            process.nextTick(listener);
            return true;
        }
    };
    
    PhotoshopClient.prototype.destroy = function () {
        this._connectionState = CONNECTION_STATES.DESTROYED;
        if (this._socket) {
            this._socket.destroy();
        }
    };
  
    PhotoshopClient.prototype.locateApplicationPath = function () {
        var self = this;
        if (!this._applicationPath) {
            var result = this.sendCommand("File(app.path).fsName;");
            result.then(function (data) {
                self._applicationPath = data.message;
            });
        }
    };

    PhotoshopClient.prototype.sendCommand = function (javascript) {
        var id = this._lastMessageID = (this._lastMessageID + 1) % MAX_MESSAGE_ID,
            codeBuffer = new Buffer(javascript, "utf8"),
            payloadBuffer = new Buffer(codeBuffer.length + PAYLOAD_HEADER_LENGTH);
        
        payloadBuffer.writeUInt32BE(PROTOCOL_VERSION, PAYLOAD_PROTOCOL_OFFSET);
        payloadBuffer.writeUInt32BE(id, PAYLOAD_ID_OFFSET);
        payloadBuffer.writeUInt32BE(MESSAGE_TYPE_JAVASCRIPT, PAYLOAD_TYPE_OFFSET);
        codeBuffer.copy(payloadBuffer, PAYLOAD_HEADER_LENGTH);
        
        var cipheredPayloadBuffer = this._crypto ? this._crypto.cipher(payloadBuffer) : payloadBuffer;
        var headerBuffer = new Buffer(MESSAGE_PAYLOAD_OFFSET);

        // message length includes status and payload, but not the UInt32 specifying message length
        var messageLength = cipheredPayloadBuffer.length + MESSAGE_STATUS_LENGTH;
        headerBuffer.writeUInt32BE(messageLength, MESSAGE_LENGTH_OFFSET);
        headerBuffer.writeInt32BE(STATUS_NO_COMM_ERROR, MESSAGE_STATUS_OFFSET);
        
        this._writeStream.write(headerBuffer);
        this._writeStream.write(cipheredPayloadBuffer);
        
        this._commandDeferreds[id] = Q.defer();
        return this._commandDeferreds[id].promise;
    };

    PhotoshopClient.prototype._processReceiveBuffer = function () {
        if (this._receiveBuffer.length >= MESSAGE_PAYLOAD_OFFSET) {
            // message length includes status and payload, but not the UInt32 specifying message length
            var messageLength = this._receiveBuffer.readUInt32BE(MESSAGE_LENGTH_OFFSET),
                totalLength = messageLength + MESSAGE_STATUS_OFFSET;

            var commStatus = this._receiveBuffer.readInt32BE(MESSAGE_STATUS_OFFSET);
            if (commStatus !== STATUS_NO_COMM_ERROR) {
                this.emit("communicationsError", "Photoshop communication error: " + commStatus);
                this.disconnect();
            } else if (this._receiveBuffer.length >= totalLength) {
                // We have the entire message
                var cipheredBody = this._receiveBuffer.slice(
                    MESSAGE_PAYLOAD_OFFSET,
                    totalLength
                );
                this._receiveBuffer = this._receiveBuffer.slice(totalLength);
                var bodyBuffer = this._crypto ? this._crypto.decipher(cipheredBody) : cipheredBody;
                this._processMessage(bodyBuffer);
            }
        }
    };
    
    PhotoshopClient.prototype._processMessage = function (bodyBuffer) {
        var apiVersion = bodyBuffer.readUInt32BE(PAYLOAD_PROTOCOL_OFFSET),
            messageID = bodyBuffer.readUInt32BE(PAYLOAD_ID_OFFSET),
            messageType = bodyBuffer.readUInt32BE(PAYLOAD_TYPE_OFFSET),
            messageBody = bodyBuffer.slice(PAYLOAD_HEADER_LENGTH);
                
        if (messageType === MESSAGE_TYPE_JAVASCRIPT) {
            var messageBodyString = messageBody.toString("utf8");
            var messageBodyParts = messageBodyString.split("\r");
            var eventName = null;
            var parsedValue = null;
            
            if (messageBodyParts.length === 2) {
                eventName = messageBodyParts[0];
            }
            
            try {
                parsedValue = JSON.parse(messageBodyParts[messageBodyParts.length - 1]);
            } catch (jsonParseException) {
                // Many commands pass JSON back. However, some pass strings that result from
                // toStrings of un-JSON-ifiable data (e.g. "[ActionDescriptor]").
                // TODO: In the future, it might make more sense to have a different slot in
                // the message that gives parsed data (if available) and unparsed string (always)
                parsedValue = messageBodyParts[messageBodyParts.length - 1];
            }
            
            
            if (this._commandDeferreds[messageID]) {
                this._commandDeferreds[messageID].resolve({
                    apiVersion: apiVersion,
                    id: messageID,
                    type: messageType,
                    event: eventName,
                    message: parsedValue
                });
                this._commandDeferreds[messageID] = undefined;
            } else {
            // TODO: Determine if this is the right logic for events. Right now, when
            // we register for events, we get a message back confirming the registration,
            // and we resolve and remove the deferred from that command. All subsequent
            // events use the same messageID. So, if we don't have a deferred for the
            // message ID, then we assume it's an event and we emit it.
                if (eventName) {
                    this.emit(eventName, parsedValue);
                } else {
                    this.emit("unknownMessage", parsedValue);
                }
            }
        } else if (messageType === MESSAGE_TYPE_PIXMAP) {
            this.emit("pixmap", messageID, messageBody);
        } else {
            this.emit("communicationsError", "unknown message type");
        }
        
        
        /*
        console.log("[photoshop.js] Got a message! apiVersion: %d, messageId %d, messageType %d, Message: %j",
                    apiVersion, messageID, messageType, messageBodyString);
        this.emit("message", messageBodyString);
        */
        
    };
    
    // Wrap emit function so that any event gets emitted both normally
    // and as part of an "all" event. This way we can leverage the regular
    // EventEmitter logic and still also have listeners that listen for
    // all events.
    PhotoshopClient.prototype.emit = function () {
        var args = Array.prototype.slice.call(arguments, 0);
        /* jshint camelcase:false */
        var superEmit = this.constructor.super_.prototype.emit;
        /* jshint camelcase:true */

        // Emit regular event
        superEmit.apply(this, args);

        // Emit "all" event if this event isn't already an "all" event
        if (args[0] && args[0] !== "all") {
            args.unshift("all");
            superEmit.apply(this, args);
        }
    };
    
    // Factory Functions
    // -----------------    
    
    function createClient(options, connectListener) {
        return new PhotoshopClient(options, connectListener);
    }
    
    // Public Interface
    // =================================

    exports.PhotoshopClient = PhotoshopClient;
    exports.createClient = createClient;
    
}());
