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

/* jshint node: false, browser: true, jquery: true */
/* global define */

require.config({
    paths: {
        "text"      : "vendor/require-text"
    }
});

// Flag set to avoid repeating the close message over and over
// if the node process dies.
var SocketClosedErrorDisplayed = false;
var SocketClosedErrorMessage = "WebSocket closed in client";

define(function (require) {
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
        
        SocketClosedErrorDisplayed = (SocketClosedErrorDisplayed &&
            ((logEntry.type === "error") ||
                logEntry.msg === SocketClosedErrorMessage));
        
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
        $entry.on("click", function () {
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
