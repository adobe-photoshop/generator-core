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

    var Connection = require("./Connection");

    /**
     * @constructor
     */
    var ConnectionManager = function (logger) {
        this._logger = logger;
        this._connections = {};
    };

    /**
     * @private
     * @type{Logger}
     */
    ConnectionManager.prototype._logger = null;


    /**
     * @private
     * @type{Object.<string, Connection>}
     * Currently active connections
     */
    ConnectionManager.prototype._connections = null;

    /**
     * @private
     * @type {number}
     */
    ConnectionManager.prototype._connectionIdCounter = 0;

    /**
     * Factory function for creating a new Connection
     * 
     * @param {DomainManager} domainManager
     * @param {WebSocket} ws The WebSocket connected to the client.
     */
    ConnectionManager.prototype.createConnection = function (domainManager, ws) {
        var connections = this._connections,
            connectionId = ++this._connectionIdCounter,
            connection = new Connection(ws, this._logger);

        connections[connectionId] = connection;

        connection.once("close", function () {
            delete connections[connectionId];
            connection.removeAllListeners();
        });

        connection.on("command", function (id, domain, command, parameters) {
            try {
                domainManager.executeCommand(connection, id, domain, command, parameters);
            } catch (ex) {
                connection.sendCommandError(id, ex.message, ex.stack);
            }
        });
    };
    
    /**
     * Closes all connections gracefully. Should be called during shutdown.
     */
    ConnectionManager.prototype.closeAllConnections = function () {
        Object.keys(this._connections).forEach(function (id) {
            try {
                this._connections[id].close();
            } catch (err) { }
        }, this);

        this._connections = {};
    };
    
    /**
     * Sends all open connections the specified event
     * @param {number} id unique ID for the event.
     * @param {string} domain Domain of the event.
     * @param {string} event Name of the event
     * @param {object} parameters Event parameters. Must be JSON.stringify-able.
     */
    ConnectionManager.prototype.sendEventToAllConnections = function (id, domain, event, parameters) {
        Object.keys(this._connections).forEach(function (id) {
            var connection = this._connections[id];
            connection.sendEventMessage(id, domain, event, parameters);
        }, this);
    };
    
    module.exports = ConnectionManager;
}());
