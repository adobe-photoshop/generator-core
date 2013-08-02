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

    var merge = require("../lib/config")._merge;

    exports.testMerge = function (test) {
        test.deepEqual(
            merge({}, {a : 1}),
            {a : 1},
            "merge into empty"
        );

        test.deepEqual(
            merge({a : 1}, {}),
            {a : 1},
            "merge empty into filled"
        );

        test.deepEqual(
            merge({a : 1}, {a : 2}),
            {a : 2},
            "merge overwrite"
        );

        test.deepEqual(
            merge({a : 1}, {a : {b : 2}}),
            {a : {b : 2}},
            "merge overwrite primitive with object"
        );

        test.deepEqual(
            merge({a : {b : 1}}, {a : 2}),
            {a : 2},
            "merge overwrite object with primitive"
        );

        test.deepEqual(
            merge({a : {b : 1}}, {a : {c : 2}}),
            {a : {b : 1, c : 2}},
            "merge recursive"
        );

        test.deepEqual(
            merge({a : {b : 1, c: 3}}, {a : {b : 2, d : 4}}),
            {a : {b : 2, c : 3, d : 4}},
            "merge recursive with overwrite"
        );

        test.deepEqual(
            merge(1, {a : {b : 2, d : 4}}),
            1,
            "merge into primitive"
        );

        test.deepEqual(
            merge({a : 1}, 1),
            {a : 1},
            "merging in primitive is noop"
        );

        var a = {a : 1},
            b = {b : 2},
            c = merge(a, b);
            
        test.strictEqual(a, c, "src modified in place");
        test.deepEqual(a, {a : 1, b : 2}, "src modified in place correctly");

        test.done();

    };
}());