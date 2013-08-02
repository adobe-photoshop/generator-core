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

    var _generator = null,
        id = "rtl-" + Math.floor(Math.random() * 1000000),
        rtlString = "معايير", // Translation of "standards"
        rtlStringBang = rtlString + "!",
        expectedHexString = "d985d8b9d8a7d98ad98ad8b121";


    function init(generator) {
        _generator = generator;

        // Append a "direction neutral" character "!" to the RTL string.
        // Should appear to the left of the string in the menu
        _generator.addMenuItem(id, rtlStringBang, true, false).then(
            function () {
                var actualHexString = (new Buffer(rtlStringBang)).toString("hex");
                console.log("Created RTL menu");
                console.log("hex representation of string: " + actualHexString);
                console.log("expected hex string: " + expectedHexString);
                if (actualHexString === expectedHexString) {
                    console.log("SUCCESS: Strings match!");
                } else {
                    console.log("ERROR: Strings don't match!");
                }
            }, function () {
                console.log("Failed to create RTL menu");
            }
        );
    }

    exports.init = init;

}());
