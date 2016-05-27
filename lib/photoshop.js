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
        fs = require("fs"),
        net = require("net"),
        stream = require("stream"),
        psCrypto = require("./ps_crypto");
    
    // Constants
    // ---------
    
    // Protocol constants
    var MESSAGE_HEADER_LENGTH     = 8,
        MESSAGE_LENGTH_OFFSET     = 0,
        MESSAGE_STATUS_OFFSET     = 4,
        MESSAGE_STATUS_LENGTH     = 4,

        PAYLOAD_HEADER_LENGTH     = 12,
        PAYLOAD_PROTOCOL_OFFSET   = 0,
        PAYLOAD_ID_OFFSET         = 4,
        PAYLOAD_TYPE_OFFSET       = 8,

        MAX_MESSAGE_ID            = 256 * 256 * 256,
        PROTOCOL_VERSION          = 1,
        MESSAGE_TYPE_ERROR        = 1,
        MESSAGE_TYPE_JAVASCRIPT   = 2,
        MESSAGE_TYPE_PIXMAP       = 3,
        MESSAGE_TYPE_ICC_PROFILE  = 4,
        STATUS_NO_COMM_ERROR      = 0;
    
    var RE_ONLY_DIGITS = /^[0-9]+$/;
    
    // OutgoingJavascriptMessage Class
    // ===============================

    // Constructor
    // -----------

    function OutgoingJavascriptMessage(jsString, id, derivedKey) {
        if (!(this instanceof OutgoingJavascriptMessage)) {
            return new OutgoingJavascriptMessage(jsString, id, derivedKey);
        } else {
            stream.Readable.call(this);

            var self = this;

            self._jsString = jsString;

            self._messageHeader = new Buffer(MESSAGE_HEADER_LENGTH);
            self._payloadHeader = new Buffer(PAYLOAD_HEADER_LENGTH);

            var payloadLength = PAYLOAD_HEADER_LENGTH + Buffer.byteLength(self._jsString, "utf8");
            if (derivedKey) {
                payloadLength = psCrypto.encryptedLength(payloadLength);
            }

            // message length includes status and payload, but not the UInt32 specifying message length
            var messageLength = payloadLength + MESSAGE_STATUS_LENGTH;
            self._messageHeader.writeUInt32BE(messageLength, MESSAGE_LENGTH_OFFSET);
            self._messageHeader.writeInt32BE(STATUS_NO_COMM_ERROR, MESSAGE_STATUS_OFFSET);
        
            self._payloadHeader.writeUInt32BE(PROTOCOL_VERSION, PAYLOAD_PROTOCOL_OFFSET);
            self._payloadHeader.writeUInt32BE(id, PAYLOAD_ID_OFFSET);
            self._payloadHeader.writeUInt32BE(MESSAGE_TYPE_JAVASCRIPT, PAYLOAD_TYPE_OFFSET);
            
            self._payloadBufferList = [];
            
            if (derivedKey) {
                self._payloadStream = psCrypto.createCipherStream(derivedKey);
            } else {
                self._payloadStream = new stream.PassThrough();
            }
            
            // do an initial _read call as soon as we have data available from the payload stream
            self._needsRead = true;
            
            self._payloadStream.on("readable", function () {
                var b;
                while (true) {
                    b = self._payloadStream.read();
                    if (b) {
                        self._payloadBufferList.push(b);
                    } else {
                        break;
                    }
                }
                if (self._needsRead) {
                    // If _needsRead flag is set, then the last time _read was called, we didn't have
                    // any data to send to the consumer. Now we do, so call _read again.
                    self._read();
                }
            });
            
            self._payloadStream.on("end", function () {
                self._payloadStreamDone = true;
                if (self._needsRead) {
                    // If _needsRead flag is set, then the last time _read was called, we didn't have
                    // any data to send to the consumer. Now we do, so call _read again.
                    self._read();
                }
            });

            self._payloadStream.on("drain", function () {
                self._doPayloadStreamWrite();
            });
            self._doPayloadStreamWrite();

        }
    }

    OutgoingJavascriptMessage.prototype = Object.create(
        stream.Readable.prototype,
        { constructor: { value: OutgoingJavascriptMessage }}
    );

    // Member Variables
    // ----------------
    
    OutgoingJavascriptMessage.prototype._jsString              = null;
    OutgoingJavascriptMessage.prototype._messageHeader         = null;
    OutgoingJavascriptMessage.prototype._messageHeaderSent     = false;
    OutgoingJavascriptMessage.prototype._payloadStream         = null;
    OutgoingJavascriptMessage.prototype._payloadStreamDone     = false;
    OutgoingJavascriptMessage.prototype._payloadBufferList     = null;
    OutgoingJavascriptMessage.prototype._payloadHeader         = null;
    OutgoingJavascriptMessage.prototype._payloadHeaderWritten  = false;
    OutgoingJavascriptMessage.prototype._payloadBodyWritten    = false;
    OutgoingJavascriptMessage.prototype._needsRead             = true;
    
    // Methods
    // -------
    
    OutgoingJavascriptMessage.prototype._read = function () {
        var self = this,
            pushMore = false;

        self._needsRead = false;

        while (true) {
            if (!self._messageHeaderSent) {
                self._messageHeaderSent = true;
                pushMore = self.push(self._messageHeader);
            } else {
                if (self._payloadBufferList.length > 0) {
                    pushMore = self.push(self._payloadBufferList.pop());
                } else if (self._payloadStreamDone) {
                    self.push(null);
                    pushMore = false;
                } else {
                    // No data available, so set a flag to call _read again when it is. Both "readable"
                    // and "end" event handlers for the payload stream call _read if this flag is set.
                    self._needsRead = true;
                    pushMore = false;
                }
            }

            if (!pushMore) {
                break;
            }
        }
    };

    OutgoingJavascriptMessage.prototype._doPayloadStreamWrite = function () {
        var writeMore = false;
        
        while (true) {
            if (!this._payloadHeaderWritten) {
                this._payloadHeaderWritten = true;
                writeMore = this._payloadStream.write(this._payloadHeader);
            } else if (!this._payloadWritten) {
                this._payloadWritten = true;
                writeMore = this._payloadStream.write(this._jsString, "utf8");
            } else { // end of data
                this._payloadStream.end();
                writeMore = false;
            }
            
            if (!writeMore) {
                break;
            }
        }
    };

    // Factory Functions
    // -----------------    
                
    function createOutgoingJavascriptMessage(jsString, id, derivedKey) {
        return new OutgoingJavascriptMessage(jsString, id, derivedKey);
    }

            
    // PhotoshopClient Class
    // =====================
    
    // Constructor
    // -----------
    
    function PhotoshopClient(options, connectListener, logger) {
        var self = this;

        function setupStreamHandlers() {
            // This function does NOT set up error handlers, because we want slightly
            // different error handlers depending on whether we have sockets or pipes

            self._readState = {
                readingHeader:         true,
                readList:              [],
                readListLength:        0,
                payloadBytesRemaining: 0,
                payloadStream:         null,
                payloadStreamWritable: false,
                notWritableEventSet:   false
            };

            self._inputStream.on("readable", function () {
                var b = self._inputStream.read();
                if (b) {
                    self._readState.readList.push(b);
                    self._readState.readListLength += b.length;
                    self._processReadList();
                }
            });
                    
            self._pipeQueue = [];
            self._canPipe = true;

            self._outputStream.on("unpipe", function () {
                self._canPipe = true;
                self._pipeWhenFree();
            });
        }
            
        function connectPipes() {
            // If FDs are either numbers or strings that are actually positive integers, then 
            // they're file descriptors. Otherwise, they are named pipes.

            // Parse any FDs that are numbers as strings
            if (typeof options.inputFd === "string" && RE_ONLY_DIGITS.test(options.inputFd)) {
                options.inputFd = parseInt(options.inputFd, 10);
            }
            if (typeof options.outputFd === "string" && RE_ONLY_DIGITS.test(options.outputFd)) {
                options.outputFd = parseInt(options.outputFd, 10);
            }

            // Create read/write streams
            if (typeof options.inputFd === "number") {
                self._inputStream = fs.createReadStream(null, {fd: options.inputFd});
            } else {
                self._inputStream = fs.createReadStream(options.inputFd);
            }
            self._inputStream.on("error", function (err) {
                self.emit("error", "error on input stream: " + err);
            });
                    
            if (typeof options.outputFd === "number") {
                self._outputStream = fs.createWriteStream(null, {fd: options.outputFd});
            } else {
                self._outputStream = fs.createWriteStream(options.outputFd);
            }
            self._outputStream.on("error", function (err) {
                self.emit("error", "error on output stream: " + err);
            });
            
            self._derivedKey = null; // no encryption on pipes

            setupStreamHandlers();

            // Creating pipe connections is synchronous, but sockets are async.
            // We want all code paths to be async.
            process.nextTick(function () { self.emit("connect"); });
        }
        
        function connectSockets() {
            var socket;
    
            function socketConnectErrorHandler(err) {
                self.emit("error", "error connecting socket: " + err);
            }
        
            function socketConnectHandler() {
                socket.removeListener("error", socketConnectErrorHandler);
                socket.on("error", function (err) {
                    self.emit("error", "error on socket: " + err);
                });
        
                self._inputStream = socket;
                self._outputStream = socket;
        
                setupStreamHandlers();
        
                self.emit("connect");
            }

            socket = new net.Socket();
            socket.connect(options.port, options.hostname);
            socket.once("error", socketConnectErrorHandler);
            socket.once("connect", socketConnectHandler);
    
            self._derivedKey = psCrypto.createDerivedKey(options.password);

        }

        if (!(self instanceof PhotoshopClient)) {
            return new PhotoshopClient(options, connectListener, logger);
        } else {
            if (!options) {
                options = {};
            }
        
            self._logger = logger;
            
            if (connectListener) {
                self.once("connect", connectListener);
            }

            if (options.inputFd && options.outputFd) {
                connectPipes();
            } else if (options.hostname && options.port && options.password) {
                connectSockets();
            } else {
                self.emit("error", "must specify all necessary options for either pipe or socket connection");
            }
        }
    }
    util.inherits(PhotoshopClient, EventEmitter);

    // Member Variables
    // ----------------
        
    PhotoshopClient.prototype._inputStream = null;
    PhotoshopClient.prototype._outputStream = null;
    PhotoshopClient.prototype._derivedKey = null;
    PhotoshopClient.prototype._pipeQueue = null;
    PhotoshopClient.prototype._canPipe = false;
    PhotoshopClient.prototype._commandCount = 0;
    PhotoshopClient.prototype._readState = null;
    PhotoshopClient.prototype._logger = null;

    // Methods
    // -------

    PhotoshopClient.prototype._pipeWhenFree = function () {
        var self = this;
    
        if (self._canPipe && self._pipeQueue.length > 0) {
            var thePipe = self._pipeQueue.shift();
            thePipe.on("end", function () {
                thePipe.unpipe();
            });
            thePipe.pipe(this._outputStream, {end: false});
        }
        // Continue to try writing as long as there is something left to write
        if (this._pipeQueue.length > 0) {
            process.nextTick(this._doPendingWrites.bind(this));
        }
    };

    PhotoshopClient.prototype._processReadList = function () {
        var self = this,
            state = self._readState;
    
        function consumeBytes(n) {
            var result = null,
                i = 0,
                buffers = [],
                b,
                extra;

            if (n > 0 && state.readListLength >= n) {
                while (i < n) {
                    b = state.readList.shift();
                    state.readListLength -= b.length;
                    i += b.length;
                    buffers.push(b);
                }

                if (buffers.length === 1) {
                    result = buffers.shift();
                } else { // buffers.length > 1
                    result = Buffer.concat(buffers, i);
                }

                if (result.length > n) {
                    extra = result.slice(n);
                    state.readList.unshift(extra);
                    state.readListLength += extra.length;
                    result = result.slice(0, n);
                }
            }
            
            return result;
        }
            
        function consumeOneBuffer() {
            var result = null;
            if (state.readList.length > 0) {
                result = state.readList.shift();
                state.readListLength -= result.length;
            }
            return result;
        }
    
        function unconsumeBuffer(b) {
            state.readList.unshift(b);
            state.readListLength += b.length;
        }

        function processHeader() {
            var keepReading = false,
                buffer,
                commStatus,
                messageLength;

            if (state.readListLength > MESSAGE_STATUS_OFFSET) {
                state.readingHeader = false;
                buffer = consumeBytes(MESSAGE_HEADER_LENGTH);
        
                keepReading = state.readListLength > 0;

                commStatus = buffer.readInt32BE(MESSAGE_STATUS_OFFSET);
                if (commStatus !== STATUS_NO_COMM_ERROR) {
                    self.emit("error", "communications error: " + commStatus);
                }
        
                // messageLength specifies the length of *everything* after the message length bytes
                // (i.e. the rest of the header and the payload). It does *not* include the bytes
                // used to specify the message length.
                messageLength = buffer.readUInt32BE(MESSAGE_LENGTH_OFFSET);
                state.payloadBytesRemaining = messageLength - (MESSAGE_HEADER_LENGTH - MESSAGE_STATUS_OFFSET);
        
                if (self._derivedKey) {
                    state.payloadStream = psCrypto.createDecipherStream(self._derivedKey);
                } else {
                    state.payloadStream = new stream.PassThrough();
                }
                state.payloadStreamWritable = true;
                state.payloadStream.on("drain", function () {
                    state.payloadStreamWritable = true;
                    process.nextTick(self._processReadList.bind(self));
                });

                // BEGIN HACK

                state.payloadBuffer = new Buffer(state.payloadBytesRemaining);
                state.payloadBufferPointer = 0;
        
                state.payloadStream.on("readable", function () {
                    if (!state.payloadBuffer) {
                        return;
                    }
                    var b = state.payloadStream.read();
                    if (b) {
                        b.copy(state.payloadBuffer, state.payloadBufferPointer);
                        state.payloadBufferPointer += b.length;
                    }
                });

                state.payloadStream.on("end", function () {
                    if (!state.payloadBuffer) {
                        state.payloadBufferPointer = 0;
                        return;
                    }
                    state.payloadBuffer =
                        state.payloadBuffer.slice(0, state.payloadBufferPointer);
                    self._logger.log("done reading payload",
                        state.payloadBuffer.length,
                        state.payloadBuffer
                    );
                    if (state.payloadBuffer.length > 0) {
                        self._processMessage(state.payloadBuffer);
                    } else {
                        self._logger.log("empty payload, throwing away");
                    }
                    state.payloadBuffer = null;
                    state.payloadBufferPointer = 0;
                });
        
                // END HACK
            }

            return keepReading;
        }

        function processPayload() {
            var keepReading = false,
                buffer;

            if (state.readList.length > 0) {
                if (!state.payloadStreamWritable) { // have something to read, but can't write it
                    if (!state.notWritableEventSet) {
                        state.notWritableEventSet = true;   // only set once
                        state.payloadStream.once("drain", function () {
                            // try again on next tick, so that other drain handlers
                            // have a chance to set the payloadStreamWritable flag
                            process.nextTick(self._processReadList.bind(self));
                            state.notWritableEventSet = false;
                        });
                    }
                } else { // ready to write to payload stream, so okay to read
                    buffer = consumeOneBuffer();
                    if (buffer.length > state.payloadBytesRemaining) {
                        unconsumeBuffer(buffer.slice(state.payloadBytesRemaining));
                        buffer = buffer.slice(0, state.payloadBytesRemaining);
                    }

                    state.payloadStreamWritable = state.payloadStream.write(buffer);

                    state.payloadBytesRemaining -= buffer.length;
                    if (state.payloadBytesRemaining < 1) {
                        state.readingHeader = true;
                        state.payloadStream.end();
                        state.payloadStream = null;
                        state.payloadStreamWritable = false;
                    }

                    // If state.payloadStreamWritable is false, we need to keep reading one
                    // more time (if we have more data) so that we get into the state where
                    // we register for a drain event. (That's why state.payloadStreamWritable
                    // is not in the statement below.)
                    keepReading = state.readListLength > 0;
                }
            }

            return keepReading;
        }
        
        // Code that does the actual work
        var keepReading = true;
        while (keepReading) {
            if (state.readingHeader) {
                keepReading = processHeader();
            } else {
                keepReading = processPayload();
            }
        }

    };

    PhotoshopClient.prototype.sendCommand = function (javascript) {
        if (this._commandCount >= MAX_MESSAGE_ID) {
            this._commandCount = 0;
        }

        var id = ++this._commandCount;
        
        var command = new OutgoingJavascriptMessage(javascript, id, this._derivedKey);
        this._pipeQueue.push(command);
        this._pipeWhenFree();

        return id;
    };
    
    PhotoshopClient.prototype._processMessage = function (bodyBuffer) {
        if (bodyBuffer.length < PAYLOAD_HEADER_LENGTH) {
            this._logger.log("payload buffer shorter than payload header!");
            return;
        }
        var protocolVersion = bodyBuffer.readUInt32BE(PAYLOAD_PROTOCOL_OFFSET),
            messageID = bodyBuffer.readUInt32BE(PAYLOAD_ID_OFFSET),
            messageType = bodyBuffer.readUInt32BE(PAYLOAD_TYPE_OFFSET),
            messageBody = bodyBuffer.slice(PAYLOAD_HEADER_LENGTH);
        
        var rawMessage = {
            protocolVersion: protocolVersion,
            id: messageID,
            type: messageType,
            body: messageBody
        };

        if (protocolVersion !== PROTOCOL_VERSION) {
            this.emit("error", "unknown protocol version", protocolVersion);
        } else if (messageType === MESSAGE_TYPE_JAVASCRIPT) {
            var messageBodyString = messageBody.toString("utf8");
            var messageBodyParts = messageBodyString.split("\r");
            var eventName = null;
            var parsedValue = null;
            
            if (messageBodyParts.length === 2) {
                eventName = messageBodyParts[0];
            }

            try {
                parsedValue = JSON.parse(messageBodyParts[messageBodyParts.length - 1]);
                this._logger.log("got JS message: %j", parsedValue);
            } catch (jsonParseException) {
                // Many commands pass JSON back. However, some pass strings that result from
                // toStrings of un-JSON-ifiable data (e.g. "[ActionDescriptor]").
            // TODO: In the future, it might make more sense to have a different slot in
            // the message that gives parsed data (if available) and unparsed string (always)
                parsedValue = messageBodyParts[messageBodyParts.length - 1];
            }
    
            if (eventName) {
                this.emit("event", messageID, eventName, parsedValue, rawMessage);
            } else {
                this.emit("message", messageID, parsedValue, rawMessage);
            }
        } else if (messageType === MESSAGE_TYPE_PIXMAP) {
            this.emit("pixmap", messageID, messageBody, rawMessage);
        } else if (messageType === MESSAGE_TYPE_ICC_PROFILE) {
            this.emit("iccProfile", messageID, messageBody, rawMessage);
        } else if (messageType === MESSAGE_TYPE_ERROR) {
            this.emit("error", { id: messageID, body: messageBody.toString("utf8") });
        } else {
            this.emit("communicationsError", "unknown message type", messageType);
        }
    };
        
    // Factory Functions
    // -----------------    
    
    function createClient(options, connectListener, logger) {
        return new PhotoshopClient(options, connectListener, logger);
    }

    // Public Interface
    // =================================

    exports.PhotoshopClient = PhotoshopClient;
    exports.createClient = createClient;

    exports._createOutgoingJavascriptMessage = createOutgoingJavascriptMessage; // for testing

}());
