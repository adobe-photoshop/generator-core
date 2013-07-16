(function () {
    "use strict";

    var fs      = require("fs"),
        resolve = require("path").resolve;


    var _logDir = resolve(__dirname, "..", "logs");

    // logs/_exceptions.log

    process.on("uncaughtException", function (err) {
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

        fs.appendFileSync(logFile, lines.join("\n"));
    });


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
            fs.appendFileSync(path, data);
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

    function init() {
        if (!fs.existsSync(_logDir)) {
            fs.mkdirSync(_logDir);
        }

        var _latestLogFile      = resolve(_logDir, "_latest.log");
        var _timeStampedLogFile = resolve(_logDir, timeString() + ".log");
        
        if (fs.existsSync(_latestLogFile)) {
            fs.unlinkSync(_latestLogFile);
        }
        
        logFilePaths.push(_latestLogFile, _timeStampedLogFile);

        logStream(process.stdout);
        // Print output via STDERR in red
        logStream(process.stderr, function (string) {
            return "\x1B[1;31m" + string + "\x1B[0m";
        });

        writeToLog("Log file created on " + new Date() + "\n\n");
    }

    init();

}());