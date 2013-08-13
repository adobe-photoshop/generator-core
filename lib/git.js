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
    
    function logGitInformation(prefix, directory) {
        var fs       = require("fs"),
            resolve  = require("path").resolve,
            gitDir   = resolve(directory, ".git"),
            headFile = resolve(gitDir, "HEAD");
        
        try {
            if (!fs.existsSync(gitDir)) {
                console.log("%s No Git repository found", prefix);
                return;
            }
            if (!fs.statSync(gitDir).isDirectory()) {
                console.warn("%s .git is not a directory", prefix);
                return;
            }
            if (!fs.existsSync(headFile)) {
                console.warn("%s Did not find HEAD file", prefix);
                return;
            }

            var head    = fs.readFileSync(headFile).toString(),
                match   = head.match(/ref:\s*([^\r\n]+)/),
                ref     = match[1],
                refFile = resolve(gitDir, ref);
            
            if (!match) {
                console.error("%s Could not interpret HEAD file with contents %j", prefix, head);
                return;
            }

            console.log("%s Git HEAD ref: %j", prefix, ref);
            
            if (!fs.existsSync(refFile)) {
                console.error("%s Git ref file %j does not exist", prefix, refFile);
                return;
            }
                
            console.log("%s Git commit hash: %j", prefix, fs.readFileSync(refFile).toString().trim());
        }
        catch (e) {
            console.error("%s Error while reading Git information: %s", prefix, e.stack);
        }
    }

    exports.logGitInformation = logGitInformation;
    
}());