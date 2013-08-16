(function () {
    "use strict";

    var fs      = require("fs"),
        resolve = require("path").resolve;


    var _logDir;


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

    var logFilePaths = [];

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
            write.apply(this, arguments);
            
            data = String(data);
            if (colorFunction) {
                data = colorFunction(String(data));
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

        // Also create log files for all output (STDOUT + STDERR)
        // Create one that is easy to use with tail (_latest.log)
        // Create another that is easy to attach to emails (timestamped)
        var _latestLogFile      = resolve(_logDir, "_latest.log");
        var _timeStampedLogFile = resolve(_logDir, timeString() + ".log");
        
        // Delete an existing latest log file 
        try {
            if (fs.existsSync(_latestLogFile)) {
                fs.unlinkSync(_latestLogFile);
            }
        } catch (e) {
            // Do nothing except report the Error
            console.error(e);
        }
        
        logFilePaths.push(_latestLogFile, _timeStampedLogFile);

        logStream(process.stdout);
        // Print output via STDERR in red
        logStream(process.stderr, function (string) {
            return "\x1B[1;31m" + string + "\x1B[0m";
        });

        writeToLog("Log file created on " + new Date() + "\n\n");
    }

    exports.setup = setup;
}());