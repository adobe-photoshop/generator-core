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

    var MENU_ID = "version-test",
        MENU_STRING = "This menu should not appear because this plugin is incompatible with generator-core version";


    function init(generator) {
        // Append a "direction neutral" character "!" to the RTL string.
        // Should appear to the left of the string in the menu
        generator.addMenuItem(MENU_ID, MENU_STRING, true, false).then(
            function () {
                console.error("Created version test menu. This should not happen. " +
                    "Plugin should not be initialized because it is incompatible with generator-core version.");
            }, function () {
                console.error("Failed to create version test menu. This should not happen. " +
                    "Plugin should not be initialized because it is incompatible with generator-core version.");
            }
        );
    }

    exports.init = init;

}());
