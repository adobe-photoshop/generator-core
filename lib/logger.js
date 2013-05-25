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
    
    var http = require("http"),
        connect = require("connect"),
        WebSocketServer = require("ws").Server,
        path = require("path"),
        url = require("url");
    
    var _logHistory = [];
    var _logCount = 0;
    var _connnections = [];
    var _server = null;
    
    function log(type, source, msg, data) {
        var stringifyableData = null;
        try {
            JSON.stringify(data);
            stringifyableData = data;
        } catch (e1) {
            stringifyableData = "ERROR: Unable to stringify log data";
        }
                
        var entry = { id : _logCount++,
                      time: new Date(),
                      type: type,
                      source: source,
                      msg : msg,
                      data: stringifyableData
                    };
        
        try {
            var s = JSON.stringify(entry, null, "    ");
            if (s.length > 0) {
                _logHistory.push(s);
                // TODO: check log size, cull entries if necessary
                var liveConnections = [];
                var deadConnections = [];
                
                // Send messages to all connections
                _connnections.forEach(function (ws) {
                    try {
                        ws.send(s);
                        liveConnections.push(ws);
                    } catch (sendErr) {
                        deadConnections.push(ws);
                    }
                });

                // Clean up dead connections
                deadConnections.forEach(function (ws) {
                    try {
                        ws.close();
                    } catch (closeErr) {
                        // do nothing
                    }
                });
                _connnections = liveConnections;
                
            }
        } catch (e2) {
            console.error("Unable to stringify log entry", e2);
        }
    }
            
    function logUrlHandler(req, res, next) {
        var parsedUrl = url.parse(req.url, true);
        
        if (parsedUrl.pathname === "/log") {
            var start = parsedUrl.query ? Number(parsedUrl.query.start) : undefined;
            if (isNaN(start) || !isFinite(start)) {
                start = undefined;
            }

            var end = parsedUrl.query ? Number(parsedUrl.query.end) : undefined;
            if (isNaN(end) || !isFinite(end)) {
                end = undefined;
            }
            res.setHeader("Content-Type", "application/json");
            res.write("[");
            res.write(
                _logHistory
                    .slice(start, end)
                    .filter(function (value) { return (typeof value === "string" && value.length > 0); })
                    .join(",\n")
            );
            res.end("]");
        } else {
            next();
        }
    }
    
    function stopServer(callback) {
        if (_server) {
            try {
                _server.close(callback);
            } catch (e) {
                // do nothing
            }
            _server = null;
        }
    }
    
    function startServer(port, hostname, callback) {
        if (_server) {
            stopServer();
        }
        
        var app = connect();
        app.use(connect["static"](path.resolve(__dirname, "../www")));
        app.use(logUrlHandler);
        
        var server = http.createServer(app);
        
        function serverErrorHandler(err) {
            console.err("Error in logger http server, closing server:", err);
            stopServer();
        }
        
        function httpStartupErrorHandler(err) {
            callback(err);
        }
        
        function httpStartupSuccessHandler() {
            _server = server;
            
            // Remove the startup error handler and install a general error handler
            server.removeListener("error", httpStartupErrorHandler);
            server.addListener("error", serverErrorHandler);
            
            // Start the websocket server
            var wss = new WebSocketServer({server: server});
            wss.on("connection", function (ws) {
                _connnections.push(ws);
            });
            
            // Finish startup process
            callback(null, server.address());
        }
        
        server.once("error", httpStartupErrorHandler);
        server.once("listening", httpStartupSuccessHandler);
        server.listen(port, hostname);
        
    }
    
    exports.log = log;
    exports.startServer = startServer;
    exports.stopServer = stopServer;
    
}());