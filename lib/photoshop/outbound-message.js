/*
 * Copyright (c) 2016 Adobe Systems Incorporated. All rights reserved.
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
    
    var stream = require("stream"),
        psCrypto = require("./ps-crypto");

    var CONSTANTS = require("./constants").CONSTANTS;
    var corylog = require("./constants").corylog;

    // OutboundMessage Class
    // ===============================

    // Constructor
    // -----------

    var OutboundMessage = function (jsString, id, derivedKey) {
        if (!(this instanceof OutboundMessage)) {
            return new OutboundMessage(jsString, id, derivedKey);
        } else {
            stream.Readable.call(this);

            corylog("initializing a new outbound message: %s", jsString.substr(0, 50));

            var self = this;

            self._jsString = jsString;

            self._messageHeader = new Buffer(CONSTANTS.MESSAGE_HEADER_LENGTH);
            self._payloadHeader = new Buffer(CONSTANTS.PAYLOAD_HEADER_LENGTH);

            var payloadLength = CONSTANTS.PAYLOAD_HEADER_LENGTH + Buffer.byteLength(self._jsString, "utf8");
            if (derivedKey) {
                payloadLength = psCrypto.encryptedLength(payloadLength);
            }

            // message length includes status and payload, but not the UInt32 specifying message length
            var messageLength = payloadLength + CONSTANTS.MESSAGE_STATUS_LENGTH;
            self._messageHeader.writeUInt32BE(messageLength, CONSTANTS.MESSAGE_LENGTH_OFFSET);
            self._messageHeader.writeInt32BE(CONSTANTS.STATUS_NO_COMM_ERROR, CONSTANTS.MESSAGE_STATUS_OFFSET);
        
            self._payloadHeader.writeUInt32BE(CONSTANTS.PROTOCOL_VERSION, CONSTANTS.PAYLOAD_PROTOCOL_OFFSET);
            self._payloadHeader.writeUInt32BE(id, CONSTANTS.PAYLOAD_ID_OFFSET);
            self._payloadHeader.writeUInt32BE(CONSTANTS.MESSAGE_TYPE_JAVASCRIPT, CONSTANTS.PAYLOAD_TYPE_OFFSET);
            
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
    };

    OutboundMessage.prototype = Object.create(
        stream.Readable.prototype,
        { constructor: { value: OutboundMessage }}
    );

    // Member Variables
    // ----------------
    
    OutboundMessage.prototype._jsString              = null;
    OutboundMessage.prototype._messageHeader         = null;
    OutboundMessage.prototype._messageHeaderSent     = false;
    OutboundMessage.prototype._payloadStream         = null;
    OutboundMessage.prototype._payloadStreamDone     = false;
    OutboundMessage.prototype._payloadBufferList     = null;
    OutboundMessage.prototype._payloadHeader         = null;
    OutboundMessage.prototype._payloadHeaderWritten  = false;
    OutboundMessage.prototype._payloadBodyWritten    = false;
    OutboundMessage.prototype._needsRead             = true;
    
    // Methods
    // -------
    
    OutboundMessage.prototype._read = function () {
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

    OutboundMessage.prototype._doPayloadStreamWrite = function () {
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

    module.exports = OutboundMessage;

}());
