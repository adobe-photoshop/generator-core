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
    
    var RE_PLUGIN_FOLDER_NAME_MATCHER = /\.generate$/,
        MENU_STATE_KEY_PREFIX = "GENERATOR_MENU-";

    var REQUEST_TIMEOUT = 20000; // milliseconds. TODO: Make configurable
    
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
        this._eventSubscriptions = {};
        this._menuState = {};
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

            self._photoshop.on("close", function () {
                console.log("Photoshop quit");
                self.publish("photoshop.error", "Photoshop quit");
                self.publish("generator.shutdown");
            });

            self._photoshop.on("error", function (err) {
                self.publish("photoshop.error", err);
                // If the error does refers to a specific command we ran, reject the corresponding deferred
                if (err.body && err.id) {
                    if (self._jsMessageDeferreds[err.id]) {
                        self._jsMessageDeferreds[err.id].reject(err.body);
                    }
                }
                // TODO: Otherwise, gracefully shut down?
            });

            self._photoshop.on("communicationsError", function (err, rawMessage) {
                self.publish("photoshop.error.communcationsError", {error: err, rawMessage: rawMessage});
            });

            self._photoshop.on("message", function (messageID, parsedValue) { // ,rawMessage)
                self.publish("photoshop.message", {id: messageID, body: parsedValue});
                if (self._jsMessageDeferreds[messageID]) {
                    self._jsMessageDeferreds[messageID].resolve(parsedValue);
                }
            });

            self._photoshop.on("info", function (info) {
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

    Generator.prototype.subscribeToEvents = function () {
        this.subscribeToPhotoshopEvents(
            ["imageChanged",
            "currentDocumentChanged",
            "save",
            "generatorMenuChanged"]
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

    Generator.prototype.getPhotoshopLocale = function () {
        return this.evaluateJSXString("app.locale");
    };

    Generator.prototype.addMenuItem = function (name, displayName, enabled, checked) {
        var menuItems = [], m;

        // Store menu state
        this._menuState[MENU_STATE_KEY_PREFIX + name] = {
            name: name,
            displayName: displayName,
            enabled: enabled,
            checked: checked
        };

        // Rebuild the whole menu
        for (m in this._menuState) {
            if (m.indexOf(MENU_STATE_KEY_PREFIX) === 0) {
                menuItems.push(this._menuState[m]);
            }
        }
        return this.evaluateJSXFile("./jsx/buildMenu.jsx", {items : menuItems});
    };

    Generator.prototype.toggleMenu = function (name, enabled, checked) {
        var menu = this._menuState[MENU_STATE_KEY_PREFIX + name];
        if (menu) {
            // store the state
            menu.enabled = enabled;
            menu.checked = checked;

            // send the new state to photoshop
            var params = {name: name, enabled: enabled, checked: checked};
            return this.evaluateJSXFile("./jsx/toggleMenu.jsx", params);
        } else {
            var toggleFailedDeferred = Q.defer();
            toggleFailedDeferred.reject("no menu with ID " + name);
            return toggleFailedDeferred.promise;
        }
    };

    Generator.prototype.getDocumentInfo = function () {
        return this.evaluateJSXFile("./jsx/getDocumentInfo.jsx");
    };

    Generator.prototype.subscribeToPhotoshopEvents = function (events) {
        var self = this,
            subscribeDeferred = Q.defer(),
            e,
            i;

        rejectAfter(subscribeDeferred, REQUEST_TIMEOUT);

        if (!util.isArray(events)) {
            events = [events];
        }

        // Prevent redundant event subscriptions
        for (i = events.length - 1; i >= 0; i--) {
            e = events[i];
            // If we are already subscribed to this event
            if (self._eventSubscriptions[e]) {
                // Remove this event from the list
                events.splice(i, 1);
            } else {
                // Otherwise remember the subscription
                self._eventSubscriptions[e] = true;
            }
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

    Generator.prototype.getPixmap = function (layerID, scaleX, scaleY) {
        var self = this,
            overallDeferred = Q.defer(),
            pixmapDeferred = Q.defer(),
            jsDeferred = Q.defer();

        rejectAfter(jsDeferred, REQUEST_TIMEOUT);
        rejectAfter(pixmapDeferred, REQUEST_TIMEOUT);

        self._executeJSXFile("./jsx/getLayerPixmap.jsx", {layerID : layerID, scaleX: scaleX, scaleY: scaleY}).then(
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
            try {
                var plugin = require(absolutePath);
                plugin.init(this);
                this.publish("generator.info.pluginLoaded", absolutePath);
            } catch (e) {
                console.error("Could not load plugin " + directory + ":", e);
                this.publish("generator.info.pluginLoadError", e);
            }
        }
    };
    
    Generator.prototype.loadAllPluginsInDirectory = function (directory) {
        // relative paths are resolved relative to generator core directory
        var resolve = require("path").resolve,
            fs = require("fs"),
            self = this;
        
        var absolutePath = resolve(__dirname, "../", directory);
        
        self.publish("generator.info.pluginPath", "Loading plugins from " + absolutePath);
        
        if (!fs.statSync(absolutePath).isDirectory()) {
            throw new Error("Argument error: specified path is not a directory");
        } else {
            var files = fs.readdirSync(absolutePath);
            var plugins = files.filter(function (f) { return RE_PLUGIN_FOLDER_NAME_MATCHER.test(f); });
            plugins.forEach(function (f) {
                try {
                    self.loadPlugin(resolve(absolutePath, f));
                } catch (e) {
                    self.publish("generator.error.pluginError", "Error loading plugin '" + f + "': " + e);
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
