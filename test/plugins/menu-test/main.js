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

    var path = require("path"),
        _generator = null,
        pluginName = path.dirname(__filename).split(path.sep).pop(),
        prefix = pluginName.replace(/[^A-Za-z0-9]/g, "");

    var states = {};

    var actions = {};

    var menus = [
        {
            id:     "1",
            name:   "enabled, not checked, toggles when chosen",
            delay:  0,
            enabled: true,
            checked: false,
            action: function () {
                setState("1", true, !states["1"].checked);
            }
        },
        {
            id:     "2",
            name:   "enabled, checked, toggles when chosen",
            delay:  0,
            enabled: true,
            checked: true,
            action: function () {
                setState("2", true, !states["2"].checked);
            }
        },
        {
            id:     "3",
            name:   "disabled, not checked, added after 5 sec, has Unicode: 'ひらがな'",
            delay:  5000,
            enabled: false,
            checked: false,
            action: function () {
                // nothing
            }
        },
        {
            id:     "4",
            name:   "disabled, checked, toggles when chosen, added after 5 sec",
            delay:  5000,
            enabled: false,
            checked: true,
            action: function () {
                setState("4", states["4"].enabled, !states["4"].checked);
            }
        },
        {
            id:     "5",
            name:   "enabled, not checked, causes enable/disable of prior menu, added after 10 sec",
            delay:  10000,
            enabled: true,
            checked: false,
            action: function () {
                setState("4", !states["4"].enabled, states["4"].checked);
            }
        },
        {
            id:     "6",
            name:   "enabled, not checked, toggles when chosen and adds text:",
            delay:  0,
            enabled: true,
            checked: false,
            nameSuffix: "",
            action: function () {
                this.nameSuffix += " hi";
                setState("6", true, !states["6"].checked, this.name + this.nameSuffix);
            }
        }
    ];

    function log(s) {
        console.log("[" + pluginName + "-" + process.pid + "] " + s);
    }

    function handleGeneratorMenuClicked(e) {
        log("menu chosen: '" + e.generatorMenuChanged.name + "'");
        if (actions[e.generatorMenuChanged.name]) {
            actions[e.generatorMenuChanged.name]();
        }

    }

    function setState(id, enabled, checked, displayName) {
        _generator.toggleMenu(prefix + id, enabled, checked, displayName).then(
            function () {
                states[id] = {enabled: enabled, checked: checked};
                log("toggled menu with id " + id + " to enabled: " + enabled + ", checked: " + checked);
            }, function () {
                log("FAILED to toggle menu with id " + id + " to enabled: " + enabled + ", checked: " + checked);
            }
        );
    }

    function init(generator) {
        _generator = generator;

        log("plugin started");

        menus.forEach(function (menu) {
            setTimeout(function () {
                _generator.addMenuItem(
                    prefix + menu.id,
                    process.pid + "-" + pluginName + " " + menu.name,
                    menu.enabled,
                    menu.checked
                ).then(
                    function () {
                        states[menu.id] = {enabled: menu.enabled, checked: menu.checked};
                        actions[prefix + menu.id] = menu.action.bind(menu);
                        log("created menu with id " + menu.id +
                            " and string '" + menu.name +
                            "' after " + menu.delay + "ms");
                    }, function () {
                        log("FAILED to create menu with id " + menu.id +
                            " and string '" + menu.name +
                            "' after " + menu.delay + "ms");
                    }
                );
            }, menu.delay);
            log("queued adding of menu with id " + menu.id +
                " and string '" + menu.name +
                "' in " + menu.delay + "ms");
        });

        _generator.onPhotoshopEvent("generatorMenuChanged", handleGeneratorMenuClicked);
    
    }

    exports.init = init;

}());
