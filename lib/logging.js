/*
 * Copyright (c) 2014 Adobe Systems Incorporated. All rights reserved.
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
        stream = require("stream"),
        EventEmitter = require("events").EventEmitter;

    Object.defineProperties(exports, {
        "LOG_LEVEL_NONE" : {
            value : 1,
            writable : false,
            enumerable : true
        },
        "LOG_LEVEL_ERROR" : {
            value : 2,
            writable : false,
            enumerable : true
        },
        "LOG_LEVEL_WARNING" : {
            value : 3,
            writable : false,
            enumerable : true
        },
        "LOG_LEVEL_INFO" : {
            value : 4,
            writable : false,
            enumerable : true
        },
        "LOG_LEVEL_DEBUG" : {
            value : 5,
            writable : false,
            enumerable : true
        }
    });


    /**
     * LoggerManager objects are EventEmitters that emit two events: "message" and "end"
     * 
     * "message" events have a single object as their data. That object has the following properties:
     *   source -- the ID of the plugin (or "core") from which the log event originated.
     *   level -- an integer corresponding to the log level constants defined on this module,
     *   time -- a Date object representing the time of the log event,
     *   callLocation -- an object containing "long" and "short" properties that contains long and short string
     *     representations of the location in the source where the log event was generated
     *   message -- the actual log message, possibly containing formatting caracters (e.g. "%d") for a
     *     string formatting function to use (he Logger itself doesn't do any string formatting).
     *   args -- an array of optional args, possibly used by a string format function
     *
     * "end" events do not have any data. An "end" event will be emitted at most once, in response
     *   to a call to Logger.prototype.end. No "message" events will be emitted after an "end" event.
     *
     * Log level can be set by assigning an int (corresponding to the log level constants defined in
     * this module) to the property "level".
     *
     * Log entries are initiated through Logger objects, which can be created by calling the
     * "createLogger" method on a LoggerManager object. Then, users can call the
     * Logger.prototype.error/warn/info/debug/warning/log functions, which are variadic. The first
     * argument is the log message, and any additional arguments are passed along in the "args" array.
     */
    function LoggerManager(level) {
        if (!(this instanceof LoggerManager)) {
            return new LoggerManager(level);
        }

        EventEmitter.call(this);

        // set the internal level variable to default
        var _logLevel = exports.LOG_LEVEL_WARNING;

        // define getter/setter for log level
        Object.defineProperty(this, "level", {
            enumerable: true,
            get: function () {
                return _logLevel;
            },
            set: function (val) {
                var newLevel = parseInt(val, 10); // coerce to int
                if (newLevel >= exports.LOG_LEVEL_NONE && newLevel <= exports.LOG_LEVEL_DEBUG) {
                    _logLevel = newLevel;
                }
            }
        });

        // use setter to (possibly) set the log level to caller's value
        this.level = level;

        var _ended = false;
        Object.defineProperty(this, "ended", {
            enumerable: true,
            get: function () {
                return _ended;
            }
        });
        this.end = function () {
            if (!_ended) {
                _ended = true;
                this.emit("end");
            }
        };
    }

    util.inherits(LoggerManager, EventEmitter);

    /**
     * Creates a new Logger object. All events coming from the returned Logger object
     * will have a source as specified in the "source" parameter. All log events
     * created by the returned Logger will be emitted by this LoggerManager.
     */
    LoggerManager.prototype.createLogger = function (source) {
        return new Logger(this, source);
    };

    function makeLogMethod(level) {
        return function () { // (message, arg1, ...)
            var message = arguments[0] || "",
                args = Array.prototype.slice.call(arguments, 1),
                callLocation = null,
                time = null;

            if (!this.manager.ended &&
                this.manager.level >= level &&
                EventEmitter.listenerCount(this.manager, "message") > 0) {
                
                callLocation = getCallLocationFromStackString((new Error()).stack, 1);
                time = new Date();

                this.manager.emit("message", {
                    source : this.source,
                    level : level,
                    time : time,
                    callLocation : callLocation,
                    message : message,
                    args : args
                });
            }
        };
    }

    /**
     * Logger objects are used to create log events. The constructor for Logger objects is
     * private (not accessible outside this module). Instead, they are created through the
     * LoggerManager.prototype.createLogger method.
     */
    function Logger(manager, source) {
        Object.defineProperties(this, {
            "manager" : {
                value : manager,
                writable : false,
                enumerable : true
            },
            "source" : {
                value : source,
                writable : false,
                enumerable : true
            }
        });
    }

    /**
     * Variadic logging methods. The first argument is the log message, and any additional
     * arguments are passed along in the "args" array in the log event.
     */
    Logger.prototype.debug   = makeLogMethod(exports.LOG_LEVEL_DEBUG);
    Logger.prototype.info    = makeLogMethod(exports.LOG_LEVEL_INFO);
    Logger.prototype.warn    = makeLogMethod(exports.LOG_LEVEL_WARNING);
    Logger.prototype.error   = makeLogMethod(exports.LOG_LEVEL_ERROR);
    Logger.prototype.warning = Logger.prototype.warn;
    Logger.prototype.log     = Logger.prototype.info;


    function levelToString(level) {
        switch (level) {
        case exports.LOG_LEVEL_ERROR:
            return "error";
        case exports.LOG_LEVEL_WARNING:
            return "warning";
        case exports.LOG_LEVEL_INFO:
            return "info";
        case exports.LOG_LEVEL_DEBUG:
            return "debug";
        default:
            return "";
        }
    }

    function dateToMilliTimeString(date) {
        function padString(s, places) {
            var i = places - s.length;
            while (i > 0) {
                s = "0" + s;
                i--;
            }
            return s;
        }

        return util.format("%s:%s:%s.%s",
            padString(String(date.getHours()), 2),
            padString(String(date.getMinutes()), 2),
            padString(String(date.getSeconds()), 2),
            padString(String(date.getMilliseconds()), 3)
        );
    }

    function getCallLocationFromStackString(stackString, entry) {
        // A stack string looks like this:
        //
        // Error
        //     at repl:1:15
        //     at REPLServer.self.eval (repl.js:110:21)
        //     at Interface.<anonymous> (repl.js:239:12)
        //     at Interface.EventEmitter.emit (events.js:95:17)
        //     at Interface._onLine (readline.js:202:10)

        var longLocation = "",
            shortLocation = "",
            line = stackString.split("\n")[entry + 1];

        if (line) {
            var i = line.indexOf("at ");
            if (i >= 0) { // have an actual location
                longLocation = line.substr(i + 3); // "at " is 3 chars long
                // longLocation will look like one of the following:
                //
                //   "repl:1:6"
                // or
                //   "EventEmitter.error (/some/place/on/disk/this.js:153:13)"
                //
                // If there is something in parens, we want the stuff after the last / (or if there isn't
                // a slash, then just everything in the parens). If there are no parens, we just want
                // the whole thing

                shortLocation = longLocation;

                var parenLocation = shortLocation.indexOf("(");

                if (parenLocation >= 0) {
                    shortLocation = shortLocation.substr(parenLocation + 1, shortLocation.length - parenLocation - 2);
                }

                var slashLocation = shortLocation.lastIndexOf("/");

                if (slashLocation >= 0) {
                    shortLocation = shortLocation.substr(slashLocation + 1);
                }
            }
        }

        return {long: longLocation, short: shortLocation};

    }

    /**
     * StreamFormatter objects are Readable streams. They output a string represntation
     * of the log events generated by the "logger" variable.
     *
     * The "options" argument is passed directly to the stream.Readable constructor.
     * No configuration of the log format is supported at this time.
     */
    function StreamFormatter(loggerManager, options) {
        if (!(this instanceof StreamFormatter)) {
            return new StreamFormatter(loggerManager, options);
        }

        stream.Readable.call(this, options);
        this._buffer = [];
        this._pushable = false;
        this._ended = false;
        loggerManager.on("message", this._handleMessage.bind(this));
        loggerManager.on("end", function () { this._handleMessage("END"); }.bind(this));
    }
    util.inherits(StreamFormatter, stream.Readable);

    StreamFormatter.prototype._doRead = function () {
        var entry = null,
            entryString = null,
            messageArgs = [];

        while (this._pushable && this._buffer.length > 0) {
            entry = this._buffer.shift();
            if (entry === "END") {
                this.push(null); // EOF
                this._pushable = false;
                this._ended = true;
            } else {
                entryString = util.format("[%s:%s %s %s] ",
                    levelToString(entry.level),
                    entry.source,
                    dateToMilliTimeString(entry.time),
                    entry.callLocation.short
                );

                messageArgs = entry.args.concat(); // copy args array
                messageArgs.unshift(entry.message); // add format string to beginning
                entryString += util.format.apply(null, messageArgs);

                entryString += "\n";

                this._pushable = this.push(entryString);
            }
        }
    };

    StreamFormatter.prototype._handleMessage = function (entry) {
        if (!this._ended) {
            this._buffer.push(entry);
            this._doRead();
        }
    };

    StreamFormatter.prototype._read = function () { // (size)
        this._pushable = true;
        this._doRead();
    };

    exports.LoggerManager = LoggerManager;
    exports.createLoggerManager = function (level) { return new LoggerManager(level); };

    exports.levelToString = levelToString;
    exports.dateToMilliTimeString = dateToMilliTimeString;

    exports.StreamFormatter = StreamFormatter;
    exports.createStreamFormatter = function (loggerManager, options) {
        return new StreamFormatter(loggerManager, options);
    };

}());
