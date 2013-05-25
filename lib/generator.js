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
        photoshop = require("./photoshop");
    
    var _instanceCount = 0;
    
    var RE_PLUGIN_FOLDER_NAME_MATCHER = /\.generate$/;
    
    function Generator() {
        if (!this instanceof Generator) {
            return new Generator();
        }
        this._photoshop = null;
        this._instanceID = _instanceCount++;
        this._channel = require("postal")().channel("generator-" + (this._instanceID));
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
            self._photoshop.on("all", function () {
                var args = Array.prototype.slice.call(arguments, 0);
                var eventName = args.shift();
                self.publish("photoshop." + eventName, args);
            });
            return connectionDeferred.promise;
        }
        
        function registerForEvents() {
            var params = {
                events : ["imageChanged", "currentDocumentChanged", "save", "generatorMenuChanged"]
            };
            self.executeJSXFile("./jsx/networkEventSubscribe.jsx", params);
        }
        
        return (connectToPhotoshop().then(registerForEvents));
        
    };

    Generator.prototype.executeJSXFile = function (path, params) {
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
                    data = "params = " + paramsString + ";\n" + data;
                    self._photoshop.sendCommand(data).then(deferred.resolve, deferred.reject);
                }
            });
        }
        
        return deferred.promise;
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
        
        console.log("loading plugins from", absolutePath);
        
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
