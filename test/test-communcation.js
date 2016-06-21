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

    var // photoshop = require("../lib/photoshop/client"),
        OutboundMessage = require("../lib/photoshop/outbound-message"),
        psCrypto = require("../lib/photoshop/ps-crypto");

    exports.testUnencryptedJSMessage = function (test) {
        test.expect(1);

        var jsString = "1+1",
            id = 7,
            expectedMessage = new Buffer(
                "00000013" + // message length
                "00000000" + // comm status okay
                "00000001" + // protocol version (1)
                "00000007" + // message ID (7)
                "00000002" + // javascript message type (2)
                "312b31",     // utf8 encoding of "1+1"
                "hex"
            ),
            messageBufferList = [],
            messageStream = new OutboundMessage(jsString, id, null);

        messageStream.on("readable", function () {
            var b;
            while (true) {
                b = messageStream.read();
                if (b) {
                    messageBufferList.push(b);
                } else {
                    break;
                }
            }
        });

        messageStream.on("end", function () {
            var actualMessage = Buffer.concat(messageBufferList);
            test.deepEqual(actualMessage, expectedMessage, "actual and expected message do not match");
            test.done();
        });

    };

    exports.testLongEncryptedJSMessage = function (test) {
        test.expect(4);

        var HEADER_LENGTH = 8,
            LENGTH_OFFSET = 0,
            STATUS_OFFSET = 4,
            COMM_OKAY = 0;

        var ONE_MB_BUFFER = new Buffer(1024 * 1024);
        ONE_MB_BUFFER.fill("a");

        var ONE_MB_STRING = ONE_MB_BUFFER.toString();

        var id = 8,
            expectedDecipheredPayload = new Buffer(ONE_MB_BUFFER.length + 12),
            derivedKey = psCrypto.createDerivedKey("password"),
            decipherStream = psCrypto.createDecipherStream(derivedKey),
            messageStream = new OutboundMessage(ONE_MB_STRING, id, derivedKey),
            messageBufferList = [],
            decipherBufferList = [];

        expectedDecipheredPayload.writeUInt32BE(1, 0);     // protocol version
        expectedDecipheredPayload.writeUInt32BE(id, 4);    // message ID
        expectedDecipheredPayload.writeUInt32BE(2, 8);     // message type
        ONE_MB_BUFFER.copy(expectedDecipheredPayload, 12); // body

        messageStream.on("readable", function () {
            var b;
            while (true) {
                b = messageStream.read();
                if (b) {
                    messageBufferList.push(b);
                } else {
                    break;
                }
            }
        });

        messageStream.on("end", function () {
            var actualCipheredMessage = Buffer.concat(messageBufferList),
                actualHeader = actualCipheredMessage.slice(0, HEADER_LENGTH),
                actualCipheredPayload = actualCipheredMessage.slice(HEADER_LENGTH);

            var actualLength = actualHeader.readUInt32BE(LENGTH_OFFSET);
            // length does not include the portion of the message that specifies length;
            test.strictEqual(actualLength, actualCipheredMessage.length - STATUS_OFFSET,
                "message does not have correct length"
            );

            var commStatus = actualHeader.readInt32BE(STATUS_OFFSET);
            test.strictEqual(commStatus, COMM_OKAY, "comm status not set to COMM_OKAY");

            test.notDeepEqual(actualCipheredPayload, expectedDecipheredPayload,
                "message was not encrypted (ciphered message and expected message are equal)"
            );

            decipherStream.end(actualCipheredPayload);
        });


        decipherStream.on("readable", function () {
            var b;
            while (true) {
                b = decipherStream.read();
                if (b) {
                    decipherBufferList.push(b);
                } else {
                    break;
                }
            }
        });

        decipherStream.on("end", function () {
            var actualPayload = Buffer.concat(decipherBufferList);
            test.deepEqual(actualPayload, expectedDecipheredPayload, "actual and expected payload do not match");
            test.done();
        });




    };

}());
