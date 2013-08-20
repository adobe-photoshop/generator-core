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
    
    var EventEmitter = require("events").EventEmitter,
        Q = require("q"),
        photoshop = require("./photoshop"),
        util = require("util"),
        xpm = require("./xpm"),
        semver = require("semver"),
        versions = require("./versions"),
        packageConfig = require("../package.json");
    
    var _instanceCount = 0;
    
    var MENU_STATE_KEY_PREFIX = "GENERATOR-MENU-",
        PHOTOSHOP_EVENT_PREFIX = "PHOTOSHOP-EVENT-",
        PLUGIN_KEY_PREFIX = "PLUGIN-";

    var REQUEST_TIMEOUT = 20000; // milliseconds. TODO: Make configurable
    
    var PLUGIN_INCOMPATIBLE_MESSAGE = "$$$/Generator/NotCompatibleString";

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

    function escapePluginId(pluginId) {
        if (!pluginId) { return pluginId; }
        return pluginId.replace(/[^a-zA-Z0-9]/g, function (char) {
            return "_" + char.charCodeAt(0) + "_";
        });
    }

    function unescapePluginId(pluginId) {
        if (!pluginId) { return pluginId; }
        return pluginId.replace(/_(\d+)_/g, function (match, charCode) {
            return String.fromCharCode(charCode);
        });
    }

    function Generator() {
        if (!this instanceof Generator) {
            return new Generator();
        }
        // TODO: declare these as prototype properties and document types
        this._plugins = {};
        this._photoshop = null;
        this._instanceID = _instanceCount++;
        this._jsMessageDeferreds = [];
        this._pixmapMessageDeferreds = [];
        this._eventSubscriptions = {};
        this._menuState = {};
    }
    util.inherits(Generator, EventEmitter);

    
    function createGenerator() {
        return new Generator();
    }

    Generator.prototype.start = function (options) {
        var self = this;

        self._config = options.config || {};
        
        function connectToPhotoshop() {
            var connectionDeferred = Q.defer();
            self._photoshop = photoshop.createClient(options);
            self._photoshop.once("connect", function () {
                connectionDeferred.resolve(self);
            });

            self._photoshop.on("close", function () {
                console.log("Photoshop connection closed");
                self.emit("close");
            });

            self._photoshop.on("error", function (err) {
                console.error("Photoshop error", err);
                // If the error does refers to a specific command we ran, reject the corresponding deferred
                if (err.body && err.id) {
                    if (self._jsMessageDeferreds[err.id]) {
                        self._jsMessageDeferreds[err.id].reject(err.body);
                    }
                }
                // TODO: Otherwise, gracefully shut down?
            });

            self._photoshop.on("communicationsError", function (err, rawMessage) {
                console.error("photoshop communcations error: %j", {error: err, rawMessage: rawMessage});
            });

            self._photoshop.on("message", function (messageID, parsedValue) { // ,rawMessage)
                console.log("Photoshop message: %j", {id: messageID, body: parsedValue});
                if (self._jsMessageDeferreds[messageID]) {
                    self._jsMessageDeferreds[messageID].resolve(parsedValue);
                }
            });

            self._photoshop.on("info", function (info) {
                console.log("Photoshop info: %j", info);
            });

            self._photoshop.on("event", function (messageID, eventName, parsedValue) { // , rawMessage)
                console.log("Photoshop event: messageID: %d, name: %s, parsedValue: %j",
                    messageID, eventName, parsedValue
                );
                self.emitPhotoshopEvent(eventName, parsedValue);
            });

            self._photoshop.on("pixmap", function (messageID, messageBody) { // , rawMessage)
                console.log("Photoshop pixmap: id: %d", messageID);
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
                        console.log("Photoshop path: ", p);
                        self._photoshop._applicationPath = p;
                    },
                    function (err) { // error
                        console.error("Error retrieving Photoshop path", err);
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

    Generator.prototype.alert = function (message, stringReplacements) {
        this.evaluateJSXFile("./jsx/alert.jsx", { message: message, replacements: stringReplacements });
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

    /**
     * Get information about a document.
     * To find out about the current document, leave documentId empty.
     * @param {?integer} documentId Optional document ID
     * @param {?Object.<string, boolean>} flags Optional override of default flags for
     *   document info request. The optional flags and their default values are:
     *          compInfo:           true
     *          imageInfo:          true
     *          layerInfo:          true
     *          expandSmartObjects: false
     *          getTextStyles:      true
     *          selectedLayers:     false
     *          getCompSettings:    true
     */
    Generator.prototype.getDocumentInfo = function (documentId, flags) {
        var params = {
            documentId: documentId,
            flags: {
                compInfo:           true,
                imageInfo:          true,
                layerInfo:          true,
                expandSmartObjects: false,
                getTextStyles:      true,
                selectedLayers:     false,
                getCompSettings:    true
            }
        };

        if (flags) {
            Object.keys(params.flags).forEach(function (key) {
                if (flags.hasOwnProperty(key)) {
                    params.flags[key] = flags[key];
                }
            });
        }

        console.log("Getting document info with these params: %j", params);

        return this.evaluateJSXFile("./jsx/getDocumentInfo.jsx", params);
    };

    /**
     * Get the document-wide generator settings of the current document for a specific plugin.
     * @param {!String} pluginId The ID of the plugin to get the settings for
     */
    Generator.prototype.getDocumentSettingsForPlugin = function (documentId, pluginId) {
        // Note that technically pluginId is optional, but we don't want to make that offical
        
        var self = this,
            settingsDeferred = Q.defer(),
            params = { documentId: documentId, key: escapePluginId(pluginId) },
            infoPromise = this.evaluateJSXFile("./jsx/getGeneratorSettings.jsx", params);

        infoPromise.then(
            function (settings) {
                // Don't pass the plugin ID here because due to using params.key above,
                // {{ generatorSettings: { <pluginId>: <settings> }} is shortened to
                // { generatorSettings: <settings> } anyway
                settings = self.extractDocumentSettings(settings);
                settingsDeferred.resolve(settings);
            },
            function (err) {
                settingsDeferred.reject(err);
            }
        );

        return settingsDeferred.promise;
    };

    /**
     * Set the document-wide generator settings of the current document for a specific plugin.
     * @param {!Object} settings The settings to set
     * @param {!String} pluginId The ID of the plugin to get the settings for
     */
    Generator.prototype.setDocumentSettingsForPlugin = function (settings, pluginId) {
        var params = {
                // Escape the plugin ID because Photoshop can only use
                // letters, digits and underscores for object keys
                key: escapePluginId(pluginId),
                // Serialize the settings because creating the corresponding ActionDescriptor is harder
                // Wrap the resulting string as { json: ... } because Photoshop needs an object here
                settings: { json: JSON.stringify(settings) }
            };
        console.log("Storing document-wide setting for plugin " + pluginId + ":", settings);
        return this.evaluateJSXFile("./jsx/setGeneratorSettings.jsx", params);
    };

    /**
     * Extract and parse generator settings, optionally for one plugin only
     * @param {!Object} document The object to extract settings from
     * @param {!Object} document.generatorSettings The stored settings
     * @param {?String} pluginId The ID of the plugin to extract the settings of
     */
    Generator.prototype.extractDocumentSettings = function (document, pluginId) {
        if (!document) { return {}; }
        
        var self = this,
            // Regardless of whether the source is a call to getDocumentInfo, an imageChanged event,
            // or a call to getDocumentSettings (both for a specific plugin and for all),
            // what Photoshop returns is always an object wrapped into { generatorSettings: ... }
            settings = document.generatorSettings;

        // At this point we're either dealing with the settings for one plugin or for multiple plugins.
        // In the first case, the settings should be wrapped as { json: ... }, otherwise the latter case.
        if (!settings.json) {
            // Do not modify the settings, but create a copy
            var result = {};
            Object.keys(settings).forEach(function (key) {
                // Unescape the plugin IDs to not leak this convention more than necessary
                result[unescapePluginId(key)] = self._parseDocumentSettings(settings[key]);
            });
            settings = result;
            
            if (pluginId) {
                // Can use the pluginId directly because it was unescaped above
                settings = settings[pluginId] || {};
            }
        } else {
            settings = self._parseDocumentSettings(settings);
        }

        return settings;
    };

    Generator.prototype._parseDocumentSettings = function (settings) {
        if (settings.json) {
            try {
                return JSON.parse(settings.json);
            }
            catch (e) {
                console.error("Could not parse" + settings.json + ": " + e.stack);
            }
        }
        return settings;
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

        if (events.length > 0) {
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
        } else {
            subscribeDeferred.resolve();
        }

        return subscribeDeferred.promise;
    };

    // Photoshop events (e.g. "imageChanged") are managed a little differently than
    // Generator events (e.g. connect, close, error) for two reasons. First, when a user
    // registers for a Photoshop event, we need to actually subscribe to that event over
    // the Photoshop connection. (And, if that subscription fails, we want to clean up
    // properly.) Second, we want to avoid name conflicts with Generator events. (E.g.
    // Photoshop could add an "error" event.) To do this, we have our own registration
    // and removal functions that mimic the regular EventEmitter interface. Event names
    // are prefixed with a constant string, and actual events are dispatched through
    // the usual "emit" codepath.

    Generator.prototype._registerPhotoshopEventHelper = function (event, listener, isOnce) {
        var self = this,
            registerFunction = isOnce ? self.once : self.on;

        console.log("Subscribing to photoshop event %s", event);

        self.subscribeToPhotoshopEvents(event).done(function () {
            console.log("Finished subscribe to photoshop event %s", event);
        }, function () {
            console.error("Failed to subscribe to photoshop event %s", event);
            self.removePhotoshopEventListener(event, listener);
        });

        return registerFunction.call(self, PHOTOSHOP_EVENT_PREFIX + event, listener);
    };

    Generator.prototype.onPhotoshopEvent = function (event, listener) {
        return this._registerPhotoshopEventHelper(event, listener, false);
    };
    Generator.prototype.addPhotoshopEventListener = Generator.prototype.onPhotoshopEvent;

    Generator.prototype.oncePhotoshopEvent = function (event, listener) {
        return this._registerPhotoshopEventHelper(event, listener, true);
    };

    Generator.prototype.removePhotoshopEventListener = function (event, listener) {
        // TODO: We could unsubscribe from the PS event if we have no listeners left
        return this.removeListener(PHOTOSHOP_EVENT_PREFIX + event, listener);
    };

    Generator.prototype.photoshopEventListeners = function (event) {
        return this.listeners(PHOTOSHOP_EVENT_PREFIX + event);
    };

    Generator.prototype.emitPhotoshopEvent = function () {
        var args = Array.prototype.slice.call(arguments);
        if (args[0]) {
            args[0] = PHOTOSHOP_EVENT_PREFIX + args[0];
        }
        console.log("Emitting Photoshop event:", args);
        return this.emit.apply(this, args);
    };

    /**
     * Get a pixmap representing the pixels of a layer, or just the bounds of that pixmap.
     * The pixmap can be scaled either by providing a horizontal and vertical scaling factor (scaleX/scaleY)
     * or by providing a mapping between an input rectangle and an output rectangle. The input rectangle
     * is specified in document coordinates and should encompass the whole layer.
     * The output rectangle should be of the target size.
     * 
     * @params {!integer} documentId Document ID
     * @params {!integer} layerId Layer ID
     * @params {!Object}  settings An object with params to request the pixmap
     * @params {?boolean} settings.boundsOnly Whether to return a JSON object with bounds rather than the pixmap
     * @params {?Object}  settings.inputRect  Rectangular part of the document to use (usually the layer's bounds)
     * @params {?Object}  settings.outputRect Rectangle into which the the layer should fit
     * @params {?float}   settings.scaleX     The factor by which to scale the image horizontally (1.0 for 100%)
     * @params {?float}   settings.scaleX     The factor by which to scale the image vertically (1.0 for 100%)
     * @params {!float}   settings.inputRect.left    Pixel distance of the rect's left side from the doc's left side
     * @params {!float}   settings.inputRect.top     Pixel distance of the rect's top from the doc's top
     * @params {!float}   settings.inputRect.right   Pixel distance of the rect's right side from the doc's left side
     * @params {!float}   settings.inputRect.bottom  Pixel distance of the rect's bottom from the doc's top
     * @params {!float}   settings.outputRect.left   Pixel distance of the rect's left side from the doc's left side
     * @params {!float}   settings.outputRect.top    Pixel distance of the rect's top from the doc's top
     * @params {!float}   settings.outputRect.right  Pixel distance of the rect's right side from the doc's left side
     * @params {!float}   settings.outputRect.bottom Pixel distance of the rect's bottom from the doc's top
     */
    Generator.prototype.getPixmap = function (documentId, layerId, settings) {
        if (arguments.length !== 3) {
            console.warn("Call to getPixmap with " + arguments.length +
                " instead of 3 arguments - outdated plugin?");
        }
        var self            = this,
            jsDeferred      = Q.defer(),
            overallDeferred = settings.boundsOnly ? jsDeferred : Q.defer(),
            pixmapDeferred  = settings.boundsOnly ? null : Q.defer(),
            params          = {
                documentId: documentId,
                layerId:    layerId,
                boundsOnly: settings.boundsOnly,
                inputRect:  settings.inputRect,
                outputRect: settings.outputRect,
                scaleX:     settings.scaleX || 1,
                scaleY:     settings.scaleY || 1
            };

        rejectAfter(jsDeferred, REQUEST_TIMEOUT);
        if (pixmapDeferred) {
            rejectAfter(pixmapDeferred, REQUEST_TIMEOUT);
        }

        self._executeJSXFile("./jsx/getLayerPixmap.jsx", params).then(
            function (id) {
                self._jsMessageDeferreds[id] = jsDeferred;
                jsDeferred.promise.finally(function () { delete self._jsMessageDeferreds[id]; });
                if (pixmapDeferred) {
                    self._pixmapMessageDeferreds[id] = pixmapDeferred;
                    pixmapDeferred.promise.finally(function () { delete self._pixmapMessageDeferreds[id]; });
                }
            }, function (err) {
                jsDeferred.reject(err);
                if (pixmapDeferred) {
                    pixmapDeferred.reject(err);
                }
            }
        );

        // If we have a deferred for the pixmap, we need to wait for both to finish
        // Otherwise, jsDeferred IS overallDeferred and we don't need to anything special
        if (pixmapDeferred) {
            Q.all([jsDeferred.promise, pixmapDeferred.promise]).then(
                function (vals) {
                    var pixmapBuffer = vals[1];
                    var pixmap = xpm.Pixmap(pixmapBuffer);
                    overallDeferred.resolve(pixmap);
                }, function (err) {
                    overallDeferred.reject(err);
                }
            );
        }

        return overallDeferred.promise;

    };

    /**
     * @param pixmap     An object representing the layer's image
     * @param {!integer} pixmap.width          The width of the image
     * @param {!integer} pixmap.height         The height of the image
     * @param {!Buffer}  pixmap.pixels         A buffer containing the actual pixel data
     * @param {!integer} pixmap.bitsPerChannel Bits per channel
     * @param {!String}  path                  The path to write to
     * @param settings   An object with settings for converting the image
     * @param {!String}  settings.format       ImageMagick output format
     * @param {?integer} settings.quality      A number indicating the quality - the meaning depends on the format
     * @param {?integer} settings.ppi          The image's pixel density
     */
    Generator.prototype.savePixmap = function (pixmap, path, settings) {
        var self    = this,
            psPath  = self._photoshop._applicationPath,
            convert = require("./convert");

        console.log("Saving pixmap at", path);
        return convert.savePixmap(psPath, pixmap, path, settings);
    };

    Generator.prototype.saveLayerToSVGFile = function (layerID, scale, filename) {
        // TODO (Issue #58): This should also require the document ID as a parameter to avoid
        // race conditions where the user changes the active document during generation.
        var params = { layerID: layerID,
                       layerScale: scale,
                       layerFilename: filename };
        this.evaluateJSXFile("./jsx/saveLayerSVG.jsx", params);
    };
        
    Generator.prototype.shutdown = function () {
        if (this._photoshop) {
            try {
                this._photoshop.disconnect();
            } catch (photoshopDisconnectException) {
                // do nothing
            }
            this._photoshop = null;
        }
    };
    
    Generator.prototype.isConnected = function () {
        return (this._photoshop && this._photoshop.isConnected());
    };
    
    Generator.prototype.loadPlugin = function (directory) {
        var fs = require("fs"),
            resolve = require("path").resolve,
            metadata = null,
            self = this;

        function handleIncompatiblePlugin(metadata) {
            self.alert(PLUGIN_INCOMPATIBLE_MESSAGE, [metadata.name]);
            // TODO: Record that we have given an alert for this plugin, and only
            // alert if we've never alerted for it before.
        }
        
        // Make sure a directory was specified
        if (!fs.statSync(directory).isDirectory()) {
            throw new Error("Argument error: specified path is not a directory");
        }

        // Check for metadata and name uniqueness
        try {
            metadata = require(resolve(directory, "package.json"));
        } catch (metadataError) {
            throw new Error("Error reading metadata for plugin at path '" + directory + "': " + metadataError.message);
        }

        if (!(metadata && metadata.name && typeof metadata.name === "string")) {
            throw new Error("Invalid metadata for plugin at path '" + directory +
                "' (plugins must have a valid package.json file with 'name' property): " +
                JSON.stringify(metadata));
        } else if (self._plugins[PLUGIN_KEY_PREFIX + metadata.name]) {
            throw new Error("Attempted to load a plugin with a name that is already used. Path: '" +
                directory + "', name: '" + metadata.name + "'");
        } else if (!metadata["generator-core-version"]) {
            console.warn("Warning: Plugin '%s' did not specify which versions of generator-core" +
                " it is compatible with. It will be loaded anyway, but providing generator-core-version" +
                " in its package.json is recommended.", metadata.name);
        } else if (packageConfig.version &&
            !semver.satisfies(packageConfig.version, metadata["generator-core-version"])) {
            handleIncompatiblePlugin(metadata);
            throw new Error("Attempted to load a plugin '%s' that is incompatible with this version of " +
                " generator-core. generator-core version: %s, plugin compatibility: %s",
                metadata.name, packageConfig.version, metadata["generator-core-version"]);
        }

        // Do the actual plugin load
        try {
            var logPrefix = "[" + metadata.name + "]";
            console.log("Loading plugin %j from directory %j", metadata.name, directory);
            versions.logPackageInformation(logPrefix, directory);
            versions.logGitInformation(logPrefix, directory);
            // NOTE: We don't need to worry about accidentally requiring the same plugin twice.
            // If the user did try to load it twice, require's caching would return the same
            // package.json both times (even if the package.json changed on disk), and so
            // we'd get the same name both times, and bail in the "if" branch above.
            var plugin = require(directory),
                config = self._config[metadata.name] || {};

            plugin.init(this, config);
            self._plugins[PLUGIN_KEY_PREFIX + metadata.name] = {
                metadata: metadata,
                plugin: plugin,
                config: config
            };
            console.log("Plugin loaded: %s", metadata.name);
        } catch (loadError) {
            throw new Error("Could not load plugin at path '" + directory + "': " + loadError.message);
        }
    };

    Generator.prototype.checkConnection = function () {
        var self = this,
            aliveDeferred = Q.defer();

        rejectAfter(aliveDeferred, REQUEST_TIMEOUT);

        var id = self._photoshop.sendKeepAlive();
        self._jsMessageDeferreds[id] = aliveDeferred;

        return aliveDeferred.promise;
    };
            
    exports.Generator         = Generator;
    exports.createGenerator   = createGenerator;
    exports._escapePluginId   = escapePluginId;
    exports._unescapePluginId = unescapePluginId;
        
}());
