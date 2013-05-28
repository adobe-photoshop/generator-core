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

    function Pixmap(buffer) {
        if (!(this instanceof Pixmap)) {
            return new Pixmap(buffer);
        }

        this.format = buffer.readUInt8(0);
        this.width = buffer.readUInt32BE(1);
        this.height = buffer.readUInt32BE(5);
        this.rowBytes = buffer.readUInt32BE(9);
        this.colorMode = buffer.readUInt8(13);
        this.channelCount = buffer.readUInt8(14);
        this.bitsPerChannel = buffer.readUInt8(15);
        this.pixels = buffer.slice(16, 16 + this.width * this.height * this.channelCount);
        this.bytesPerPixel = this.bitsPerChannel / 8 * this.channelCount;
        this.padding = this.rowBytes - this.width * this.channelCount;
        this.readChannel = this.getReadChannel(this.bitsPerChannel);
        
        this._initGetPixelMethod(this.channelCount);
    }

    Pixmap.prototype.getReadChannel = function (bitsPerChannel) {
        if (16 === bitsPerChannel) {
            return Buffer.prototype.readUInt16BE;
        }
        if (8  === bitsPerChannel) {
            return Buffer.prototype.readUInt8;
        }
        if (32 === bitsPerChannel) {
            return Buffer.prototype.readUInt32BE;
        }
    };

    Pixmap.prototype.getPixel1 = function (n) {
        var pixel = this.getRawPixel(n);
        var grey = this.readChannel.call(pixel, 0);
        return {
            r: grey,
            g: grey,
            b: grey,
            a: 255
        };
    };

    Pixmap.prototype.getPixel3 = function (n) {
        var pixel = this.getRawPixel(n);
        return {
            r: this.readChannel.call(pixel, 2),
            g: this.readChannel.call(pixel, 1),
            b: this.readChannel.call(pixel),
            a: 255
        };
    };

    Pixmap.prototype.getPixel4 = function (n) {
        var pixel = this.getRawPixel(n);
        return {
            r: this.readChannel.call(pixel, 1),
            g: this.readChannel.call(pixel, 2),
            b: this.readChannel.call(pixel, 3),
            a: this.readChannel.call(pixel, 0)
        };
    };

    Pixmap.prototype._initGetPixelMethod = function (channelCount) {
        if (channelCount === 4) {
            this.getPixel = this.getPixel4;
        }
        if (channelCount === 3) {
            this.getPixel = this.getPixel3;
        }
        if (channelCount === 1) {
            this.getPixel = this.getPixel1;
        }
    };

    Pixmap.prototype.getRawPixel = function (n) {
        var i = n * this.bytesPerPixel;
        return this.pixels.slice(i, i + this.bytesPerPixel);
    };

    exports.Pixmap = Pixmap;
    exports.createPixmap = function (buffer) { return new Pixmap(buffer); };

}());