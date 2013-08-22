(function () {
    "use strict";

    var fs      = require("fs"),
        resolve = require("path").resolve;

    var LOG_SIZE_LIMIT = 50 * 1024 * 1024; // 50 MB

    var REGULAR_LOG_NAMES = [
        "generator_latest.txt",
        "generator_1.txt",
        "generator_2.txt",
        "generator_3.txt",
        "generator_4.txt"
    ];

    var EXCEPTION_LOG_NAME = "generator_exceptions.txt";

    var _logDir,
        _logBytesWritten = 0;

    function handleUncaughtException(err) {
        var logFile = resolve(_logDir, EXCEPTION_LOG_NAME);

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

    // Use tail -F logs/generator_latest.txt to see the latest output

    var logFilePaths = [];

    function writeToLog(data) {
        logFilePaths.forEach(function (path) {
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
            // Write to STDOUT right away
            write.apply(this, arguments);
            
            // We stopped logging in a previous call to write: return now
            if (_logBytesWritten > LOG_SIZE_LIMIT) { return; }

            // Format the string
            data = String(data);
            if (colorFunction) {
                data = colorFunction(String(data));
            }
            
            // Calculate the new log file size
            _logBytesWritten += Buffer.byteLength(data, "utf8");

            // Limit not yet reached: write to log file
            if (_logBytesWritten > LOG_SIZE_LIMIT) {
                writeToLog("The log file size limit of " + LOG_SIZE_LIMIT + " bytes was reached." +
                    " No further output will be written to this file.");
                return;
            }
            
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

    function rotateLogs() {
        var i;
        for (i = REGULAR_LOG_NAMES.length - 1; i > 0; i--) {
            try {
                fs.renameSync(
                    resolve(_logDir, REGULAR_LOG_NAMES[i - 1]),
                    resolve(_logDir, REGULAR_LOG_NAMES[i])
                );
            } catch (e) { }
        }
    }

    function setup(settings) {
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

        rotateLogs();
        
        logFilePaths.push(resolve(_logDir, REGULAR_LOG_NAMES[0]));

        logStream(process.stdout);
        // Print output via STDERR in red
        logStream(process.stderr, function (string) {
            return "\x1B[1;31m" + string + "\x1B[0m";
        });

        writeToLog("Log file created on " + new Date() + "\n\n");
    }

    exports.setup = setup;
}());