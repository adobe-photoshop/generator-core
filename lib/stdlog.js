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

/*
 * NOTE: A portion of this logger code shares implementation details with
 * the logger in the "node-core" of Brackets. That logger was also written
 * by me (Joel Brandt) while employed by Adobe and is also licensed under
 * the same license (MIT).
 */

(function () {
    "use strict";

    var fs      = require("fs"),
        resolve = require("path").resolve,
        util         = require("util");


    // Constants
    // =========
    var LOG_PRECEDENCE = ["log", "dir", "info", "warn", "error"],
        DEFAULT_LOG_LEVEL = "error";

    // Logger class
    // ============

    /** 
     * @constructor
     * The Logger module is a singleton object used for logging.
     * Logger inherits from the EventEmitter class and exports itself
     * as the module.
     */
    function Logger(level) {
        if (!(this instanceof Logger)) {
            return new Logger();
        }
        this.setLogLevel(level || DEFAULT_LOG_LEVEL);
    }
    
    // Private methods
    // ---------------

    /**
     * @private
     * Helper function for logging functions. Handles string formatting.
     * @param {string} level Log level ("log", "info", etc.)
     * @param {Array.<Object>} Array of objects for logging. Works identically
     *    to how objects can be passed to console.log. Uses util.format to
     *    format into a single string.
     */
    Logger.prototype._logAtLevel = function (level, args) {
        if (LOG_PRECEDENCE.indexOf(level) >= this._logLevel) {
            var message = util.format.apply(null, args),
                timestamp = new Date(),
                prefix = "";

            try {
                prefix = "[" + level + ": " + timestamp.toLocaleTimeString() + "] ";
            } catch (prefixError) { }

            try {
                if (level === "error") {
                    process.stderr.write(prefix + message + "\n");
                    process.stderr.write((new Error()).stack + "\n");
                } else {
                    process.stdout.write(prefix + message + "\n");
                }
            } catch (outputError) { }
        }
    };

    // Public interface
    // ----------------
    
    /**
     * Set the level at which log calls are printed to standard output
     * @param {string} level One of log", "dir", "info", "warn", "error"
     */
    Logger.prototype.setLogLevel = function (level) {
        // If a level is not specified or does not match a string
        // in the precedence list, then _logLevel will be set to -1,
        // which will result in everything being logged (which is 
        // the desired behavior)
        this._logLevel = LOG_PRECEDENCE.indexOf(level);
    };

    /**
     * Log a "log" message
     * @param {...Object} log arguments as in console.log etc.
     *    First parameter can be a "format" string.
     */
    Logger.prototype.log = function () { this._logAtLevel("log", arguments); };

    /**
     * Log an "info" message
     * @param {...Object} log arguments as in console.log etc.
     *    First parameter can be a "format" string.
     */
    Logger.prototype.info = function () { this._logAtLevel("info", arguments); };

    /**
     * Log a "warn" message
     * @param {...Object} log arguments as in console.log etc.
     *    First parameter can be a "format" string.
     */
    Logger.prototype.warn = function () { this._logAtLevel("warn", arguments); };

    /**
     * Log an "error" message
     * @param {...Object} log arguments as in console.log etc.
     *    First parameter can be a "format" string.
     */
    Logger.prototype.error = function () { this._logAtLevel("error", arguments); };

    /**
     * Log a "dir" message
     * @param {...Object} log arguments as in console.dir
     *    Note that (just like console.dir) this does NOT do string
     *    formatting using the first argument.
     */
    Logger.prototype.dir = function () {
        // dir does not do optional string formatting
        var args = Array.prototype.slice.call(arguments, 0);
        args.unshift("%j");
        this._logAtLevel("dir", args);
    };
    
    /**
     * Remaps the console.log, etc. functions to the logging functions
     * defined in this module. Useful so that modules can simply call
     * console.log to call into this Logger (since client doesn't have)
     * access to stdout.
     */
    Logger.prototype.remapConsole = function () {
        // Reassign logging functions to our logger
        // NOTE: console.timeEnd uses console.log and console.trace uses
        // console.error, so we don't need to change it explicitly
        console.log   = this.log.bind(this);
        console.info  = this.info.bind(this);
        console.warn  = this.warn.bind(this);
        console.error = this.error.bind(this);
        console.dir   = this.dir.bind(this);
    };
        
    // Helper functions
    // ================

    var _logFilePaths = [],
        _logger = null,
        _logDir = null;

    // logs/_exceptions.log
    
    function handleUncaughtException(err) {
        var logFile = resolve(_logDir, "_exceptions.log");

        var lines = [];
        lines.push("Uncaught exception on " + new Date() + ":");
        if (!err) {
            lines.push("Error value was " + JSON.stringify(err));
        } else if (err.stack) {
            lines.push("Error trace: " + err.stack);
        } else {
            lines.push("Error object: " + JSON.stringify(err, null, "    "));
        }
        lines.push("", "");
        lines = lines.join("\n");

        console.error(lines);

        try {
            fs.appendFileSync(logFile, lines);
        } catch (e) {
            // do nothing
        }
    }

    // logs/_latest.log
    // logs/<timestamp>.log

    // Use tail -F logs/_latest.log to see the latest output
    // The timestamped files can more easily be sent to the developers


    function padLeft(value, length, padding) {
        while (value.length < length) {
            value = padding + value;
        }
        return value;
    }

    function timeString(date) {
        date = date || new Date();

        var year    = date.getFullYear(),
            month   = padLeft(date.getMonth() + 1, 2, " "),
            day     = padLeft(date.getDate(), 2, " "),
            hours   = padLeft(date.getHours(), 2, " "),
            minutes = padLeft(date.getMinutes(), 2, " "),
            seconds = padLeft(date.getSeconds(), 2, " ");

        return [year, "-", month, "-", day, "_", hours, ".", minutes, ".", seconds].join("");
    }

    function writeToLog(data) {
        _logFilePaths.forEach(function (path) {
            try {
                fs.appendFileSync(path, data);
            } catch (e) {
                // do nothing
            }
        });
    }

    function logStream(stream, colorFunction) {
        var write = stream.write;
        
        stream.write = function (data) {
            try {
                write.apply(this, arguments);
            } catch (streamWriteError) { }
            
            try {
                data = String(data);
                if (colorFunction) {
                    data = colorFunction(String(data));
                }
            } catch (colorError) { }

            writeToLog(data);
        };
    }

    // Define the log directory as an array so we can easily create the individual
    // subdirectories if necessary, without requiring an external library like mkdirp
    function getLogDirectoryElements(settings) {
        var elements,
            platform = process.platform;

        if (platform === "darwin") {
            elements = [process.env.HOME, "Library", "Logs", settings.vendor, settings.application, settings.module];
        }
        else if (platform === "win32") {
            elements = [process.env.APPDATA, settings.vendor, settings.application, settings.module, "logs"];
        }
        else {
            elements = [process.env.HOME, settings.vendor, settings.application, settings.module, "logs"];
        }
        
        return elements;
    }

    function createDirectoryWithElements(elements) {
        var path = elements.shift();

        // Assume the first element exists
        while (elements.length) {
            path = resolve(path, elements.shift());
            if (!fs.existsSync(path)) {
                fs.mkdirSync(path);
            }
        }

        return path;
    }

    function setup(settings) {
        _logger = new Logger(settings.level);
        _logger.remapConsole();

        try {
            // Create the log file directory
            _logDir = createDirectoryWithElements(getLogDirectoryElements(settings));
        } catch (e) {
            // Do nothing except report the error
            console.error(e);
        }

        console.log("Log directory:", _logDir);

        // The directory now exists, so we can log exceptions there
        process.on("uncaughtException", handleUncaughtException);

        // Also create log files for all output (STDOUT + STDERR)
        // Create one that is easy to use with tail (_latest.log)
        // Create another that is easy to attach to emails (timestamped)
        var _latestLogFile      = resolve(_logDir, "_latest.log");
        
        
        // Delete an existing latest log file 
        try {
            if (fs.existsSync(_latestLogFile)) {
                fs.unlinkSync(_latestLogFile);
            }
        } catch (e) {
            // Do nothing except report the Error
            console.error(e);
        }
        
        _logFilePaths.push(_latestLogFile);

        logStream(process.stdout);
        // Print output via STDERR in red
        logStream(process.stderr, function (string) {
            return "\x1B[1;31m" + string + "\x1B[0m";
        });

        writeToLog("Log file created on " + new Date() + "\n\n");
    }

    function setLogLevel(level) {
        if (_logger) {
            _logger.setLogLevel(level);
        }
    }

    function addLogFile(filename) {
        _logFilePaths.push(resolve(_logDir, filename));
    }

    function addTimeStampedLogFile(directory) {
        if (!directory) {
            directory = ".";
        }
        var _timeStampedLogFile = resolve(_logDir, directory, timeString() + ".log");
        _logFilePaths.push(_timeStampedLogFile);
    }

    function processConfig(config) {
        if (config) {
            if (config.level) {
                setLogLevel(config.level);
            }
            if (config.keep) {
                addTimeStampedLogFile();
            }
            if (config.logfile) {
                addLogFile(config.logfile);
            }
        }
    }

    exports.setup = setup;
    exports.setLogLevel = setLogLevel;
    exports.addLogFile = addLogFile;
    exports.addTimeStampedLogFile = addTimeStampedLogFile;
    exports.processConfig = processConfig;

}());