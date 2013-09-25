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

    function filterWriteStream(stream, filter) {
        var write = stream.write;
        
        stream.write = function (chunk, encoding, callback) {
            // Do not apply filters to buffers, just use them as they are
            if (!Buffer.isBuffer(chunk) && filter) {
                // The documentation specifies chunk to be of type String or Buffer.
                // Let's make sure it's a string anyway so we can use chunk.replace
                chunk = filter(String(chunk));
            }
            
            // Write the chunk to the stream
            return write.call(this, chunk, encoding, callback);
        };
    }

    function replaceBullet(string) {
        // Replace the character that might be turned into BEL
        return string.replace(/•/g, "·");
    }

    exports.filterWriteStream = filterWriteStream;
    exports.replaceBullet     = replaceBullet;
}());
