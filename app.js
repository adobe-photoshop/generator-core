/*jslint vars: true, plusplus: true, devel: true, nomen: true, indent: 4, maxerr: 50, node: true */

(function () {
    "use strict";
    var http = require("http"),
        net = require("net"),
        fs = require("fs"),
        generator = require("./lib/generator"),
        logger = require("./lib/logger"),
        async = require("async"),
        version = require("./package.json").version;
    
    var optimist = require("optimist");
    
    var optionParser = optimist["default"]({
        "p" : 49494,
        "h" : "localhost",
        "P" : "password",
        "i" : null,
        "o" : null,
        "l" : 49495,
        "t" : 500
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
            "t": "time before timeout in milliseconds",
            "help": "display help message"
        }).alias({
            "p": "port",
            "h": "host",
            "P": "password",
            "i": "input",
            "o": "output",
            "l": "loggerport",
            "t": "timeout"
        }).argv;
    
    if (argv.help) {
        console.log(optimist.help());
        process.exit(0);
    }
    
    function setupLogger(callback) {
        logger.startServer(argv.loggerport, "localhost", function (err, address) {
            if (err) {
                console.error("Error starting logger:", err);
                callback(null, null);
            } else {
                console.log("Logger listening at http://localhost:%d", address.port);
                callback(null, address);
            }
        });
    }
    
    function setupGenerator(callback) {
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
        
        options.timeout = argv.timeout;
        
        theGenerator.start(options).then(
            function () {
                logger.log("init", "app", "Generator started!", null);
                /*
                var enablePlugins = argv.use ? argv.use.split(" ") : false;
                var disablePlugins = argv.nuse ? argv.nuse.split(" ") : [];
                var activePlugins = theGenerator.loadPlugins(enablePlugins, disablePlugins);
                logger.log("init", "app", "loaded plugins", activePlugins);
                */
                theGenerator.subscribe("#", function (data, envelope) {
                    var args = Array.prototype.slice.call(arguments, 0);
                    logger.log("publish", envelope.channel, envelope.topic, data);
                });
                callback(null, theGenerator);
            },
            function (err) {
                console.error("Error starting Generator:", err);
                callback(err, null);
            }
        );
    }
    
    process.on("uncaughtException", function (err) {
        console.error("Terminating - Uncaught exception: %s", err.message);
        console.error(err.stack);
        process.exit(-1);
    });
    
    async.series([
        setupLogger,
        setupGenerator
    ], function (err, results) {
        if (err) {
            process.exit(-1);
        }
    });
    
}());