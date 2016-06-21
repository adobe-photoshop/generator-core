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

    // Constructor for Input Stream Parser
    // A state machine that watches an inputStream, and calls the provided payloadProcessor As soon as both 
    // the message header and payload header have been peeked in to.  And stuff.
    var InboundStreamParser = function (inputStream, derivedKey, payloadProcessor) {
        this._inputStream = inputStream;
        this._derivedKey = derivedKey;
        this._payloadProcessor = payloadProcessor;
        this._initState();
    };

    InboundStreamParser.prototype._inputStream = null;
    InboundStreamParser.prototype._payloadProcessor = null;
    InboundStreamParser.prototype._readState = null;

    InboundStreamParser.prototype._initState = function () {
        corylog("INIT STATE");
        this._readState = {
            messageHeaderRead: false, // message manager
            payloadInspected: false, // payload manager
            payloadProcessed: false, // payload manager
            decipherStreamDirty: false,
            payloadLength: null,
            payloadBytesRead: null,
            payloadDecipherStream: null,
            payloadTempBuffer: null, // because unshifting to a transform stream is not reliable?
            payloadMetadata: null,
            clearPayloadStream: null
        };
    };

    InboundStreamParser.prototype._readInputStream = function () {
        var self = this,
            state = self._readState;

        // Pause the input stream if we're waiting for a previous decipher stream to finish
        // TODO this will probably have to change now that we're using the "once" listener
        if (state.decipherStreamDirty) {
            corylog("Skipping _readInputStream because decipherStreamDirty");
            // this._readInputStream.read(0);
            return;
        }

        var buf = this._inputStream.read();

        if (!buf) {
            this._inputStream.once("readable", this._readInputStream.bind(this));
            return;
        }

        corylog("reading buffer size %d: %O", buf.length, buf);
        // buf.readInt32BE(0), buf.readInt32BE(4)

        if (!state.messageHeaderRead) {
            var messageHeaderBuffer;

            if (buf.length === CONSTANTS.MESSAGE_HEADER_LENGTH) {
                messageHeaderBuffer = buf;
            } else if (buf.length > CONSTANTS.MESSAGE_HEADER_LENGTH) {
                var remainder = buf.slice(CONSTANTS.MESSAGE_HEADER_LENGTH);
                corylog("unshifting remainder %O", remainder);
                this._inputStream.unshift(remainder);
                messageHeaderBuffer = buf.slice(0, CONSTANTS.MESSAGE_HEADER_LENGTH);
            } else {
                // Need to wait for the full message header?
                // maybe something like this...
                corylog("Buffer does not contain full header, try again later");
                this._inputStream.unshift(buf);
                this._readInputStream();
                // this._inputStream.read(0);
                return;
            }

            corylog("messageHeaderBuffer %O", messageHeaderBuffer);

            var commStatus = messageHeaderBuffer.readInt32BE(CONSTANTS.MESSAGE_STATUS_OFFSET);
            if (commStatus !== CONSTANTS.STATUS_NO_COMM_ERROR) {
                // TODO this used to emit an error .. but how do we handle this now inside InboundStreamParser?
                throw new Error("communications error: " + commStatus);
            }

            // messageLength specifies the length of *everything* after the message length bytes
            // (i.e. the rest of the header and the payload). It does *not* include the bytes
            // used to specify the message length.
            var messageLength = messageHeaderBuffer.readUInt32BE(CONSTANTS.MESSAGE_LENGTH_OFFSET);
            state.payloadLength = messageLength - (CONSTANTS.MESSAGE_HEADER_LENGTH - CONSTANTS.MESSAGE_STATUS_OFFSET);
            corylog("payload length %d", state.payloadLength);

            state.messageHeaderRead = true;

            // set up clear message readable stream
            state.clearPayloadStream = new stream.PassThrough();

            // set up decipher stream
            if (self._derivedKey) {
                state.payloadDecipherStream = psCrypto.createDecipherStream(self._derivedKey);
            } else {
                state.payloadDecipherStream = new stream.PassThrough();
            }

            var readDecipherStream  = function (force) {
                var payloadBuffer = state.payloadDecipherStream.read();

                if (!payloadBuffer && !force) {
                    corylog("decipher stream  - no bytes read - register handler again");
                    state.payloadDecipherStream.once("readable", readDecipherStream);
                    return;
                }

                if (state.payloadTempBuffer) {
                    payloadBuffer = payloadBuffer ?
                        Buffer.concat([state.payloadTempBuffer, payloadBuffer]) :
                        state.payloadTempBuffer;
                    state.payloadTempBuffer = null;
                }

                corylog("processing decipher stream.  is inspected? %s.  buffer size %d", state.payloadInspected,
                    payloadBuffer.length, payloadBuffer);

                if (!state.payloadInspected) {
                    if (payloadBuffer.length > CONSTANTS.PAYLOAD_HEADER_LENGTH) {
                        var remainder = payloadBuffer.slice(CONSTANTS.PAYLOAD_HEADER_LENGTH);
                        corylog("processing oversized payload header, pseudo unshifting reminder (%s), %O",
                            remainder.length, remainder);
                        state.payloadTempBuffer = remainder;
                        payloadBuffer = payloadBuffer.slice(0, CONSTANTS.PAYLOAD_HEADER_LENGTH);
                    } else if (payloadBuffer.length < CONSTANTS.PAYLOAD_HEADER_LENGTH) {
                        // Need to wait for the full message header?
                        // maybe something like this...
                        corylog("pseudo unshifting incomplete payload header %O", payloadBuffer);
                        state.payloadTempBuffer = payloadBuffer;
                        return readDecipherStream();
                    }

                    var protocolVersion = payloadBuffer.readUInt32BE(CONSTANTS.PAYLOAD_PROTOCOL_OFFSET),
                        messageID = payloadBuffer.readUInt32BE(CONSTANTS.PAYLOAD_ID_OFFSET),
                        messageType = payloadBuffer.readUInt32BE(CONSTANTS.PAYLOAD_TYPE_OFFSET);

                    corylog("processing payload header, %d - %d - %d ", protocolVersion, messageID, messageType);
                    
                    state.payloadMetadata = {
                        protocolVersion: protocolVersion,
                        messageID: messageID,
                        messageType: messageType
                    };

                    state.payloadInspected = true;
                    readDecipherStream();
                } else {
                    corylog("writing to clearPayloadStream %d", payloadBuffer.length);
                    state.clearPayloadStream.write(payloadBuffer);
                    if (!state.payloadProcessed) {
                        self.watchPayload();
                    }
                    readDecipherStream();
                }
            };

            state.payloadDecipherStream.once("readable", readDecipherStream);

            state.payloadDecipherStream.on("end", function () {
                corylog("end of payloadDecipherStream");
                if (state.payloadTempBuffer) {
                    // since readDecipherStream() short-circuits when read() returns null, it is
                    // necessary to forcibly read the remaining temp buffer, if it exists
                    corylog("payloadDecipherStream has ended, but there is data in payloadTempBuffer!! %d",
                        state.payloadTempBuffer.length, state.payloadTempBuffer);
                    readDecipherStream(true);
                }
                if (!state.payloadProcessed) { //TODO payloadProcessed is a bad name now
                    corylog("payloadDecipherStream has ended, but message hasn't been emitted, doing that now");
                    self.watchPayload();
                }
                state.clearPayloadStream.end();
            });
        } else {
            corylog("reading non message header. %d, %d, %d", buf.length, state.payloadLength,
                state.payloadBytesRead);
            var remainingBytes = state.payloadLength - state.payloadBytesRead,
                extraBytes = buf.length - remainingBytes,
                endOfPayload = false,
                payloadBuffer = buf;
            corylog("extraBytes: %d", extraBytes);

            if (extraBytes === 0) {
                corylog("buffer is exactly the size of the payload");
                endOfPayload = true;
            } else if (extraBytes > 0) {
                endOfPayload = true;
                this._inputStream.unshift(buf.slice(remainingBytes));
                payloadBuffer = buf.slice(0, remainingBytes);
            }

            state.payloadBytesRead += payloadBuffer.length;

            if (endOfPayload) {
                corylog("End of Payload; Setting decipherStreamDirty");
                //this._inputStream.pause();
                state.payloadDecipherStream.end(payloadBuffer);
                state.decipherStreamDirty = true;
            } else {
                state.payloadDecipherStream.write(payloadBuffer);
            }
        }
        this._readInputStream();
    };


    // Call the payload processor, and watch for the clearPayloadStream's "end" event so we can reset the 
    // internal state
    InboundStreamParser.prototype.watchPayload = function () {
        var state = this._readState,
            self = this;

        corylog("Watching payload...");

        state.payloadProcessed = true;
        
        this._payloadProcessor(state.payloadMetadata, state.clearPayloadStream);

        state.clearPayloadStream.once("end", function () {
            self._initState();
            self._readInputStream();
        });
    };

    module.exports = InboundStreamParser;

}());
