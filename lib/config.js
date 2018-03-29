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

    var resolve = require("path").resolve,
        home = process.env[(process.platform === "win32") ? "USERPROFILE" : "HOME"],
        cwd = process.cwd(),
        // locations are listed from lowest to highest precedence
        configLocations = [
            resolve(home, ".generator.json"),
            resolve(home, ".generator.js"),
            resolve(home, "generator.json"),
            resolve(home, "generator.js"),
            resolve(cwd,  ".generator.json"),
            resolve(cwd,  ".generator.js"),
            resolve(cwd,  "generator.json"),
            resolve(cwd,  "generator.js")
        ],
        config = null;

    // Does a merge of the properties of src into dest. Dest is modified and returned (though the
    // return value can be safely ignored). If src and dest are not both objects, then dest is not
    // modified.
    //
    // Important: This is *not* a deep copy and should not be treated as such. Sub-objects of
    // src may get added to dest by reference. So, changing sub-properties of src after calling merge
    // may change dest.
    function merge(dest, src) {
        if (dest instanceof Object && src instanceof Object) {
            Object.keys(src).forEach(function (key) {
                if (!dest[key] || !(dest[key] instanceof Object && src[key] instanceof Object)) {
                    dest[key] = src[key];
                } else { // both objects, so merge
                    merge(dest[key], src[key]);
                }
            });
        }
        return dest;
    }

    function getConfig() {
        if (!config) {
            config = {};
            configLocations.forEach(function (loc) {
                try {
                    var addition = require(loc);
                    if (addition && addition instanceof Object) {
                        merge(config, addition);
                    }
                    console.log("Parsed config file: " + loc);
                } catch (e) {
                    // do nothing
                }
            });
        }
        return config;
    }

    exports.getConfig = getConfig;

    // for unit tests
    exports._merge = merge;

}());
