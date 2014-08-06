/*
 * Copyright (c) 2014 Adobe Systems Incorporated. All rights reserved.
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

// Note: This module should be considered private and may be changed/removed at 
// any time with only a bump to the "patch" version number of generator-core. 
 

(function () {
    "use strict";

    var _origins = [{ x:0, y: 0}],
        _classnames = [],
        _psd;

    function pushOrigin(left, top) {
        _origins.push({ x: left, y:top });
    }

    function popOrigin() {
        if (_origins.length > 1) {
            _origins.pop();
        }
    }

    function getOrigin() {
        return _origins[_origins.length - 1];
    }

    function fetchWidth(layer) {
        var width;
        if (layer.bounds) {
            width = (layer.bounds.right - layer.bounds.left);
        }
        return width;
    }

    function fetchHeight(layer) {
        var height;
        if (layer.bounds) {
            height = (layer.bounds.bottom - layer.bounds.top);
        }
        return height;
    }

    function fetchFontFamily(layer) {
        if (layer.text && layer.text.textStyleRange) {

            return layer.text.textStyleRange.map(function (style) {
                return style.textStyle.fontName;
            });
        }
        return undefined;
    }

    function fetchFontSize(layer) {
        if (layer.text && layer.text.textStyleRange) {

            return layer.text.textStyleRange.map(function (style) {
                return style.textStyle.size.value;
            });
        }
        return undefined;
    }

    function fetchFontWeight(layer) {
        if (layer.text && layer.text.textStyleRange) {
            return layer.text.textStyleRange.map(function (style) {
                var styleName = style.textStyle.fontStyleName;
                styleName = /bold/i.exec(styleName);
                if (styleName) {
                    return styleName[0].toLowerCase();
                }
                return "normal";
            });
        }
        return undefined;
    }

    function fetchFontStyle(layer) {
        if (layer.text && layer.text.textStyleRange) {
            return layer.text.textStyleRange.map(function (style) {
                var styleName = style.textStyle.fontStyleName;
                styleName = /italic/i.exec(styleName);
                if (styleName) {
                    return styleName[0].toLowerCase();
                }
                return "normal";
            });
        }
        return undefined;
    }
    
    function fetchFontAlign(layer) {
        if (layer.text && layer.text.paragraphStyleRange) {
            return layer.text.paragraphStyleRange.map(function (style) {
                if ((style.paragraphStyle !== undefined) && (style.paragraphStyle.align !== undefined)) {
                    return style.paragraphStyle.align.toLowerCase();
                }
                return "left";
            });
        }
        return undefined;
    }

    function fetchBorderRadius(layer) {
        var corners = [];
        var path = layer.path;

        if (path &&
            path.pathComponents &&
            path.pathComponents[0].origin.type === "roundedRect") {
            var radii = path.pathComponents[0].origin.radii;
            var topRight = radii[0];
            var bottomRight = radii[1];
            var bottomLeft = radii[2];
            var topLeft = radii[3];
            if (topLeft === topRight &&
                topLeft === bottomRight &&
                topLeft === bottomLeft) {
                // Most common case: all the same
                corners = [topLeft];
            } else {
                // For now, specify all four corners in all other cases
                corners = [topLeft, topRight, bottomLeft, bottomRight];
            }

        }
        return corners;
    }

    function fetchOpacity(layer) {
        var opacity;
        if (layer.blendOptions &&
            layer.blendOptions.opacity) {
            opacity = layer.blendOptions.opacity.value / 100;
        }
        return opacity;
    }

    function decamelcase(string) {
        return string.replace(/([A-Z])/g, "-$1").toLowerCase();
    }

    function fetchBlendMode(layer) {
        var blendMode;
        if (layer.blendOptions &&
            layer.blendOptions.mode) {
            blendMode = layer.blendOptions.mode;
            blendMode = decamelcase(blendMode);
        }

        if (blendMode === "pass-Through") {
            return "normal";
        }
        
        return blendMode;
    }

    function getRGBColor(input, divide) {
        if (divide === undefined) {
            divide = 255;
        }
        return {
            "type": "rgb",
            "red":  input.red ? (input.red / divide) : 0,
            "green": input.green ? (input.green / divide) : 0,
            "blue": input.blue ? (input.blue / divide) : 0
        };
    }

    function fetchBackgroundColor(layer) {
        var bgcolor;

        if (!layer.fill) {
            return {};
        }

        var fill = layer.fill;

        function getColorStops(colors) {
            return colors.map(function (color) {
                var stop = {};
                stop.position = color.location / 4096.0;
                stop.color = getRGBColor(color.color);
                stop.midpoint = color.midpoint / 100;
                return stop;
            });
        }

        function getAlphaStops(colors) {
            return colors.map(function (color) {
                var stop = {};
                stop.position = color.location / 4096.0;
                stop.alpha = color.opacity.value / 100;
                stop.midpoint = color.midpoint / 100;
                return stop;
            });
        }

        if (fill.class === "solidColorLayer") {
            bgcolor = getRGBColor(fill.color);
        } else if (fill.class === "gradientLayer") {
            bgcolor = {
                "type": "angle-gradient",
                "gradientType": fill.type,
                "angle": 270 - (fill.angle ? fill.angle.value : 0),
                "colorstops": getColorStops(fill.gradient.colors),
                "alphastops": getAlphaStops(fill.gradient.transparency)
            };
            /* jshint bitwise: false */
            if ((fill.reverse !== true) ^ (fill.type === "radial")) {
            /* jshint bitwise: true */
                bgcolor.colorstops.reverse().forEach(function (s) {
                    s.position = 1 - s.position; s.midpoint = 1 - s.midpoint;
                });
                bgcolor.alphastops.reverse().forEach(function (s) {
                    s.position = 1 - s.position; s.midpoint = 1 - s.midpoint;
                });
            }
        }

        return bgcolor;
    }
    
    function fetchFontColor(layer) {
        if (layer.text && layer.text.textStyleRange) {
            return layer.text.textStyleRange.map(function (style) {
                var color = style.textStyle.color;
                if (color !== undefined) {
                    return getRGBColor(color);
                }
                    
                return getRGBColor({});
            });
        }
        return undefined;
    }

    function fetchTop(layer) {
        var top;

        if (layer.bounds) {
            var o = getOrigin();
            top = layer.bounds.top - o.y;
        }

        return top;
    }

    function fetchLeft(layer) {
        var left;

        if (layer.bounds) {
            var o = getOrigin();
            left = layer.bounds.left - o.x;
        }

        return left;
    }
    
    function fetchEffects(layer) {
        if (layer.layerEffects === undefined) {
            return undefined;
        }
            
        var retval = [];
        var shadow = {};
        var effect;
        
        if (layer.layerEffects.innerShadow !== undefined &&
            layer.layerEffects.innerShadow.enabled) {
            retval.push(shadow);
            effect = layer.layerEffects.innerShadow;
            shadow.type = "inner-shadow";
            if (effect.mode === undefined) {
                shadow.mode = "multiply";
            } else {
                shadow.blendMode = effect.mode;
            }
            if (effect.opacity === undefined) {
                shadow.opacity = 0.75;
            } else {
                shadow.opacity = effect.opacity.value / 100;
            }
            shadow.distance = effect.distance;
            if (effect.blur === undefined) {
                shadow.blur = 5;
            } else {
                shadow.blur = effect.blur;
            }
            if (effect.chokeMatte === undefined) {
                shadow.spread = 0;
            } else {
                shadow.spread = effect.chokeMatte * shadow.blur / 100;
            }
            if (effect.localLightingAngle === undefined) {
                shadow.angle = _psd.globalLight.angle;
            } else {
                shadow.angle = effect.localLightingAngle.value;
            }
            if (effect.color === undefined) {
                shadow.color = getRGBColor({});
            } else {
                shadow.color = getRGBColor(effect.color);
            }
        }
        
        if ((layer.layerEffects.dropShadow !== undefined) &&
            layer.layerEffects.dropShadow.enabled) {
            retval.push(shadow);
            effect = layer.layerEffects.dropShadow;
            shadow.type = "drop-shadow";
            shadow.blendMode = effect.mode;
            if (effect.opacity === undefined) {
                shadow.opacity = 0.75;
            } else {
                shadow.opacity = effect.opacity.value / 100;
            }
            shadow.distance = effect.distance;
            if (effect.blur === undefined) {
                shadow.blur = 5;
            } else {
                shadow.blur = effect.blur;
            }
            if (effect.chokeMatte === undefined) {
                shadow.spread = 0;
            } else {
                shadow.spread = effect.chokeMatte * shadow.blur / 100;
            }
            if (effect.localLightingAngle === undefined) {
                shadow.angle = _psd.globalLight.angle;
            } else {
                shadow.angle = effect.localLightingAngle.value;
            }
            if (effect.color === undefined) {
                shadow.color = getRGBColor({});
            } else {
                shadow.color = getRGBColor(effect.color);
            }
        }
            
        return retval;
    }
    
    function fetchFillOpacity(layer) {
        if ((layer.blendOptions === undefined) || (layer.blendOptions.fillOpacity === undefined)) {
            return undefined;
        }
            
        return layer.blendOptions.fillOpacity.value / 100;
    }
    
    function fetchStroke(layer) {
        if (layer.strokeStyle === undefined) {
            return undefined;
        }
            
        var s = layer.strokeStyle;
        var strokeStyle = {};
        strokeStyle.color = getRGBColor(s.strokeStyleContent.color);
        strokeStyle.opacity = s.strokeStyleOpacity.value / 100;
        strokeStyle.lineWidth =  s.strokeStyleLineWidth.value;
        switch (s.strokeStyleLineCapType) {
            case "strokeStyleRoundCap":
                strokeStyle.lineCap = "round"; break;
            case "strokeStyleSquareCap":
                strokeStyle.lineCap = "square"; break;
            //case "strokeStyleButtCap":
            default:
                strokeStyle.lineCap = "butt";
        }
        switch (s.strokeStyleLineJoinType) {
            case "strokeStyleRoundJoin":
                strokeStyle.lineJoin = "round"; break;
            case "strokeStylebevelJoin":
                strokeStyle.lineJoin = "bevel"; break;
            //case "strokeStyleMiterJoin":
            default:
                strokeStyle.lineJoin = "miter";
        }
        
        strokeStyle.miterLimit = s.strokeStyleMiterLimit;
        strokeStyle.dashes = s.strokeStyleLineDashSet;
        
        strokeStyle.lineDashOffset = s.strokeStyleLineDashOffset.value;
        
        return strokeStyle;
    }

    function getCSSName(layer) {
        // We want to convert the layer name to a valid CSS IDENT
        var l = "layer" + layer.index; 
        var wsSequence = false;

        function _toClass(c) {
            var ret = c;
            var skip = ".<>[]`~!@#$%^&*() {}|?/\\:;\"\',+";

            if (c.trim().length === 0) { // Whitespace?
                if (wsSequence === false) {
                    ret = "-"; // Convert first WS in a sequence to dash
                    wsSequence = true;
                } else {
                    ret = "";
                }
            } else {
                wsSequence = false;
            }

            if (skip.indexOf(c) >= 0) {
                ret = "";
            }

            return ret;
        }

        if (layer.name) {
            // Otherwise, lowercase everthing. Collapse 1+ whitespace to dash
            l = layer.name.toLowerCase();
            var buffer = l.split("");
            buffer = buffer.map(_toClass);
            l = buffer.join("") + "_" + layer.index;
        }

        return l;
    }

    var multiLayerFetchers = {
        "name": getCSSName,
        "top": fetchTop,
        "left": fetchLeft,
        "width": fetchWidth,
        "height": fetchHeight,
        "opacity": fetchOpacity,
        "blendMode": fetchBlendMode,
        "layerEffects": fetchEffects,
        "fillOpacity": fetchFillOpacity
    };

    var SpecializeFetchers = {
        "shapeLayer" : {
            "type" : function () { return "shape-layer"; },
            "color": fetchBackgroundColor,
            "topLeftRadius":  function (layer) { return fetchBorderRadius(layer)[0]; },
            "topRightRadius":  function (layer) { return fetchBorderRadius(layer)[1]; },
            "bottomLeftRadius":  function (layer) { return fetchBorderRadius(layer)[2]; },
            "bottomRightRadius": function (layer) { return fetchBorderRadius(layer)[3]; },
            "stroke": fetchStroke
        },
        "textLayer" : {
            "type" : function () { return "text-layer"; },
            "font-color": fetchFontColor,
            "font-family": fetchFontFamily,
            "font-size": fetchFontSize,
            "font-weight": fetchFontWeight,
            "font-style": fetchFontStyle,
            "font-align": fetchFontAlign,
            "stroke": fetchStroke
        },
        "layerSection" : {
            "type" : function () { return "group-layer"; },
            "layers": function (layer) {
                pushOrigin(layer.bounds.left, layer.bounds.top);
                var layers = [];
                if (layer.layers !== undefined) {
                    layer.layers.forEach(function (layer) {
                        var s = extractLayerStyleInfo(layer);
                        if (s !== undefined) {
                            layers.push(s);
                        }
                    });
                }
                popOrigin();
                return layers;
            }
        },
        "layer" : {
            "type" : function () { return "image-layer"; }
        },
        "backgroundLayer" : {
            "type" : function () { return "image-layer"; }
        }
    };

    function extractLayerStyleInfo(layer) {
        if (layer.visible === false) {
            return undefined;
        }
            
        var style = {};
        var value;

        // extract info common to all layers
        for (var property in multiLayerFetchers) {
            if (multiLayerFetchers.hasOwnProperty(property)) {
                value = multiLayerFetchers[property](layer);
                if (value !== undefined) {
                    style[property] = value;
                }
            }
        }

        var layerHandler = SpecializeFetchers[layer.type];
        //if (layerHandler === undefined) {
            ///TODO: error
        //} else 
        for (property in layerHandler) {
            if (layerHandler.hasOwnProperty(property)) {
                value = layerHandler[property](layer);
                if (value !== undefined) {
                    style[property] = value;
                }
            }
        }
        
        return style;
    }

    /**
     * Note: This API should be considered private and may be changed/removed at any 
     * time with only a bump to the "patch" version number of generator-core. 
     * Use at your own risk.
     *
     * Return a SON document for the specified document info
     * @param {Object} document retrieved from Generator.getDocumentInfo()
     *
     * @returns {Object} The SON document for the specified Generator document 
     */
   

    function extractStyleInfo(psd/*, opts*/) {
        var SON = {};
        var layers = psd.layers;
        _classnames = [];
        _psd = psd;
        SON.layers = [];
        layers.forEach(function (layer) {
            var s = extractLayerStyleInfo(layer);
            if (s !== undefined) {
                SON.layers.push(s);
            }
        });

        return SON;
    }


    exports._extractStyleInfo = extractStyleInfo;
}());
