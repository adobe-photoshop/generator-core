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
        
    var util = require("util");
    
    /**
     * @constructor
     * DomainManager is a module/class that handles the loading, registration,
     * and execution of all commands and events. It is a singleton, and is passed
     * to a domain in its init() method.
     */
    var DomainManager = function (generator, logger, connectionManager) {
        this._generator = generator;
        this._logger = logger;
        this._connectionManager = connectionManager;

        this._domains = {};
        this._initializedDomainModules = [];
    };
    
    /**
     * @private
     * @type {object}
     * Map of all the registered domains
     */
    DomainManager.prototype._domains = null;

    /**
     * @private
     * @type {Array.<Module>}
     * Array of all modules we have loaded. Used for avoiding duplicate loading.
     */
    DomainManager.prototype._initializedDomainModules = null;

    /**
     * @private
     * @type {number}
     * Used for generating unique IDs for events.
     */
    DomainManager.prototype._eventCount = 1;

    /**
     * @private
     * @type {Array}
     * JSON.stringify-able Array of the current API. In the format of
     * Inspector.json. This is a cache that we invalidate every time the
     * API changes.
     */
    DomainManager.prototype._cachedDomainDescriptions = null;

    /**
     * @private
     * @type {Generator}
     */
    DomainManager.prototype._generator = null;

    /**
     * @private
     * @type {Logger}
     */
    DomainManager.prototype._logger = null;

    /**
     * @private
     * @type {ConnectionManager}
     */
    DomainManager.prototype._connectionManager = null;
    
    /**
     * Returns whether a domain with the specified name exists or not.
     * @param {string} domainName The domain name.
     * @return {boolean} Whether the domain exists
     */
    DomainManager.prototype.hasDomain = function (domainName) {
        return this._domains.hasOwnProperty(domainName);
    };
    
    /**
     * Returns a new empty domain. Throws error if the domain already exists.
     * @param {string} domainName The domain name.
     * @param {{major: number, minor: number}} version The domain version.
     *   The version has a format like {major: 1, minor: 2}. It is reported
     *   in the API spec, but serves no other purpose on the server. The client
     *   can make use of this.
     */
    DomainManager.prototype.registerDomain = function (domainName, version) {
        if (!this.hasDomain(domainName)) {
            // invalidate the cache
            this._cachedDomainDescriptions = null;
            
            this._domains[domainName] = {version: version, commands: {}, events: {}};
        } else {
            console.error("Domain " + domainName + " already registered");
        }
    };
    
    /**
     * Registers a new command with the specified domain. If the domain does
     * not yet exist, it registers the domain with a null version.
     * @param {string} domainName The domain name.
     * @param {string} commandName The command name.
     * @param {Function} commandFunction The callback handler for the function.
     *    The function is called with the arguments specified by the client in the
     *    command message. Additionally, if the command is asynchronous (isAsync
     *    parameter is true), the function is called with an automatically-
     *    constructed callback function of the form cb(err, result). The function
     *    can then use this to send a response to the client asynchronously.
     * @param {boolean} isAsync See explanation for commandFunction param
     * @param {?string} description Used in the API documentation
     * @param {?Array.<{name: string, type: string, description:string}>} parameters
     *    Used in the API documentation.
     * @param {?Array.<{name: string, type: string, description:string}>} returns
     *    Used in the API documentation.
     */
    DomainManager.prototype.registerCommand = function (domainName, commandName, commandFunction, isAsync,
        description, parameters, returns) {
        // invalidate the cache
        this._cachedDomainDescriptions = null;
        
        if (!this.hasDomain(domainName)) {
            this.registerDomain(domainName, null);
        }

        if (!this._domains[domainName].commands[commandName]) {
            this._domains[domainName].commands[commandName] = {
                commandFunction: commandFunction,
                isAsync: isAsync,
                description: description,
                parameters: parameters,
                returns: returns
            };
        } else {
            throw new Error("Command " + domainName + "." +
                commandName + " already registered");
        }
    };

    /**
     * Executes a command by domain name and command name. Called by a connection's
     * message parser. Sends response or error (possibly asynchronously) to the
     * connection.
     * @param {Connection} connection The requesting connection object.
     * @param {number} id The unique command ID.
     * @param {string} domainName The domain name.
     * @param {string} commandName The command name.
     * @param {Array} parameters The parameters to pass to the command function. If
     *    the command is asynchronous, will be augmented with a callback function.
     *    (see description in registerCommand documentation)
     */
    DomainManager.prototype.executeCommand = function (connection, id, domainName,
        commandName, parameters) {
        if (this._domains[domainName] &&
                this._domains[domainName].commands[commandName]) {
            var command = this._domains[domainName].commands[commandName];
            if (command.isAsync) {
                var callback = function (err, result) {
                    if (err) {
                        var message = (err && err.hasOwnProperty("message")) ? err.message : err,
                            stack = err && err.hasOwnProperty("stack") && err.stack;

                        connection.sendCommandError(id, message, stack);
                    } else {
                        connection.sendCommandResponse(id, result);
                    }
                };

                var progress = function (intermediate) {
                    connection.sendCommandProgress(id, intermediate);
                };

                parameters.push(callback);
                parameters.push(progress);

                command.commandFunction.apply(connection, parameters);
            } else { // synchronous command
                try {
                    connection.sendCommandResponse(
                        id,
                        command.commandFunction.apply(connection, parameters)
                    );
                } catch (e) {
                    connection.sendCommandError(id, e.message, e.stack);
                }
            }
        } else {
            connection.sendCommandError(id, "no such command: " +
                domainName + "." + commandName);
        }
    };

    /**
     * Registers an event domain and name.
     * @param {string} domainName The domain name.
     * @param {string} eventName The event name.
     * @param {?Array.<{name: string, type: string, description:string}>} parameters
     *    Used in the API documentation.
     */
    DomainManager.prototype.registerEvent = function (domainName, eventName, parameters) {
        // invalidate the cache
        this._cachedDomainDescriptions = null;
        
        if (!this.hasDomain(domainName)) {
            this.registerDomain(domainName, null);
        }

        if (!this._domains[domainName].events[eventName]) {
            this._domains[domainName].events[eventName] = {
                parameters: parameters
            };
        } else {
            console.error("Event " + domainName + "." + eventName + " already registered");
        }
    };

    /**
     * Emits an event with the specified name and parameters to all connections.
     *
     * TODO: Future: Potentially allow individual connections to register
     * for which events they want to receive. Right now, we have so few events
     * that it's fine to just send all events to everyone and decide on the
     * client side if the client wants to handle them.
     *
     * @param {string} domainName The domain name.
     * @param {string} eventName The event name.
     * @param {?Array} parameters The parameters. Must be JSON.stringify-able
     */
    DomainManager.prototype.emitEvent = function (domainName, eventName, parameters) {
        if (this._domains[domainName] && this._domains[domainName].events[eventName]) {
            this._connectionManager.sendEventToAllConnections(
                this._eventCount++,
                domainName,
                eventName,
                parameters
            );
        } else {
            console.error("No such event: " + domainName + "." + eventName);
        }
    };
    
    /**
     * Loads and initializes domain modules using the specified paths. Checks to
     * make sure that a module is not loaded/initialized more than once.
     *
     * @param {Array.<string>} paths The paths to load. The paths can be relative
     *    to the DomainManager or absolute. However, modules that aren't in core
     *    won't know where the DomainManager module is, so in general, all paths
     *    should be absolute.
     * @return {boolean} Whether loading succeded. (Failure will throw an exception).
     */
    DomainManager.prototype.loadDomainModulesFromPaths = function (paths) {
        var pathArray = paths;
        if (!util.isArray(paths)) {
            pathArray = [paths];
        }
        pathArray.forEach(function (path) {
            var m = require(path);
            if (m && m.init && this._initializedDomainModules.indexOf(m) < 0) {
                m.init(this, this._generator, this._logger);
                this._initializedDomainModules.push(m); // don't init more than once
            }
        }, this);
        return true; // if we fail, an exception will be thrown
    };
    
    /**
     * Returns a description of all registered domains in the format of WebKit's
     * Inspector.json. Used for sending API documentation to clients.
     *
     * @return {Array} Array describing all domains.
     */
    DomainManager.prototype.getDomainDescriptions = function () {
        if (!this._cachedDomainDescriptions) {
            this._cachedDomainDescriptions = [];
            
            var domainNames = Object.keys(this._domains);
            domainNames.forEach(function (domainName) {
                var d = {
                    domain: domainName,
                    version: this._domains[domainName].version,
                    commands: [],
                    events: []
                };
                var commandNames = Object.keys(this._domains[domainName].commands);
                commandNames.forEach(function (commandName) {
                    var c = this._domains[domainName].commands[commandName];
                    d.commands.push({
                        name: commandName,
                        description: c.description,
                        parameters: c.parameters,
                        returns: c.returns
                    });
                }, this);
                var eventNames = Object.keys(this._domains[domainName].events);
                eventNames.forEach(function (eventName) {
                    d.events.push({
                        name: eventName,
                        parameters: this._domains[domainName].events[eventName].parameters
                    });
                }, this);
                this._cachedDomainDescriptions.push(d);
            }, this);
        }
        return this._cachedDomainDescriptions;
    };

    module.exports = DomainManager;
}());
