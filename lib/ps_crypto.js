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
    
    var crypto = require("crypto");
    
    // Constants
    // ---------
    
    var SALT = "Adobe Photoshop",
        NUM_ITERATIONS = 1000,
        ALGORITHM = "des-ede3-cbc",
        KEY_LENGTH = 24,
        IV = new Buffer("000000005d260000", "hex"); // 0000 0000 5d26 0000    
    
    /**
     * PSCrypto Class
     * 
     * @constructor
     */
    function PSCrypto(derivedKey) {
        this._derivedKey = derivedKey;
    }
    
    PSCrypto.prototype.decipher = function (buf) {
        var d = crypto.createDecipheriv(ALGORITHM, this._derivedKey, IV);
        return new Buffer(d.update(buf, "binary", "binary") + d.final("binary"), "binary");
    };
    
    PSCrypto.prototype.cipher = function (buf) {
        var c = crypto.createCipheriv(ALGORITHM, this._derivedKey, IV);
        return new Buffer(c.update(buf, "binary", "binary") + c.final("binary"), "binary");
    };

    // Factory Functions
    // -----------------
    
    function createPSCrypto(password, callback) {
        crypto.pbkdf2(password, SALT, NUM_ITERATIONS, KEY_LENGTH, function (err, derivedKey) {
            if (err) {
                callback(err, null);
            } else {
                callback(null, new PSCrypto(derivedKey));
            }
        });
    }

    
    // Public Interface
    // ================
    
    exports.createPSCrypto = createPSCrypto;
    
}());
