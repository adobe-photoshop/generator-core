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
    
    var Q = require("q"),
        photoshop = require("./photoshop"),
        util = require("util"),
        xpm = require("./xpm");
    
    var _instanceCount = 0;
    
    var RE_PLUGIN_FOLDER_NAME_MATCHER = /\.generate$/;

    var REQUEST_TIMEOUT = 5000; // milliseconds. TODO: Make configurable
    
    function rejectAfter(deferred, timeout) {
        var rejectTimer = setTimeout(function () {
            rejectTimer = null;
            deferred.reject(new Error("timeout"));
        }, timeout);

        deferred.promise.finally(function () {
            if (rejectTimer) {
                clearTimeout(rejectTimer);
            }
        });
    }


    function Generator() {
        if (!this instanceof Generator) {
            return new Generator();
        }
        // TODO: declare these as prototype properties and document types
        this._photoshop = null;
        this._instanceID = _instanceCount++;
        this._channel = require("postal")().channel("generator-" + (this._instanceID));
        this._jsMessageDeferreds = [];
        this._pixmapMessageDeferreds = [];
    }
    
    function createGenerator() {
        return new Generator();
    }
    
    Generator.prototype.start = function (options) {
        var self = this;
        
        function connectToPhotoshop() {
            var connectionDeferred = Q.defer();
            self._photoshop = photoshop.createClient(options);
            self._photoshop.once("connect", function () {
                connectionDeferred.resolve(self);
            });

            self._photoshop.on("error", function (err) {
                // TODO: Gracefully shut down
                self.publish("photoshop.error", err);
            });

            self._photoshop.on("communicationsError", function (err, rawMessage) {
                self.publish("photoshop.communcationsError", {error: err, rawMessage: rawMessage});
            });

            self._photoshop.on("message", function (messageID, parsedValue) { // ,rawMessage)
                self.publish("photoshop.message", {id: messageID, body: parsedValue});
                if (self._jsMessageDeferreds[messageID]) {
                    self._jsMessageDeferreds[messageID].resolve(parsedValue);
                }
            });

            self._photoshop.on("info", function (info) {
                console.log("got ps info:", info);
                self.publish("photoshop.info", info);
            });

            self._photoshop.on("event", function (messageID, eventName, parsedValue) { // , rawMessage)
                self.publish("photoshop.event." + eventName, parsedValue);
            });

            self._photoshop.on("pixmap", function (messageID, messageBody) { // , rawMessage)
                self.publish("photoshop.pixmap", {id: messageID});
                if (self._pixmapMessageDeferreds[messageID]) {
                    self._pixmapMessageDeferreds[messageID].resolve(messageBody);
                }
            });

            return connectionDeferred.promise;
        }
        
        return (connectToPhotoshop().then(
            function () {
                self.subscribeToPhotoshopEvents(
                    ["imageChanged",
                    "currentDocumentChanged",
                    "save",
                    "layerChanged",
                    "generatorMenuChanged"]
                );

                // Example of how to call getPhotoshopPath
                self.getPhotoshopPath().then(
                    function (p) { // success
                        self.publish("generator.info.psPath", p);
                        self._photoshop._applicationPath = p;
                    },
                    function (err) { // error
                        self.publish("generator.info.psPath", "error retrieving: " + err);
                    }
                );
            })
        );
        
    };

    // Returns a promise that resolves to the ID of the sent message
    // Does NOT return a promise that resolves to the response of the send.
    // That's why this is a private method.
    Generator.prototype._executeJSXFile = function (path, params) {
        var resolve = require("path").resolve,
            readFile = require("fs").readFile;
        
        var self = this,
            deferred = Q.defer();
        
        var paramsString = "null";
        if (params) {
            try {
                paramsString = JSON.stringify(params);
            } catch (jsonError) {
                deferred.reject(jsonError);
            }
        }
        
        if (deferred.promise.isPending()) {
            readFile(resolve(__dirname, path), "utf8", function (err, data) {
                if (err) {
                    deferred.reject(err);
                } else {
                    data = "var params = " + paramsString + ";\n" + data;
                    deferred.resolve(self._photoshop.sendCommand(data));
                }
            });
        }
        
        return deferred.promise;
    };

    Generator.prototype.evaluateJSXFile = function (path, params) {
        var self = this,
            evaluationDeferred = Q.defer();
        rejectAfter(evaluationDeferred, REQUEST_TIMEOUT);

        self._executeJSXFile(path, params).then(
            function (id) {
                self._jsMessageDeferreds[id] = evaluationDeferred;
                evaluationDeferred.promise.finally(function () { delete self._jsMessageDeferreds[id]; });
            }, function (err) {
                evaluationDeferred.reject(err);
            }
        );
        return evaluationDeferred.promise;
    };

    Generator.prototype.evaluateJSXString = function (s) {
        var self = this,
            evaluationDeferred = Q.defer();
        rejectAfter(evaluationDeferred, REQUEST_TIMEOUT);

        var id = self._photoshop.sendCommand(s);
        self._jsMessageDeferreds[id] = evaluationDeferred;
        
        evaluationDeferred.promise.finally(function () { delete self._jsMessageDeferreds[id]; });
        return evaluationDeferred.promise;
    };

    Generator.prototype.getPhotoshopPath = function () {
        return this.evaluateJSXString("File(app.path).fsName");
    };

    Generator.prototype.subscribeToPhotoshopEvents = function (events) {
        var self = this,
            subscribeDeferred = Q.defer();

        rejectAfter(subscribeDeferred, REQUEST_TIMEOUT);

        if (!util.isArray(events)) {
            events = [events];
        }
        var params = { events : events };
        self._executeJSXFile("./jsx/networkEventSubscribe.jsx", params).then(
            function (id) {
                self._jsMessageDeferreds[id] = subscribeDeferred;
                subscribeDeferred.promise.finally(function () { delete self._jsMessageDeferreds[id]; });
            },
            function (err) {
                subscribeDeferred.reject(err);
            }
        );

        return subscribeDeferred.promise;
    };

    Generator.prototype.getPixmap = function (layerID, scale) {
        var self = this,
            overallDeferred = Q.defer(),
            pixmapDeferred = Q.defer(),
            jsDeferred = Q.defer();

        rejectAfter(jsDeferred, REQUEST_TIMEOUT);
        rejectAfter(pixmapDeferred, REQUEST_TIMEOUT);

        self._executeJSXFile("./jsx/getLayerPixmap.jsx", {layerID : layerID, scale: scale}).then(
            function (id) {
                self._jsMessageDeferreds[id] = jsDeferred;
                jsDeferred.promise.finally(function () { delete self._jsMessageDeferreds[id]; });
                self._pixmapMessageDeferreds[id] = pixmapDeferred;
                pixmapDeferred.promise.finally(function () { delete self._pixmapMessageDeferreds[id]; });
            }, function (err) {
                jsDeferred.reject(err);
                pixmapDeferred.reject(err);
            }
        );

        Q.all([jsDeferred.promise, pixmapDeferred.promise]).then(
            function (vals) {
                var pixmapBuffer = vals[1];
                var pixmap = xpm.Pixmap(pixmapBuffer);
                overallDeferred.resolve(pixmap);
            }, function (err) {
                overallDeferred.reject(err);
            }
        );

        return overallDeferred.promise;

    };
        
    Generator.prototype.shutdown = function () {
        return Q.when(
            this._photoshop ? this._photoshop.disconnect() : true,
            function () {
                this._photoshop = null;
            }
        );
    };
    
    Generator.prototype.isConnected = function () {
        return (this._photoshop && this._photoshop.isConnected());
    };
    
    Generator.prototype.publish = function () {
        this._channel.publish.apply(this._channel, arguments);
    };

    Generator.prototype.subscribe = function () {
        this._channel.subscribe.apply(this._channel, arguments);
    };
    
    Generator.prototype.loadPlugin = function (directory) {
        var resolve = require("path").resolve,
            fs = require("fs");

        var absolutePath = resolve(__dirname, "../", directory);
        
        if (!fs.statSync(absolutePath).isDirectory()) {
            throw new Error("Argument error: specified path is not a directory");
        } else {
            var plugin = require(absolutePath);
            plugin.init(this);
            this.publish("generator.pluginLoaded", absolutePath);
        }
    };
    
    Generator.prototype.loadAllPluginsInDirectory = function (directory) {
        // relative paths are resolved relative to generator core directory
        var resolve = require("path").resolve,
            fs = require("fs"),
            self = this;
        
        var absolutePath = resolve(__dirname, "../", directory);
        
        console.log("Loading plugins from", absolutePath);
        
        if (!fs.statSync(absolutePath).isDirectory()) {
            throw new Error("Argument error: specified path is not a directory");
        } else {
            var files = fs.readdirSync(absolutePath);
            var plugins = files.filter(function (f) { return RE_PLUGIN_FOLDER_NAME_MATCHER.test(f); });
            plugins.forEach(function (f) {
                try {
                    self.loadPlugin(resolve(absolutePath, f));
                } catch (e) {
                    console.error("Error loading plugin '" + f + "': " + e);
                }
            });
        }
        
    };
        
    exports.Generator = Generator;
    exports.createGenerator = createGenerator;
    
    exports.logChannelToConsole = function (channel, prefix) {
        channel.subscribe("#", function () {
            console.log(prefix, arguments);
        });
    };
    
}());
