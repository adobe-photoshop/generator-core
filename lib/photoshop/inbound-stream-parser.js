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

    var EventEmitter = require("events").EventEmitter,
        stream = require("stream"),
        util = require("util");

    var CONSTANTS = require("./constants").CONSTANTS,
        psCrypto = require("./ps-crypto");

    // TEMP
    var superdebug = require("./constants").superdebug;

    /**
     * Constructor for InputStreamParser
     * A state machine that watches an inputStream, and emits "payload" events whenever
     * a message and payload header have been evaluated.  This event includes the parsed
     * payload metadata, and a readable stream of the decrypted payload bytes.
     *
     * @constructor
     * @param {stream.Readable} inputStream raw stream from photoshop pipe/socket
     * @param {Buffer} derivedKey crypto key for deciphering photoshop payload
     */
    var InboundStreamParser = function (inputStream, derivedKey) {
        this._inputStream = inputStream;
        this._derivedKey = derivedKey;

        this._initState();

        this._inputStream.once("readable", this._readInputStream.bind(this));
    };

    util.inherits(InboundStreamParser, EventEmitter);

    /**
     * Raw readable stream from photoshop connection
     *
     * @private
     * @type {stream.Readable}
     */
    InboundStreamParser.prototype._inputStream = null;

    /**
     * Collection of stateful properties which govern the stream parsing
     *
     * @private
     * @type {object}
     */
    InboundStreamParser.prototype._readState = null;

    /**
     * Reset all stateful properties to defaults
     *
     * @return {[type]}
     */
    InboundStreamParser.prototype._initState = function () {
        this._readState = {
            messageHeaderRead: false, // message manager
            payloadInspected: false, // payload manager
            payloadWatching: false, // payload manager
            decipherStreamDirty: false,
            payloadLength: null,
            payloadBytesRead: null,
            payloadDecipherStream: null,
            payloadTempBuffer: null, // because unshifting to a transform stream is not reliable
            payloadMetadata: null,
            clearPayloadStream: null
        };
    };

    /**
     * Read bytes from the input stream and use internal state to determine what to do with them.
     *
     * This is The Main Cog in the Machine
     *
     * @private
     */
    InboundStreamParser.prototype._readInputStream = function () {
        var self = this,
            state = self._readState,
            buf;

        // Skip reading the input stream if we're waiting for a previous decipher stream to finish
        // When the decipher is complete, it will re-call this function then
        if (state.decipherStreamDirty) {
            superdebug("Skipping _readInputStream because decipherStreamDirty");
            return;
        }

        // Read from stream
        buf = this._inputStream.read();

        // Stream empty, wait for next readable event
        if (!buf) {
            this._inputStream.once("readable", this._readInputStream.bind(this));
            return;
        }

        superdebug("reading buffer size %d: ", buf.length, buf);

        if (!state.messageHeaderRead) {
            if (this._processMessageHeader(buf)) {
                state.messageHeaderRead = true;
                this._setupDecipherStream();
            }
        } else {
            this._processMessagePayload(buf);
        }
        this._readInputStream();
    };

    /**
     * Read bytes and try to parse the message header.
     * If buffer does not contain entire header, returns false (and unshifts buffer back to stream)
     *
     * @param {Buffer} buf
     * @return {boolean}
     */
    InboundStreamParser.prototype._processMessageHeader = function (buf) {
        var state = this._readState,
            messageHeaderBuffer;

        if (buf.length === CONSTANTS.MESSAGE_HEADER_LENGTH) {
            messageHeaderBuffer = buf;
        } else if (buf.length > CONSTANTS.MESSAGE_HEADER_LENGTH) {
            var remainder = buf.slice(CONSTANTS.MESSAGE_HEADER_LENGTH);
            superdebug("unshifting remainder %O", remainder);
            this._inputStream.unshift(remainder);
            messageHeaderBuffer = buf.slice(0, CONSTANTS.MESSAGE_HEADER_LENGTH);
        } else {
            // Need to wait for the full message header.  unshift entire buffer and return false
            superdebug("Buffer does not contain full header, try again later");
            this._inputStream.unshift(buf);
            return false;
        }

        superdebug("messageHeaderBuffer %O", messageHeaderBuffer);

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
        superdebug("payload length %d", state.payloadLength);

        return true;
    };

    /**
     * Process payload bytes by writing to decipher stream.
     * Watch for payload boundary, unshifting to inputStream if read past
     * Signal 'end' to decipher stream.
     *
     * @param {Buffer} buf
     */
    InboundStreamParser.prototype._processMessagePayload = function (buf) {
        var state = this._readState;

        superdebug("reading message payload. %d of %d, with %d remaining", buf.length, state.payloadLength,
            state.payloadBytesRead);

        var remainingBytes = state.payloadLength - state.payloadBytesRead,
            extraBytes = buf.length - remainingBytes,
            endOfPayload = false,
            payloadBuffer = buf;

        if (extraBytes === 0) {
            superdebug("buffer is exactly the size of the payload");
            endOfPayload = true;
        } else if (extraBytes > 0) {
            endOfPayload = true;
            this._inputStream.unshift(buf.slice(remainingBytes));
            payloadBuffer = buf.slice(0, remainingBytes);
        }

        state.payloadBytesRead += payloadBuffer.length;

        if (endOfPayload) {
            superdebug("End of Payload; Setting decipherStreamDirty");
            //this._inputStream.pause();
            state.payloadDecipherStream.end(payloadBuffer);
            state.decipherStreamDirty = true;
        } else {
            state.payloadDecipherStream.write(payloadBuffer);
        }
    };

    /**
     * Read the deciphered payload stream
     * Append temp buffer if exists
     * Parse payload header (first 12 bytes)
     *
     * @param {boolean=} force optional, if true, ignore empty buffer from stream, and try to process the temp Buffer
     */
    InboundStreamParser.prototype._readDecipherStream  = function (force) {
        var state = this._readState,
            payloadBuffer = state.payloadDecipherStream.read();

        // No bytes read, listen for the stream to become readable again
        if (!payloadBuffer && !force) {
            superdebug("decipher stream  - no bytes read - register handler again");
            state.payloadDecipherStream.once("readable", this._readDecipherStream.bind(this));
            return;
        }

        // Push the temp buffer on to the head of the payload stream, if it exists
        if (state.payloadTempBuffer) {
            payloadBuffer = payloadBuffer ?
                Buffer.concat([state.payloadTempBuffer, payloadBuffer]) :
                state.payloadTempBuffer;
            state.payloadTempBuffer = null;
        }

        superdebug("processing decipher stream.  is inspected? %s.  buffer size %d", state.payloadInspected,
            payloadBuffer.length, payloadBuffer);

        if (!state.payloadInspected) {
            if (payloadBuffer.length > CONSTANTS.PAYLOAD_HEADER_LENGTH) {
                var remainder = payloadBuffer.slice(CONSTANTS.PAYLOAD_HEADER_LENGTH);
                superdebug("processing oversized payload header, pseudo unshifting reminder (%s), %O",
                    remainder.length, remainder);
                state.payloadTempBuffer = remainder;
                payloadBuffer = payloadBuffer.slice(0, CONSTANTS.PAYLOAD_HEADER_LENGTH);
            } else if (payloadBuffer.length < CONSTANTS.PAYLOAD_HEADER_LENGTH) {
                // Need to wait for the full message header?
                // maybe something like this...
                superdebug("pseudo unshifting incomplete payload header %O", payloadBuffer);
                state.payloadTempBuffer = payloadBuffer;
                return this._readDecipherStream();
            }

            var protocolVersion = payloadBuffer.readUInt32BE(CONSTANTS.PAYLOAD_PROTOCOL_OFFSET),
                messageID = payloadBuffer.readUInt32BE(CONSTANTS.PAYLOAD_ID_OFFSET),
                messageType = payloadBuffer.readUInt32BE(CONSTANTS.PAYLOAD_TYPE_OFFSET);

            superdebug("processing payload header, %d - %d - %d ", protocolVersion, messageID, messageType);

            state.payloadMetadata = {
                protocolVersion: protocolVersion,
                messageID: messageID,
                messageType: messageType
            };

            state.payloadInspected = true;
        } else {
            superdebug("writing to clearPayloadStream %d", payloadBuffer.length);
            state.clearPayloadStream.write(payloadBuffer);
            if (!state.payloadWatching) {
                this._watchPayload();
            }
        }

        // and then...
        this._readDecipherStream();
    };

    /**
     * Deciphering stream set up
     * Create and Register listeners for payloadDeciptherStream.
     * Create clearPayloadStream as PassThrough, call end on payloadDeciptherStream end
     *
     * @private
     */
    InboundStreamParser.prototype._setupDecipherStream = function () {
        var state = this._readState;

        // set up clear message readable stream
        state.clearPayloadStream = new stream.PassThrough();

        // set up decipher stream
        if (this._derivedKey) {
            state.payloadDecipherStream = psCrypto.createDecipherStream(this._derivedKey);
        } else {
            state.payloadDecipherStream = new stream.PassThrough();
        }

        state.payloadDecipherStream.once("readable", this._readDecipherStream.bind(this));

        state.payloadDecipherStream.on("end", function () {
            superdebug("end of payloadDecipherStream");

            // since readDecipherStream() short-circuits when read() returns null, it is
            // necessary to forcibly read the remaining temp buffer, if it exists
            if (state.payloadTempBuffer) {
                superdebug("payloadDecipherStream has ended, but there is data in payloadTempBuffer!! %d",
                    state.payloadTempBuffer.length, state.payloadTempBuffer);
                this._readDecipherStream(true);
            }

            // For empty payloads it might be necessary to _watchPayload here
            if (!state.payloadWatching) {
                superdebug("payloadDecipherStream has ended, but message hasn't been emitted, doing that now");
                this._watchPayload();
            }

            state.clearPayloadStream.end();
        }.bind(this));
    };

    // Emit 'payload' event, and watch for the clearPayloadStream's "end" event so we can reset the
    // internal state
    InboundStreamParser.prototype._watchPayload = function () {
        var state = this._readState,
            self = this;

        superdebug("Watching payload...");

        state.payloadWatching = true;
        
        this.emit("payload", state.payloadMetadata, state.clearPayloadStream);

        state.clearPayloadStream.once("end", function () {
            self._initState();
            self._readInputStream();
        });
    };

    module.exports = InboundStreamParser;

}());
