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
    
    var resolve = require("path").resolve,
        chmod = require("fs").chmodSync;

    grunt.initConfig({
        "pkg" : grunt.file.readJSON("package.json"),
        "platform" : process.platform === "darwin" ? "mac" : "win",
        "directories" : {
            "downloads" : "downloads/",
            "bin" : "bin/"
        },

        "jshint" : {
            "options" : {
                "jshintrc"   : ".jshintrc"
            },
            "all" : [
                "*.js",
                "package.json",
                ".jshintrc",
                "lib/**/*.js",
                "lib/jsx/**/*.jsx",
                "www/**/*.js",
                "!www/vendor/**/*.js"
            ]
        },
        
        "clean" : {
            "download" : ["<%= directories.downloads %>"],
            "bin" : ["<%= directories.bin %>"]
        },
        
        "node": {
            "version" : "0.8.23",
            "platform-urls" : {
                "mac" : "http://nodejs.org/dist/v<%= node.version %>/node-v<%= node.version %>-darwin-x64.tar.gz",
                "win" : "http://nodejs.org/dist/v<%= node.version %>/node.exe"
            },
            "url" : "<%= grunt.config('node.platform-urls.' + grunt.config('platform')) %>",
            "archiveFilename" : "<%= grunt.config('node.url').substr(grunt.config('node.url').lastIndexOf('/') + 1) %>",
            "archivePath" : "<%= directories.downloads %><%= node.archiveFilename %>",
            "extractedDirectory" : "node-v<%= node.version %>-darwin-x64/", // TODO: will need to be plantform-specific
            "platform-executables" : {
                "mac" : ["node"],
                "win" : ["node.exe"]
            },
            "platform-executables-dir" : {
                "mac" : "<%= directories.downloads %><%= node.extractedDirectory %>bin/",
                "win" : "<%= directories.downloads %><%= node.extractedDirectory %>"
            }
        },
        "curl-dir": {
            "node" : {
                "src" : "<%= node.url %>",
                "dest" : "<%= directories.downloads %>"
            }
        },
        
        "shell": {
            "untarNode" : {
                "command": "tar -xvzf <%= node.archiveFilename %>",
                "options": {
                    "stdout": true,
                    "stderr": true,
                    "failOnError": true,
                    "execOptions": {
                        "cwd": "<%= directories.downloads %>"
                    }
                }
            }
        }
        
    });

    grunt.loadNpmTasks("grunt-contrib-jshint");
    grunt.loadNpmTasks("grunt-contrib-copy");
    grunt.loadNpmTasks("grunt-contrib-clean");
    grunt.loadNpmTasks("grunt-shell");
    grunt.loadNpmTasks("grunt-curl");

    grunt.registerTask("default", ["jshint", "build"]);
        
    grunt.registerTask("build", "Top-level configure and build", function () {
        var platform = grunt.config("platform"),
            binDir = grunt.config("directories.bin"),
            executables = grunt.config("node.platform-executables")[platform];
        
        grunt.file.mkdir(binDir);
        
        var setupNode = false;
        executables.forEach(function (e) {
            setupNode = setupNode || !grunt.file.exists(binDir, e);
        });
        
        if (setupNode) {
            grunt.task.run("setup-node");
        } else {
            grunt.log.writeln("Node already set up");
        }
        
    });

    
    /* node setup and build tasks */
    
    grunt.registerTask("setup-node", ["download-node", "extract-node", "copy-node"]);
        
    grunt.registerTask("download-node", "Download node", function () {
        if (!grunt.file.exists(grunt.config("node.archivePath"))) {
            grunt.log.writeln("Downloading node");
            grunt.task.run("curl-dir:node");
        } else {
            grunt.log.writeln("node already downloaded");
        }
    });
                       
    grunt.registerTask("extract-node", "Extract node", function () {
        if (!grunt.file.exists(grunt.config("directories.downloads"), grunt.config("node.extractedDirectory"))) {
            if (/\.tar\.gz$/.test(grunt.config("node.archiveFilename"))) {
                grunt.task.run("shell:untarNode");
            } else if (/\.zip$/.test(grunt.config("node.archiveFilename"))) {
                grunt.fail.warn("Extracting ZIPs not yet implemented");
            } else if (/\.exe$/.test(grunt.config("node.archiveFilename"))) {
                grunt.log.writeln("node already extracted");
            } else {
                grunt.fail.warn("No rule for extracting archive file");
            }
        } else {
            grunt.log.writeln("node already extracted");
        }
    });
        
    grunt.registerTask("copy-node", "Copy node executables to bin", function () {
        var platform = grunt.config("platform"),
            binDir = grunt.config("directories.bin"),
            executables = grunt.config("node.platform-executables")[platform],
            executablesDir = grunt.config("node.platform-executables-dir")[platform];
        
        executables.forEach(function (e) {
            grunt.file.copy(
                resolve(executablesDir, e),
                resolve(binDir, e)
            );
            if (platform === "mac") {
                chmod(resolve(binDir, e), "755");
            }
        });
    });

};
