/*jslint vars: true, plusplus: true, devel: true, nomen: true, indent: 4, maxerr: 50, node: true */

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