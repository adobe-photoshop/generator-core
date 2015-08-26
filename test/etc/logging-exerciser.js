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

/**
 * This file does not contain unit tests. It's simply a script that can be run with node
 * to exercise some of the functionality of the logger.
 */

(function () {
    "use strict";

    var logging = require("../../lib/logging");

    var loggerManager = new logging.LoggerManager(),
        logger = loggerManager.createLogger("exerciser");

    var formatter = new logging.StreamFormatter(loggerManager);
    formatter.on("end", function () { console.log("it's over!"); });
    formatter.pipe(process.stdout);

    logger.warn("testing string formatting %d %s %j", 1, "2", {a : 3}, {b : 4});

    function one() {
        function two() {
            function three() {
                logger.warn("inside function three");
            }
            three();
        }
        two();
    }
    one();

    setTimeout(function () {
        logger.log("log from timer, calling logger.end");
        loggerManager.end();
        logger.log("this shouldn't log");
    }, 1000);

    logger.error("\n\nsetting level to LOG_LEVEL_DEBUG");
    loggerManager.level = logging.LOG_LEVEL_DEBUG;
    logger.debug("debug");
    logger.info("info");
    logger.warn("warn");
    logger.error("error");
    logger.warning("warning/warn");
    logger.log("log/info");

    logger.error("\n\nsetting level to LOG_LEVEL_INFO");
    loggerManager.level = logging.LOG_LEVEL_INFO;
    logger.debug("debug");
    logger.info("info");
    logger.warn("warn");
    logger.error("error");
    logger.warning("warning/warn");
    logger.log("log/info");

    logger.error("\n\nsetting level to LOG_LEVEL_WARNING");
    loggerManager.level = logging.LOG_LEVEL_WARNING;
    logger.debug("debug");
    logger.info("info");
    logger.warn("warn");
    logger.error("error");
    logger.warning("warning/warn");
    logger.log("log/info");

    logger.error("\n\nsetting level to LOG_LEVEL_ERROR");
    loggerManager.level = logging.LOG_LEVEL_ERROR;
    logger.debug("debug");
    logger.info("info");
    logger.warn("warn");
    logger.error("error");
    logger.warning("warning/warn");
    logger.log("log/info");

    logger.error("\n\nsetting level to LOG_LEVEL_NONE");
    loggerManager.level = logging.LOG_LEVEL_NONE;
    logger.debug("debug");
    logger.info("info");
    logger.warn("warn");
    logger.error("error");
    logger.warning("warning/warn");
    logger.log("log/info");

    logger.error("\n\nsetting level to LOG_LEVEL_DEBUG (this won't be printed)");
    loggerManager.level = logging.LOG_LEVEL_DEBUG;

}());
