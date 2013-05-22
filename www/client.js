/*jslint vars: true, plusplus: true, devel: true, nomen: true, indent: 4, maxerr: 50, browser: true */
/*global require, define, $, WebSocket */

require.config({
    paths: {
        "text"      : "vendor/require-text"
    }
});

// Flag set to avoid repeating the close message over and over
// if the node process dies.
var SocketClosedErrorDisplayed = false;
var SocketClosedErrorMessage = "WebSocket closed in client";

define(function (require, exports, module) {
    "use strict";

    var CHECK_CONNECTION_INTERVAL = 1000; // milliseconds
        
    var Mustache = require("vendor/mustache"),
        entryTemplate = Mustache.compile(require("text!templates/entry.html"));
    
    var _websocket = null;

    function display(logEntry) {
        if (logEntry.data) {
            if (typeof logEntry.data !== "string") {
                logEntry.dataString = JSON.stringify(logEntry.data, null, "  ");
            } else {
                logEntry.dataString = logEntry.data;
            }
        } else {
            logEntry.dataString = "None";
        }

        if (logEntry.time) {
            logEntry.time = new Date(logEntry.time);
            logEntry.timeString = logEntry.time.toLocaleTimeString();
        }
        
        var $entry = $(entryTemplate(logEntry));
        
        SocketClosedErrorDisplayed = (SocketClosedErrorDisplayed
                               && ((logEntry.type === "error")
                                   || logEntry.msg === SocketClosedErrorMessage));
        
        switch (logEntry.type) {
        case "plugin":
            $entry.addClass((logEntry.msg.search(/^[Ee]rror/) < 0) ? "plugin" : "error");
            break;
        case "init":
            $entry.addClass("warning");
            break;
        case "action":
        case "publish":
            $entry.addClass("info");
            break;
        case "error":
            $entry.addClass("error");
            break;
        default:
            break;
            
        }
        $entry.on('click', function () {
            $("#log-data-" + logEntry.id).toggleClass("hidden");
        });

        $("#log").prepend($entry);
    }
    
    function connectWebSocket(messageHandler, connectionHandler) {
        var protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
        var url = protocol + "//" + window.location.host;
                
        function errorHandler() {
            display({
                id : -1,
                time : new Date(),
                type : "error",
                source : "logger",
                msg : "WebSocket error in client",
                data : Array.prototype.slice.call(arguments, 0)
            });
        }
        
        function closeHandler() {
            if (!SocketClosedErrorDisplayed) {
                display({
                    id : -1,
                    time : new Date(),
                    type : "error",
                    source : "logger",
                    msg : SocketClosedErrorMessage,
                    data : Array.prototype.slice.call(arguments, 0)
                });
            }
            SocketClosedErrorDisplayed = true;
        }
        
        _websocket = new WebSocket(url);
        _websocket.onopen = connectionHandler;
        _websocket.onmessage = messageHandler;
        _websocket.onerror = errorHandler;
        _websocket.onclose = closeHandler;
    }
    
    
    function receive(msg) {
        try {
            var logEntry = JSON.parse(msg.data);
            display(logEntry);
        } catch (e) {
            console.error("Error parsing message", msg, e);
        }
    }
    
    function displayLogHistory() {
        var p = $.getJSON("/log");
        p.done(function (data) {
            try {
                data.forEach(display);
            } catch (e) {
                console.error("Error displaying log history", e);
            }
        });
        p.fail(function () {
            console.error("Error getting log history", arguments);
        });
    }
        
    function initConnection() {
        displayLogHistory();
    }
    
    $.ajaxSetup({cache: false});
                  
    $(function () {
        function doConnectIfNecessary() {
            if (!_websocket || _websocket.readyState === WebSocket.CLOSED) {
                connectWebSocket(receive, initConnection);
            }
        }
        setInterval(doConnectIfNecessary, CHECK_CONNECTION_INTERVAL);
        doConnectIfNecessary();
    });
    
});
