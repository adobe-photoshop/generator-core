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

/*jslint vars: true, plusplus: true, devel: true, nomen: true, indent: 4, maxerr: 50, node: true */

(function () {
    "use strict";
    var http = require("http"),
        net = require("net"),
        fs = require("fs"),
        generator = require("./lib/generator"),
        logger = require("./lib/logger"),
        Q = require("q"),
        version = require("./package.json").version;
    
    var optimist = require("optimist");
    
    var optionParser = optimist["default"]({
        "p" : 49494,
        "h" : "localhost",
        "P" : "password",
        "i" : null,
        "o" : null,
        "l" : 49495
    });
    
    var argv = optionParser
        .usage("Run generator service.\nUsage: $0")
        .describe({
            "p": "the Photoshop server port",
            "h": "the Photoshop server host",
            "P": "the Photoshop server password",
            "i": "file descriptor of input pipe",
            "o": "file descriptor of output pipe",
            "l": "the logger server port",
            "help": "display help message"
        }).alias({
            "p": "port",
            "h": "host",
            "P": "password",
            "i": "input",
            "o": "output",
            "l": "loggerport"
        }).argv;
    
    if (argv.help) {
        console.log(optimist.help());
        process.exit(0);
    }
    
    function startLogServer() {
        var deferred = Q.defer();
        logger.startServer(argv.loggerport, "localhost", function (err, address) {
            if (err) {
                deferred.reject(err);
            } else {
                deferred.resolve(address);
            }
        });
        return deferred.promise;
    }
    
    function setupGenerator() {
        var deferred = Q.defer();
        var theGenerator = generator.createGenerator();

        var options = {};
        if (typeof argv.input === "number" && typeof argv.output === "number") {
            options.inputFd = argv.input;
            options.outputFd = argv.output;
            options.password = null; // No encryption over pipes
        } else if (typeof argv.port === "number" && argv.host && argv.password) {
            options.port = argv.port;
            options.host = argv.host;
            options.password = argv.password;
        }
                
        theGenerator.start(options).then(
            function () {
                logger.log("init", "app", "Generator started!", null);

                theGenerator.subscribe("#", function (data, envelope) {
                    var args = Array.prototype.slice.call(arguments, 0);
                    logger.log("publish", envelope.channel, envelope.topic, data);
                });
                
                
                deferred.resolve(theGenerator);
            },
            function (err) {
                deferred.reject(err);
            }
        );
        
        return deferred.promise;
    }
    
    process.on("uncaughtException", function (err) {
        console.error("Terminating - Uncaught exception: %s", err.message);
        console.error(err.stack);
        process.exit(-1);
    });
    
    startLogServer().done(
        function (address) {
            console.log("Log server running at http://localhost:" + address.port);
        },
        function (err) {
            console.error("Error starting log server:", err);
        }
    );
                          
    setupGenerator().done(
        function (generator) {
            console.log("Generator initialized");
        },
        function (err) {
            console.error("Generator failed to initialize:", err);
            console.error("Exiting...");
            process.exit("-1");
        }
    );

}());
