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

module.exports = function (grunt) {
    "use strict";
    
    grunt.initConfig({
        pkg : grunt.file.readJSON("package.json"),

        platform : process.platform === "darwin" ? "mac" : "win",

        jshint : {
            options : {
                jshintrc : ".jshintrc"
            },
            js : [
                "*.js",
                "lib/**/*.js",
                "test/**/*.js",
                "www/**/*.js",
                "!www/vendor/**/*.js"
            ],
            jsx : [
                "lib/**/*.jsx"
            ],
            json : [
                "package.json",
                ".jshintrc",
                ".jscsrc"
            ]
        },
        
        jscs: {
            js: "<%= jshint.js %>",
            jsx: [
                "<%= jshint.jsx %>",
                "!lib/jsx/getLayerSVG.jsx"
            ],
            options: {
                config: ".jscsrc"
            }
        },
        
        nodeunit : {
            all : ["test/test-*.js"]
        }

    });

    grunt.loadNpmTasks("grunt-contrib-jshint");
    grunt.loadNpmTasks("grunt-jscs");
    grunt.loadNpmTasks("grunt-contrib-nodeunit");

    grunt.registerTask("test", ["jshint", "jscs", "nodeunit"]);

    grunt.registerTask("default", ["test"]);

};
