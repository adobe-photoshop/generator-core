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

    var psCrypto = require("../lib/ps_crypto");

    var TEST_PASSWORD = "password";

    exports.testDerivedKey = function (test) {
        var expectedDerivedKey = new Buffer("Wy1Eaow07kT9WRDI/4Z8maubJmGcaG1F", "base64"),
            actualDerivedKey = psCrypto.createDerivedKey(TEST_PASSWORD);

        test.deepEqual(actualDerivedKey, expectedDerivedKey, "Incorrect derived key generated");
        test.done();
    };

    exports.testEncryptDecrypt = function (test) {
        test.expect(2);

        var derivedKey = psCrypto.createDerivedKey(TEST_PASSWORD),
            cipherStream = psCrypto.createCipherStream(derivedKey),
            decipherStream = psCrypto.createDecipherStream(derivedKey),
            testString = "test",
            startBuffer = new Buffer(testString, "utf8"),
            encryptedLength = psCrypto.encryptedLength(startBuffer.length);

        cipherStream.on("readable", function () {
            var b = cipherStream.read(encryptedLength);
            if (b) {
                test.notDeepEqual(b, startBuffer, "encrypted buffer same as start buffer");
                decipherStream.end(b);
            }
        });

        decipherStream.on("readable", function () {
            var b = decipherStream.read(startBuffer.length);
            if (b) {
                test.deepEqual(b, startBuffer, "starting and encrypted/decrypted buffer not equal");
                test.done();
            }
        });

        cipherStream.end(startBuffer);
    };

    function makeEncryptedLengthTestFunction(testLength) {
        return function (test) {
            test.expect(1);

            var expectedEncryptedLength = psCrypto.encryptedLength(testLength),
                derivedKey = psCrypto.createDerivedKey(TEST_PASSWORD),
                cipherStream = psCrypto.createCipherStream(derivedKey),
                cipheredBufferList = [];

            cipherStream.on("readable", function () {
                var b = cipherStream.read();
                if (b) {
                    cipheredBufferList.push(b);
                }
            });

            cipherStream.on("end", function () {
                var cipheredBuffer = Buffer.concat(cipheredBufferList);
                test.strictEqual(cipheredBuffer.length, expectedEncryptedLength,
                    "actual encrypted length does not match expected encrypted length"
                );
                test.done();
            });

            cipherStream.end(new Buffer(testLength));
        };
    }

    exports.encryptedLengthTests = {
        oneLess :         makeEncryptedLengthTestFunction(psCrypto.BLOCK_SIZE - 1),
        equal :           makeEncryptedLengthTestFunction(psCrypto.BLOCK_SIZE),
        oneMore :         makeEncryptedLengthTestFunction(psCrypto.BLOCK_SIZE + 1),
        TwoTimesOneLess : makeEncryptedLengthTestFunction(psCrypto.BLOCK_SIZE * 2 - 1),
        TwoTimes :        makeEncryptedLengthTestFunction(psCrypto.BLOCK_SIZE * 2),
        TwoTimesOneMore : makeEncryptedLengthTestFunction(psCrypto.BLOCK_SIZE * 2 + 1)
    };

}());