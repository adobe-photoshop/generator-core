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
    
    var logging = require("./logging"),
        _loggerManager = new logging.LoggerManager(logging.LOG_LEVEL_DEBUG),
        _logger = _loggerManager.createLogger("core"),
        _formatter = new logging.StreamFormatter(_loggerManager);

    _formatter.pipe(process.stdout);

    var EventEmitter = require("events").EventEmitter,
        Q = require("q"),
        photoshop = require("./photoshop"),
        util = require("util"),
        xpm = require("./xpm"),
        semver = require("semver"),
        packageConfig = require("../package.json");
    
    var _instanceCount = 0;
    
    var MENU_STATE_KEY_PREFIX = "GENERATOR-MENU-",
        PHOTOSHOP_EVENT_PREFIX = "PHOTOSHOP-EVENT-",
        PLUGIN_KEY_PREFIX = "PLUGIN-";

    var PLUGIN_INCOMPATIBLE_MESSAGE = "$$$/Generator/NotCompatibleString";

    // Some commands result in multiple response messages. After the first response
    // message is received, if there's a gap longer than this in responses,
    // we assume there was an error.
    var MULTI_MESSAGE_TIMEOUT = 5000;

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
        this._messageDeferreds = [];
        this._eventSubscriptions = {};
        this._menuState = {};
    }
    util.inherits(Generator, EventEmitter);

    
    function createGenerator() {
        return new Generator();
    }

    Object.defineProperty(Generator.prototype, "version", {enumerable: true, value: packageConfig.version});

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
                _logger.info("Photoshop connection closed");
                self.emit("close");
            });

            self._photoshop.on("error", function (err) {
                _logger.warn("Photoshop error", err);
                // If the error does refers to a specific command we ran, reject the corresponding deferred
                if (err.body && err.id) {
                    if (self._messageDeferreds[err.id]) {
                        self._messageDeferreds[err.id].reject(err.body);
                    }
                }
                // TODO: Otherwise, gracefully shut down?
            });

            self._photoshop.on("communicationsError", function (err, rawMessage) {
                _logger.warn("photoshop communcations error: %j", {error: err, rawMessage: rawMessage});
            });

            self._photoshop.on("message", function (messageID, parsedValue) { // ,rawMessage)
                if (self._messageDeferreds[messageID]) {
                    self._messageDeferreds[messageID].notify({type: "javascript", value: parsedValue});
                }
            });

            self._photoshop.on("info", function (info) {
                _logger.info("Photoshop info: %j", info);
            });

            self._photoshop.on("event", function (messageID, eventName, parsedValue) { // , rawMessage)
                self.emitPhotoshopEvent(eventName, parsedValue);
            });

            self._photoshop.on("pixmap", function (messageID, messageBody) { // , rawMessage)
                if (self._messageDeferreds[messageID]) {
                    self._messageDeferreds[messageID].notify({type: "pixmap", value: messageBody});
                }
            });

            return connectionDeferred.promise;
        }
        
        return (connectToPhotoshop().then(
            function () {
                // Setup Headlights logging
                self._logHeadlights("Startup");
                self._logHeadlights("Version: " + packageConfig.version);
                self.onPhotoshopEvent("generatorMenuChanged", function (event) {
                    var menu = event.generatorMenuChanged;
                    if (menu && menu.name) {
                        self._logHeadlights("Menu selected: " + menu.name);
                    }
                });

                self.getPhotoshopExecutableLocation().then(
                    function (p) { // success
                        self._photoshop._applicationPath = p;
                    },
                    function (err) { // error
                        _logger.error("Error retrieving Photoshop executable location", err);
                    }
                );
            })
        );
    };

    // Note: This is a private method. Call at your own risk, and follow instructions below.
    // Most users of the Generator API will want the public Generator.prototype.evaluateJSXString
    // method below.
    //
    // This method returns a deferred (not a promise). Every time a message comes in from Photoshop
    // pertaining to this call, a "progress" notification is issued on the deferred. When the caller of
    // this method is no longer interested in any more messages, it is the resposnibility of the
    // caller to resolve the returned deferred. Doing that will cause the necessary cleanup
    // to happen internally (via a "finally" handler that this method installs on the deferred).
    //
    // The progress notification will be an object of the form:
    //    { type : [string like "javascript" or "pixmap"],
    //      value : [dependent on type -- Object if "javascript", Buffer if "pixmap"] }
    //
    // If the caller of this message never resolves/rejects the returned deferred, then we'll have a
    // memory leak on our hands.
    //
    // The reason this method (and _sendJSXFile) exist is because some Generator-specific ExtendScript
    // returns multiple JS messages, and we need a way to handle that. However, all other general-purpose
    // ExtendScript will only return one (which is what the public API expects). As we
    // move Generator things out of ExtendScript (or add more stuff to Generator), the requirements
    // of this method (and _sendJSXFile) may change. That's why it's priate.
    Generator.prototype._sendJSXString = function (s) {
        var self = this,
            deferred = Q.defer(),
            id = self._photoshop.sendCommand(s);
            
        self._messageDeferreds[id] = deferred;

        deferred.promise.finally(function () {
            delete self._messageDeferreds[id];
        });
        
        return deferred;
    };

    // Note: This is a private method. Call at your own risk, and follow instructions below.
    // Most users of the Generator API will want the public Generator.prototype.evaluateJSXFile
    // method below.
    //
    // See the comment for _sendJSXString above for details on how to use this if you really
    // need to use it.
    Generator.prototype._sendJSXFile = function (path, params) {
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
            readFile(resolve(__dirname, path), {encoding: "utf8"}, function (err, data) {
                var id;

                if (err) {
                    deferred.reject(err);
                } else {
                    data = "var params = " + paramsString + ";\n" + data;
                    id = self._photoshop.sendCommand(data);
                    self._messageDeferreds[id] = deferred;

                    deferred.promise.finally(function () {
                        delete self._messageDeferreds[id];
                    });
                }
            });
        }
        
        return deferred;
    };

    Generator.prototype.evaluateJSXFile = function (path, params) {
        var self = this,
            deferred = self._sendJSXFile(path, params);

        deferred.promise.progress(function (message) {
            if (message.type === "javascript") {
                deferred.resolve(message.value);
            }
        });

        return deferred.promise;
    };

    Generator.prototype.evaluateJSXString = function (s) {
        var self = this,
            deferred = self._sendJSXString(s);

        deferred.promise.progress(function (message) {
            if (message.type === "javascript") {
                deferred.resolve(message.value);
            }
        });

        return deferred.promise;
    };

    Generator.prototype.alert = function (message, stringReplacements) {
        this.evaluateJSXFile("./jsx/alert.jsx", { message: message, replacements: stringReplacements });
    };

    /**
     * Returns a Promise that resolves to the full path to the location of the root 
     * Photoshop install directory (where things like the third-party "Plug-ins"
     * directory live).
     * 
     * On Mac this will look something like:
     *    /Applications/Adobe Photoshop CC
     *
     * On Windows this will look something like:
     *    C:\Program Files\Adobe\Adobe Photoshop CC (64 Bit)
     *
     * See also: Generator.prototype.getPhotoshopExecutableLocation
     */
    Generator.prototype.getPhotoshopPath = function () {
        return this.evaluateJSXString("File(app.path).fsName");
    };

    /**
     * Returns a Promise that resolves to the full path to the location of the Photoshop
     * executable (not including the name of the executable itself.) On Mac, this gives
     * a location *inside* the .app bundle.
     *
     * Important: Due to a bug in Photoshop (that likely won't be fixed), this function
     * will not work properly if there is a literal "%20" in the absolute path. Moreover,
     * PS as a whole may not work properly if there is a literal "%20" in its executable path
     * 
     * On Mac this will look something like:
     *    /Applications/Adobe Photoshop CC/Adobe Photoshop CC.app/Contents/MacOS
     *
     * On Windows this will look something like:
     *    C:\Program Files\Adobe\Adobe Photoshop CC (64 Bit)
     *
     * See also: Generator.prototype.getPhotoshopPath
     */
    Generator.prototype.getPhotoshopExecutableLocation = function () {
        return this.evaluateJSXFile("./jsx/getPhotoshopExecutableLocation.jsx", {});
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

    /**
     * Change the enabled and checked state of an existing menu (and optionally change
     * the display name). Returns a promise that resolves once the menu has been changed.
     *
     * @param {!string}  name        The identifier for the menu used when the menu was created
     * @param {!boolean} enabled     Whether the menu should be enabled
     * @param {!boolean} checked     Whether the menu should have a check mark
     * @param {?string}  displayName The new displayed menu text (remains unchanged if not specified)
     *
     * @return {Promise}             A promise that resolves once the menu has been changed
     */
    Generator.prototype.toggleMenu = function (name, enabled, checked, displayName) {
        var menu = this._menuState[MENU_STATE_KEY_PREFIX + name];
        if (menu) {
            // store the state
            menu.enabled = enabled;
            menu.checked = checked;

            // send the new state to photoshop
            var params = {name: name, enabled: enabled, checked: checked};
            if (typeof(displayName) === "string" && displayName !== "") {
                params.displayName = displayName;
            }
            
            return this.evaluateJSXFile("./jsx/toggleMenu.jsx", params);
        } else {
            var toggleFailedDeferred = Q.defer();
            toggleFailedDeferred.reject("no menu with ID " + name);
            return toggleFailedDeferred.promise;
        }
    };

    Generator.prototype.getMenuState = function (name) {
        var result = null,
            menu = this._menuState[MENU_STATE_KEY_PREFIX + name];

        if (menu) {
            result = {
                enabled: menu.enabled,
                checked: menu.checked
            };
        }
        return result;
    };

    /**
     * Get an array of all open document IDs.
     * Returns a promise that resolves to an array of integers.
     */
    Generator.prototype.getOpenDocumentIDs = function () {
        return this.evaluateJSXFile("./jsx/getOpenDocumentIDs.jsx", {}).then(function (ids) {
                if (typeof ids === "number") {
                    return [ids];
                } else if (typeof ids === "string" && ids.length > 0) {
                    return ids.split(":").map(function (id) { return parseInt(id, 10); });
                } else {
                    return [];
                }
            });
    };

    /**
     * Get information about a document.
     * To find out about the current document, leave documentId empty.
     * @param {?integer} documentId Optional document ID
     * @param {?Object.<string, boolean>} flags Optional override of default flags for
     *   document info request. The optional flags and their default values are:
     *          compInfo:             true
     *          imageInfo:            true
     *          layerInfo:            true
     *          expandSmartObjects:   false
     *          getTextStyles:        true
     *          selectedLayers:       false
     *          getCompLayerSettings: true
     */
    Generator.prototype.getDocumentInfo = function (documentId, flags) {
        var params = {
            documentId: documentId,
            flags: {
                compInfo:             true,
                imageInfo:            true,
                layerInfo:            true,
                expandSmartObjects:   false,
                getTextStyles:        true,
                selectedLayers:       false,
                getCompLayerSettings: true
            }
        };

        if (flags) {
            Object.keys(params.flags).forEach(function (key) {
                if (flags.hasOwnProperty(key)) {
                    params.flags[key] = flags[key];
                }
            });
        }

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
                _logger.error("Could not parse" + settings.json + ": " + e.stack);
            }
        }
        return settings;
    };

    Generator.prototype.subscribeToPhotoshopEvents = function (events) {
        var self = this,
            e,
            i;

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
            return self.evaluateJSXFile("./jsx/networkEventSubscribe.jsx", params);
        } else {
            return new Q(true);
        }

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

        self.subscribeToPhotoshopEvents(event).fail(function () {
            _logger.error("Failed to subscribe to photoshop event %s", event);
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

        return this.emit.apply(this, args);
    };

    // TODO - JRB - 2/9/14
    // KVLR has a sendLayerShapeToClient action that is similar to sendLayerThumbnailToNetworkClient
    // We should create a getVector function that is similar to getPixmap

    /**
     * Get a pixmap representing the pixels of a layer, or just the bounds of that pixmap.
     * The pixmap can be scaled either by providing a horizontal and vertical scaling factor (scaleX/scaleY)
     * or by providing a mapping between an input rectangle and an output rectangle. The input rectangle
     * is specified in document coordinates and should encompass the whole layer.
     * The output rectangle should be of the target size.
     * 
     * @param {!integer} documentId Document ID
     * @param {!integer} layerId Layer ID
     * @param {!Object}  settings An object with params to request the pixmap
     * @param {?boolean} settings.boundsOnly Whether to return an object with bounds rather than the pixmap. The
     *     returned object will have the format (but with different numbers):
     *         { bounds: {top: 0, left: 0, bottom: 100, right: 100 } }
     * @param {?Object}  settings.inputRect  Rectangular part of the document to use (usually the layer's bounds)
     * @param {?Object}  settings.outputRect Rectangle into which the the layer should fit
     * @param {?float}   settings.scaleX     The factor by which to scale the image horizontally (1.0 for 100%)
     * @param {?float}   settings.scaleX     The factor by which to scale the image vertically (1.0 for 100%)
     * @param {!float}   settings.inputRect.left    Pixel distance of the rect's left side from the doc's left side
     * @param {!float}   settings.inputRect.top     Pixel distance of the rect's top from the doc's top
     * @param {!float}   settings.inputRect.right   Pixel distance of the rect's right side from the doc's left side
     * @param {!float}   settings.inputRect.bottom  Pixel distance of the rect's bottom from the doc's top
     * @param {!float}   settings.outputRect.left   Pixel distance of the rect's left side from the doc's left side
     * @param {!float}   settings.outputRect.top    Pixel distance of the rect's top from the doc's top
     * @param {!float}   settings.outputRect.right  Pixel distance of the rect's right side from the doc's left side
     * @param {!float}   settings.outputRect.bottom Pixel distance of the rect's bottom from the doc's top
     * @param {?boolean} settings.useSmartScaling Use Photoshop's "smart" scaling to scale layer, which
     *     (confusingly) means that stroke effects (e.g. rounded rect corners) are *not* scaled. (Default: false)
     * @param {?boolean} settings.includeAncestorMasks Cause exported layer to be clipped by any ancestor masks
     *     that are visible (Default: false)
     * @param {?boolean} settings.allowDither controls whether any dithering could possibly happen in the color
     *     conversion to 8-bit RGB. If false, then dithering will definitely not occur, regardless of either
     *     the value of useColorSettingsDither and the color settings in Photoshop. (Default: false)
     * @param {?boolean} settings.useColorSettingsDither If settings.allowDither is true, then this controls
     *     whether to (if true) defer to the user's color settings in PS, or (if false) to force dither in any
     *     case where a conversion to 8-bit RGB would otherwise be lossy. If allowDither is false, then the
     *     value of this parameter is ignored. (Default: false)
     */
    Generator.prototype.getPixmap = function (documentId, layerId, settings) {
        if (arguments.length !== 3) {
            _logger.warn("Call to getPixmap with " + arguments.length +
                " instead of 3 arguments - outdated plugin?");
        }
        var self              = this,
            executionDeferred = null,
            jsDeferred        = Q.defer(),
            pixmapDeferred    = Q.defer(),
            overallDeferred   = Q.defer(),
            params            = {
                documentId: documentId,
                layerId:    layerId,
                inputRect:  settings.inputRect,
                outputRect: settings.outputRect,
                scaleX:     settings.scaleX || 1,
                scaleY:     settings.scaleY || 1,
                bounds:     true,
                boundsOnly: settings.boundsOnly,
                useSmartScaling: settings.useSmartScaling || false,
                includeAncestorMasks: settings.includeAncestorMasks || false,
                allowDither: settings.allowDither || false,
                useColorSettingsDither: settings.useColorSettingsDither || false
            };

        // Because of PS communication irregularities in different versions of PS, it's very complicated to
        // know when we're "done" getting responses from executing this JSX file. In various scenarios, the
        // evaluation of the JSX file produces some subset of the following responses in some *arbitrary* order:
        //
        // - A javascript message that is a stringification of an Action Descriptor object
        //  (i.e. "[ActionDescriptor]") -- this should always come back
        // - A javascript message that is a stringification of a JSON object that contains bounds -- currently
        //   this always comes back because "bounds" is hardcoded to "true" in the params list
        // - A pixmap message -- this should come back if and only if boundsOnly is false.
        //
        // The two deferreds at the top of this function (jsDeferred and pixmapDeferred) resolve when we've
        // received all of the expected messages of the respective type with the expected content. 
        //
        // overallDeferred (the promise of which is returned by this function) resolves when both jsDeferred and
        // pixmapDeferred resolve.
        //
        // Note that this method could be slightly more efficient if we didn't create the pixmapDeffered in cases
        // where it wasn't necessary. But the logic is much simpler if we just create it and then resolve it
        // in cases where we don't need it. When the day comes that Generator is slow because we create one
        // extra deferred every time we generate an image, we'll optimize this.
        executionDeferred = self._sendJSXFile("./jsx/getLayerPixmap.jsx", params);

        executionDeferred.promise.progress(function (message) {
            if (message.type === "javascript" &&
                    message.value instanceof Object &&
                    message.value.hasOwnProperty("bounds")) {
                jsDeferred.resolve(message.value);
            } else if (message.type === "pixmap") {
                pixmapDeferred.resolve(message.value);
            }
        });

        executionDeferred.promise.fail(function (err) {
            jsDeferred.reject(err);
            pixmapDeferred.reject(err);
        });

        // Resolve the pixmapDeferred now if we aren't actually expecting a pixmap
        if (params.boundsOnly) {
            pixmapDeferred.resolve();
        }

        Q.all([jsDeferred.promise, pixmapDeferred.promise]).spread(
            function (js, pixmapBuffer) {
                executionDeferred.resolve();

                if (params.boundsOnly && js && js.bounds) {
                    overallDeferred.resolve(js);
                } else if (js && js.bounds && pixmapBuffer) {
                    var pixmap = xpm.Pixmap(pixmapBuffer);
                    pixmap.bounds = js.bounds;
                    overallDeferred.resolve(pixmap);
                } else {
                    var errStr = "Unexpected response from PS in getLayerPixmap: jsDeferred val: " +
                        JSON.stringify(js) +
                        ", pixmapDeferred val: " +
                        pixmapBuffer ? "truthy" : "falsy";
                    overallDeferred.reject(new Error(errStr));
                }
            }, function (err) {
                executionDeferred.reject(err);
                overallDeferred.reject(err);
            }
        );

        return overallDeferred.promise;
    };

    /**
     * Returns a promise that resolves to an object detailing the path
     * present on the specified layer. If there is no path present,
     * the promise rejects.
     */
    Generator.prototype.getLayerShape = function (documentId, layerId) {
        var self = this,
            timeoutTimer = null,
            resultDeferred = Q.defer(),
            executionDeferred = self._sendJSXFile("./jsx/getLayerShape.jsx",
                {documentId : documentId, layerId : layerId});

        resultDeferred.promise.finally(function () {
            executionDeferred.resolve(); // done listening for messages

            if (timeoutTimer !== null) {
                clearTimeout(timeoutTimer);
            }
        });

        executionDeferred.promise.progress(function (message) {
            if (timeoutTimer === null) { // First message we've received
                timeoutTimer = setTimeout(function () {
                    _logger.warn("getLayerShape request timed out");
                    executionDeferred.resolve(); // done listening for messages
                    resultDeferred.reject("timeout");
                }, MULTI_MESSAGE_TIMEOUT);
            }

            if (message.type === "javascript") {
                if (message.value instanceof Object && message.value.hasOwnProperty("path")) {
                    resultDeferred.resolve(message.value);
                } else if (message.value === "") {
                    // sendLayerShapeToNetworkClient returns a JSON object that is an
                    // empty string if there is no shape data on the layer;
                    resultDeferred.reject("layer does not contain a shape");
                }
            }
        });

        executionDeferred.promise.fail(function (err) {
            resultDeferred.reject(err);
        });

        return resultDeferred.promise;
    };

    Generator.prototype.getDeepBounds = function (layer) {
        var bounds;

        if (! layer.layers) {
            bounds = layer.bounds;
        }
        else {
            layer.layers.forEach(function (sub) {
                var childBounds = this.getDeepBounds(sub);

                if (!bounds) {
                    bounds = childBounds;
                } else {
                    bounds = { // Compute containing rect of union of bounds and childBounds
                        left:   Math.min(bounds.left,   childBounds.left),
                        top:    Math.min(bounds.top,    childBounds.top),
                        right:  Math.max(bounds.right,  childBounds.right),
                        bottom: Math.max(bounds.bottom, childBounds.bottom)
                    };
                }
            }, this);
        }

        if (layer.mask && layer.mask.bounds) {
            var maskBounds = layer.mask.bounds;
            
            bounds = { // compute containing rect of intersection of bounds and maskBounds
                left:   Math.max(bounds.left,   maskBounds.left),
                top:    Math.max(bounds.top,    maskBounds.top),
                right:  Math.min(bounds.right,  maskBounds.right),
                bottom: Math.min(bounds.bottom, maskBounds.bottom)
            };
        }

        return bounds;
    };

    /**
     * Computes the settings for getPixmap to achieve a certain scaling/padding result.
     *
     * staticInputBounds is essentially document.layers[i].bounds.
     * visibleInputBounds is essentially document.layers[i].boundsWithFX or pixmap.bounds (better).
     * paddedInputBounds is visibleInputBounds extended by document.layers[i].mask.bounds.
     * paddedInputBounds can therefore extend beyond document.layers[i].mask.bounds (due to effects).
     *
     * For a usage example, see the Image Assets plugin (https://github.com/adobe-photoshop/generator-assets).
     *
     * @param {!Object} settings How to scale the pixmap (includeing padding)
     * @param {?float}  settings.width  Requested width of the image
     * @param {?float}  settings.height Requested height of the image
     * @param {?float}  settings.scaleX Requested horizontal scaling of the image
     * @param {?float}  settings.scaleY Requested vertical scaling of the image
     * @param {!Object<String,float>} staticInputBounds  Bounds for the user-provided content (pixels, shapes)
     * @param {!Object<String,float>} visibleInputBounds Bounds for the visible content (user-provided + effects)
     * @param {!Object<String,float>} paddedInputBounds  Bounds for the whole image (visible + padding)
     */
    Generator.prototype.getPixmapParams = function (settings,
        staticInputBounds, visibleInputBounds, paddedInputBounds) {
        
        // For backwards compatibility
        paddedInputBounds = paddedInputBounds || visibleInputBounds;

        var // Scaling settings
            targetWidth         = settings.width,
            targetHeight        = settings.height,
            targetScaleX        = settings.scaleX || settings.scale || 1,
            targetScaleY        = settings.scaleY || settings.scale || 1,
            
            // Width and height of the bounds
            staticInputWidth    = staticInputBounds.right   - staticInputBounds.left,
            staticInputHeight   = staticInputBounds.bottom  - staticInputBounds.top,
            visibleInputWidth   = visibleInputBounds.right  - visibleInputBounds.left,
            visibleInputHeight  = visibleInputBounds.bottom - visibleInputBounds.top,
            paddedInputWidth    = paddedInputBounds.right   - paddedInputBounds.left,
            paddedInputHeight   = paddedInputBounds.bottom  - paddedInputBounds.top,
            
            // How much of the width is due to effects
            effectsInputWidth   = visibleInputWidth  - staticInputWidth,
            effectsInputHeight  = visibleInputHeight - staticInputHeight,
            // How much of the width is due to padding (mask)
            paddingInputWidth   = paddedInputWidth  - visibleInputWidth,
            paddingInputHeight  = paddedInputHeight - visibleInputHeight,

            // Designated image size
            paddedOutputWidthFloat = targetWidth  || (paddedInputWidth *
                                    (targetWidth ? (targetWidth / paddedInputWidth) : targetScaleX)),
            paddedOutputHeightFloat = targetHeight || (paddedInputHeight *
                                    (targetHeight  ? (targetHeight  / paddedInputHeight)  : targetScaleY)),

            // Effects are not scaled when the transformation is non-uniform
            effectsScaled       =
                (paddedOutputWidthFloat / paddedInputWidth) === (paddedOutputHeightFloat / paddedInputHeight),

            paddedOutputWidth   = Math.ceil(paddedOutputWidthFloat),
            paddedOutputHeight  = Math.ceil(paddedOutputHeightFloat),

            paddedOutputScaleX  = paddedOutputWidth  / paddedInputWidth,
            paddedOutputScaleY  = paddedOutputHeight / paddedInputHeight,

            // How much to scale everything that can be scaled (static + padding, maybe effects)
            scaleX              = effectsScaled ? paddedOutputScaleX : paddedOutputScaleX +
                                    (effectsInputWidth  * (paddedOutputScaleX - 1)) /
                                    (staticInputWidth  + paddingInputWidth),
            scaleY              = effectsScaled ? paddedOutputScaleY : paddedOutputScaleY +
                                    (effectsInputHeight * (paddedOutputScaleY - 1)) /
                                    (staticInputHeight + paddingInputHeight),

            // The expected size of the pixmap returned by Photoshop (does not include padding)
            visibleOutputWidth  = effectsScaled ? scaleX * visibleInputWidth :
                                    scaleX * staticInputWidth + effectsInputWidth,
            visibleOutputHeight = effectsScaled ? scaleY * visibleInputHeight :
                                    scaleY * staticInputHeight + effectsInputHeight;

        // The settings for getPixmap
        return {
            // For backwards compatibility
            expectedWidth:  visibleOutputWidth,
            expectedHeight: visibleOutputHeight,
            
            // For now: absolute scaling only
            inputRect: {
                left:   staticInputBounds.left,
                top:    staticInputBounds.top,
                right:  staticInputBounds.left + staticInputWidth,
                bottom: staticInputBounds.top  + staticInputHeight
            },
            outputRect: {
                left:   0,
                top:    0,
                right:  visibleOutputWidth  - effectsInputWidth  * (effectsScaled ? scaleX : 1),
                bottom: visibleOutputHeight - effectsInputHeight * (effectsScaled ? scaleY : 1)
            },
            
            // The padding depends on the actual size of the returned image, therefore provide a function
            getPadding: function (pixmapWidth, pixmapHeight) {
                // Find out if the mask extends beyond the visible pixels
                var paddingWanted;
                ["top", "left", "right", "bottom"].forEach(function (key) {
                    if (paddedInputBounds[key] !== visibleInputBounds[key]) {
                        paddingWanted = true;
                        return false;
                    }
                });

                // When Photoshop produces inaccurate results, the padding is adjusted to compensate
                // When no padding is requested, this may be unwanted, so return a padding of 0px
                if (!paddingWanted) {
                    return { left: 0, top: 0, right: 0, bottom: 0 };
                }

                var // How much padding is necessary in both dimensions
                    missingWidth  = paddedOutputWidth  - pixmapWidth,
                    missingHeight = paddedOutputHeight - pixmapHeight,
                    // How of the original padding was on which side (default 0 to counteract NaN)
                    leftRatio     = ((visibleInputBounds.left - paddedInputBounds.left) / paddingInputWidth)  || 0,
                    topRatio      = ((visibleInputBounds.top  - paddedInputBounds.top)  / paddingInputHeight) || 0,
                    // Concrete padding size on one side so the other side can use the rest
                    leftPadding   = Math.round(leftRatio * missingWidth),
                    topPadding    = Math.round(topRatio  * missingHeight);

                // Padding: how many transparent pixels to add on which side
                return {
                    left:   leftPadding,
                    top:    topPadding,
                    right:  missingWidth  - leftPadding,
                    bottom: missingHeight - topPadding
                };
            }
        };
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
     * @param {?number}  settings.ppi          The image's pixel density
     */
    Generator.prototype.savePixmap = function (pixmap, path, settings) {
        var self    = this,
            psPath  = self._photoshop._applicationPath,
            convert = require("./convert");

        // check that arguments are of the correct type
        pixmap.width          = parseInt(pixmap.width, 10);
        pixmap.height         = parseInt(pixmap.height, 10);
        pixmap.bitsPerChannel = parseInt(pixmap.bitsPerChannel, 10);
        if (settings.hasOwnProperty("quality")) {
            settings.quality  = parseInt(settings.quality, 10);
        }
        if (settings.hasOwnProperty("ppi")) {
            settings.ppi      = parseFloat(settings.ppi);
        }

        return convert.savePixmap(psPath, pixmap, path, settings);
    };
    

    /**
     * Get an SVG representing the layer. Returns a promise that resolves to an SVG string.
     * The SVG can optionally be scaled proportionately using the "scale" parameter of the "settings" object
     * 
     * @params {!integer} documentId Document ID
     * @params {!integer} layerId Layer ID
     * @params {?Object}  settings An object with params to request the pixmap
     * @params {?float} settings.scale  The factor by which to scale the SVG (1.0 for 100%)
     */
    Generator.prototype.getSVG = function (documentId, layerId, settings) {
        // documentId optional to avoid revving API
        documentId = typeof(documentId) === "number" ? documentId : null;

        var scale = settings && settings.hasOwnProperty("scale") ? settings.scale : 1;

        var params = { layerId: layerId,
                       layerScale: scale,
                       documentId: documentId };
        

        return (this.evaluateJSXFile("./jsx/getLayerSVG.jsx", params)
            .then(function (result) {
                return decodeURI(result.svgText);
            })
        );
    };


    /**
     *  Log a string in Photoshop's "Headlights" database for feature usage analysis.
     *  Note that the data will only actually be logged if the user has opted in to
     *  providing customer feedback. If they have not opted in, the string will be
     *  discarded.
     *
     *  This method is intended to be used only by Adobe-created Generator plugins,
     *  since third parties don't have a way to access headlights data.
     *
     *  @private
     * 
     *  @params {!string} event The string to log in Headlights
     *
     *  @return {Promise} resolved/rejected when request completes/errors
     */
    Generator.prototype._logHeadlights = function (event) {
        return this.evaluateJSXFile("./jsx/logHeadlights.jsx", { event : event });
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

    Generator.prototype.getPluginMetadata = function (directory) {
        var fs = require("fs"),
            resolve = require("path").resolve,
            metadata = null;

        // Make sure a directory was specified
        if (!fs.statSync(directory).isDirectory()) {
            throw new Error("Argument error: specified path is not a directory");
        }

        // Load metadata
        try {
            metadata = require(resolve(directory, "package.json"));
        } catch (metadataError) {
            throw new Error("Error reading package.json file for plugin at path '" +
                directory + "': " + metadataError.message);
        }

        // Ensure plugin has a name
        if (!(metadata && metadata.name && typeof metadata.name === "string")) {
            throw new Error("Invalid metadata for plugin at path '" + directory +
                "' (plugins must have a valid package.json file with 'name' property): " +
                JSON.stringify(metadata));
        }

        return metadata;
    };

    Generator.prototype.checkPluginCompatibility = function (metadata) {
        var result = {compatible: true, message: null};

        if (!metadata["generator-core-version"]) {
            // Still compatible, but has a warning.
            result.compatible = true;
            result.message = "Warning: Plugin '" + metadata.name +
                "' did not specify which versions of generator-core it is compatible with." +
                " It will be loaded anyway, but providing generator-core-version" +
                " in its package.json is recommended.";
        } else if (packageConfig.version &&
            !semver.satisfies(packageConfig.version, metadata["generator-core-version"])) {
            result.compatible = false;
            result.message = "The plugin " + metadata.name + " is incompatible with this version of generator-core." +
                " generator-core version: " + packageConfig.version +
                ", plugin compatibility: " + metadata["generator-core-version"];
        }

        return result;
    };

    Generator.prototype.loadPlugin = function (directory) {
        var metadata = null,
            compatibility = null,
            self = this;

        function handleIncompatiblePlugin(metadata) {
            self.alert(PLUGIN_INCOMPATIBLE_MESSAGE, [metadata.name]);
            // TODO: Record that we have given an alert for this plugin, and only
            // alert if we've never alerted for it before.
        }
        
        // Get the metadata
        try {
            metadata = self.getPluginMetadata(directory);
        } catch (metadataError) {
            throw new Error("Could not load plugin: " + metadataError.message);
        }

        // Check if it is compatible
        compatibility = self.checkPluginCompatibility(metadata);
        if (!compatibility.compatible) {
            handleIncompatiblePlugin(metadata);
            _logger.error(compatibility.message);
            throw new Error(compatibility.message);
        } else if (compatibility.message) {
            _logger.warn(compatibility.message);
        }

        // Check for uniqueness
        if (self._plugins[PLUGIN_KEY_PREFIX + metadata.name]) {
            throw new Error("Attempted to load a plugin with a name that is already used. Path: '" +
                directory + "', name: '" + metadata.name + "'");
        }

        // Do the actual plugin load
        try {
            _logger.debug("Loading plugin: %s", metadata.name);
            // NOTE: We don't need to worry about accidentally requiring the same plugin twice.
            // If the user did try to load it twice, require's caching would return the same
            // package.json both times (even if the package.json changed on disk), and so
            // we'd get the same name both times, and bail in the "if" branch above.
            var plugin = require(directory),
                config = self._config[metadata.name] || {};

            plugin.init(this, config, _loggerManager.createLogger(metadata.name));
            self._plugins[PLUGIN_KEY_PREFIX + metadata.name] = {
                metadata: metadata,
                plugin: plugin,
                config: config
            };
            _logger.debug("Plugin loaded: %s", metadata.name);
            self._logHeadlights("Plugin loaded: " + metadata.name);
            self._logHeadlights("Plugin version: " + metadata.name + ":" + metadata.version);
        } catch (loadError) {
            throw new Error("Could not load plugin at path '" + directory + "': " + loadError.message);
        }
    };

    /**
     * Returns an already-loaded plugin with the specified name. If no plugin
     * with that name has been loaded, returns null.
     */
    Generator.prototype.getPlugin = function (name) {
        var plugin = null;
        if (this._plugins[PLUGIN_KEY_PREFIX + name] &&
            this._plugins[PLUGIN_KEY_PREFIX + name].hasOwnProperty("plugin")) {
            plugin = this._plugins[PLUGIN_KEY_PREFIX + name].plugin;
        }

        return plugin;
    };

    Generator.prototype.checkConnection = function () {
        var self = this,
            aliveDeferred = Q.defer();

        var id = self._photoshop.sendKeepAlive();
        self._jsMessageDeferreds[id] = aliveDeferred;

        return aliveDeferred.promise;
    };
            
    exports.Generator         = Generator;
    exports.createGenerator   = createGenerator;
    exports._escapePluginId   = escapePluginId;
    exports._unescapePluginId = unescapePluginId;
        
}());
