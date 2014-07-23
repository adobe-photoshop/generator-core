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
    
    /** @define{number} Number of ms to wait for the server to start */
    var SETUP_TIMEOUT = 5000; // wait up to 5 seconds for server to start
    
    var url               = require("url"),
        http              = require("http"),
        events            = require("events"),
        util              = require("util"),
        Q                 = require("q"),
        WebSocket         = require("ws"),
        ConnectionManager = require("./ConnectionManager"),
        DomainManager     = require("./DomainManager");

    /** 
     * @constructor
     * The Server module is a singleton object that manages both the
     * connection to the parent process (over stdin/stdout) and to clients
     * over WebSockets.
     *
     * Server inherits from the EventEmitter class and exports itself
     * as the module.
     */
    var Server = function (generator, logger) {
        events.EventEmitter.call(this);

        this._generator = generator;
        this._logger = logger;

        this._connectionManager = new ConnectionManager(logger);
        this._domainManager = new DomainManager(this._generator, this._logger, this._connectionManager);

        this._httpRequestHandler = this._httpRequestHandler.bind(this);
        this._setupHttpAndWebSocketServers = this._setupHttpAndWebSocketServers.bind(this);
    };
    util.inherits(Server, events.EventEmitter);
    
    /**
     * @private
     * @type{http.Server} the HTTP server
     */
    Server.prototype._httpServer = null;

    /**
     * @private
     * @type{ws.WebSocketServer} the WebSocket server
     */
    Server.prototype._wsServer = null;
  
    Server.prototype._httpRequestHandler = function (req, res) {
        if (req.method === "GET") {
            if (req.url === "/api" || req.url.indexOf("/api/") === 0) {
                if (req.headers.origin) {
                    var allowed;

                    if (req.headers.origin === "null" || req.headers.origin === "file://") {
                        allowed = req.headers.origin;
                    } else {
                        // Allow requests from localhost on any port
                        var origin = url.parse(req.headers.origin),
                            port = origin.port || 80,
                            host = origin.hostname === "localhost" ? "localhost" : "127.0.0.1";

                        allowed = origin.protocol + "//" + host + ":" + port;
                    }

                    res.setHeader("Access-Control-Allow-Origin", allowed);
                }

                res.setHeader("Content-Type", "application/json");
                res.end(
                    JSON.stringify(this._domainManager.getDomainDescriptions(),
                                    null,
                                    4)
                );
            } else {
                res.setHeader("Content-Type", "text/plain");
                res.end("Generator RPC Server\n");
            }
        } else { // Not a GET request
            res.statusCode = 501;
            res.end();
        }
    };
    
    Server.prototype._setupHttpAndWebSocketServers = function (port, callback, timeout) {
        var timeoutTimer = null;
        var httpServer = null;
            
        if (timeout) {
            timeoutTimer = setTimeout(function () {
                callback("ERR_TIMEOUT", null);
            }, timeout);
        }
    
        httpServer = http.createServer(this._httpRequestHandler);
        
        httpServer.on("error", function () {
            if (callback) {
                callback("ERR_CREATE_SERVER", null);
            }
        });
        
        httpServer.listen(port, "127.0.0.1", function () {
            var wsServer = null;
            var address = httpServer.address();
            if (address !== null) {
                httpServer.removeAllListeners("error");

                httpServer.on("error", function () {
                    this._logger.error("stopping due to HTTP error",
                                  arguments);
                    this.stop();
                }.bind(this));
                
                wsServer = new WebSocket.Server({server: httpServer});

                wsServer.on("error", function () {
                    this._logger.error(
                        "stopping due to WebSocket error",
                        arguments
                    );
                    this.stop();
                }.bind(this));

                wsServer.on("connection",
                    this._connectionManager.createConnection
                        .bind(this._connectionManager, this._domainManager));
                
                if (timeoutTimer) {
                    clearTimeout(timeoutTimer);
                }
                
                callback(null, {
                    httpServer : httpServer,
                    wsServer : wsServer,
                    port : address.port
                });
            } else {
                // address is null
                // this shouldn't happen, because if we didn't get a socket
                // we wouldn't have called this callback
                if (timeoutTimer) {
                    clearTimeout(timeoutTimer);
                }
                
                if (callback) {
                    callback("ERR_UNKNOWN", null);
                }
            }
        }.bind(this));
    };


    /**
     * Stops the server and does appropriate cleanup.
     * Emits an "end" event when shutdown is complete.
     */
    Server.prototype.stop = function () {
        if (this._wsServer) {
            try {
                this._wsServer.close();
            } catch (err1) {
                this._logger.warn("Error while closing websocket server: " + err1.message, err1.stack);
            }
        }
        if (this._httpServer) {
            try {
                this._httpServer.close();
            } catch (err2) {
                this._logger.warn("Error while closing http server: " + err2.message, err2.stack);
            }
        }
        this._connectionManager.closeAllConnections();

        this.emit("end");
        this.removeAllListeners();
    };
    
    /**
     * Starts the server.
     * 
     * @param {number=} port Optional port parameter
     */
    Server.prototype.start = function (port) {
        var deferred = Q.defer();
        // Do initialization

        this._setupHttpAndWebSocketServers(port, function (err, servers) {
            if (err) {
                this._logger.error(
                    "stopping due to error while starting http/ws servers: " + err
                );
                this.stop();
                deferred.reject(err);
                return;
            }

            this._httpServer = servers.httpServer;
            this._wsServer = servers.wsServer;

            deferred.resolve(servers.port);
        }.bind(this), SETUP_TIMEOUT);

        this._domainManager.loadDomainModulesFromPaths(["./BaseDomain"]);

        return deferred.promise;
    };

    module.exports = Server;
}());
