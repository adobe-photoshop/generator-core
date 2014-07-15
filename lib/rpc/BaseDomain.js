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

/*jslint vars: true, plusplus: true, devel: true, nomen: true, indent: 4,
  maxerr: 50, node: true */

(function () {
    "use strict";
    
    /**
     *
     * Registers commands with the DomainManager
     * @param {DomainManager} domainManager The DomainManager to use
     */
    function init(domainManager, generator, logger) {

        /**
         * @private
         * Implementation of base.loadDomainModulesFromPaths
         * @param {Array.<string>} paths Paths to load
         * @return {boolean} Whether the load succeeded
         */
        var cmdLoadDomainModulesFromPaths = function (paths) {
            var success = domainManager.loadDomainModulesFromPaths(paths);
            if (success) {
                domainManager.emitEvent("base", "newDomains");
            }
            return success;
        };

        domainManager.registerDomain("base", {major: 0, minor: 1});
        domainManager.registerCommand(
            "base",
            "loadDomainModulesFromPaths",
            cmdLoadDomainModulesFromPaths,
            false,
            "Attempt to load command modules from the given paths. " +
                "The paths should be absolute.",
            [{name: "paths", type: "array<string>"}],
            [{name: "success", type: "boolean"}]
        );

        domainManager.registerEvent(
            "base",
            "log",
            [
                {name: "level", type: "string"},
                {name: "timestamp", type: "Date"},
                {name: "message", type: "string"}
            ]
        );
        
        logger.manager.on(
            "message",
            function (event) {
                domainManager.emitEvent(
                    "base",
                    "log",
                    [
                        event.source,
                        event.level,
                        event.time,
                        event.callLocation,
                        event.message,
                        event.args
                    ]
                );
            }
        );
        
        domainManager.registerEvent("base", "newDomains", []);
    }
    
    exports.init = init;
}());
