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
    var util = require("util"),
        generator = require("./lib/generator"),
        logger = require("./lib/logger"),
        Q = require("q"),
        optimist = require("optimist");

    var HEARTBEAT_DELAY = 10000, // one second
        heartbeatCount = 0;
    
    var optionParser = optimist["default"]({
        "p" : 49494,
        "h" : "localhost",
        "P" : "password",
        "i" : null,
        "o" : null,
        "f" : null,
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
            "f": "folder to search for plugins (can be used multiple times)",
            "l": "the logger server port",
            "help": "display help message"
        }).alias({
            "p": "port",
            "h": "host",
            "P": "password",
            "i": "input",
            "o": "output",
            "f": "pluginfolder",
            "l": "loggerport"
        }).argv;
    
    if (argv.help) {
        console.log(optimist.help());
        process.exit(0);
    }

    function stop(exitCode, reason) {
        if (!reason) {
            reason = "no reason given";
        }
        console.error("Exiting with code " + exitCode + ": " + reason);
        process.exit(exitCode);
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
                    logger.log("publish", envelope.channel, envelope.topic, data);
                });
                
                var folders = argv.pluginfolder;
                if (folders) {
                    if (!util.isArray(folders)) {
                        folders = [folders];
                    }
                    folders.forEach(function (f) {
                        theGenerator.loadAllPluginsInDirectory(f);
                    });
                }

                deferred.resolve(theGenerator);
            },
            function (err) {
                deferred.reject(err);
            }
        );
        
        return deferred.promise;
    }
    
    process.on("uncaughtException", function (err) {
        console.error(err.stack);
        stop(-1, "uncaught exception: " + err.message);
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
        function () {
            console.log("Generator initialized");
        },
        function (err) {
            stop(-3, "generator failed to initialize: " + err);
        }
    );

    // Routinely check if stdout is closed. Stdout will close when our
    // parent process closes (either expectedly or unexpectedly) so this
    // is our signal to shutdown to prevent process abandonment.
    process.stdout.on("end", function () {
        stop(-2, "received end on stdout");
    });

    process.stdout.on("error", function () {
        stop(-2, "async error writing to stdout");
    });

    if (!process.stdout.isTTY) {
        // We need to continually ping because that's the only way to actually
        // check if the pipe is closed in a robust way (writable may only get
        // set to false after trying to write a ping to a closed pipe).
        //
        // As an example, on OS X, doing "node app.js | cat" and then killing
        // the cat process with "kill -9" does *not* generate an end event
        // immediately. However, writing to the pipe generates an error event.
        setInterval(function () {
            if (!process.stdout.writable) {
                // If stdout closes, our parent process has terminated or
                // has explicitly closed it. Either way, we should exit.
                stop(-2, "stdout closed");
            } else {
                try {
                    process.stdout.write("PING " + (heartbeatCount++) + "\n");
                } catch (e) {
                    stop(-2, "sync error writing to stdout");
                }
            }
        }, HEARTBEAT_DELAY);
    }

}());
