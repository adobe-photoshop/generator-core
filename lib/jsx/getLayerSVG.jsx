// Copyright 2012-2014 Adobe Systems Incorporated.  All Rights reserved.

//
// Convert layer data into SVG output.
//

// ExtendScript is a different planet.  Coax JSHint to be accepting of that.

/* jshint bitwise: false, strict: false, quotmark: false, forin: false,
   multistr: true, laxbreak: true, maxlen: 255, esnext: true */
/* global $, app, File, ActionDescriptor, ActionReference, executeAction, PSLayerInfo,
   UnitValue, DialogModes, cssToClip, stripUnits, round1k, GradientStop, stringIDToTypeID,
   Folder, kAdjustmentSheet, kLayerGroupSheet, kHiddenSectionBounder, kVectorSheet,
   kTextSheet, kPixelSheet, kSmartObjectSheet, Units, params, runGetLayerSVGfromScript,
   typeOrdinal, typeNULL, eventSelect, charIDToTypeID, classDocument */
/* exported runCopyCSSFromScript */

// The built-in "app.path" is broken on the Mac, so we roll our own.
function getPSAppPath()
{
    const kexecutablePathStr = stringIDToTypeID("executablePath");

    var desc = new ActionDescriptor();
    var ref = new ActionReference();
    ref.putProperty(charIDToTypeID('Prpr'), kexecutablePathStr);
    ref.putEnumerated(charIDToTypeID('capp'), charIDToTypeID('Ordn'),
                      charIDToTypeID('Trgt'));
    desc.putReference(charIDToTypeID('null'), ref);
    var result = executeAction(charIDToTypeID('getd'), desc, DialogModes.NO);
    return File.decode(result.getPath(kexecutablePathStr));
}

// Select the document by ID
function setDocumentByID(id)
{
    var desc = new ActionDescriptor();
    var ref = new ActionReference();
    ref.putIdentifier(classDocument, id);
    desc.putReference(typeNULL, ref);
    executeAction(eventSelect, desc, DialogModes.NO);
}

// This uses many routines from CopyCSS, so load the script but tell it not to execute first.
if (typeof cssToClip === "undefined")
{
    var runCopyCSSFromScript = true;
    var appFolder = { Windows: "/", Macintosh: "/../" };
    $.evalFile(getPSAppPath() + appFolder[File.fs] + "Required/CopyCSSToClipboard.jsx");
}

const ksendLayerThumbnailToNetworkClientStr = app.stringIDToTypeID("sendLayerThumbnailToNetworkClient");
const krawPixmapFilePathStr = app.stringIDToTypeID("rawPixmapFilePath");

const kformatStr = app.stringIDToTypeID("format");
// const kselectedLayerStr = app.stringIDToTypeID("selectedLayer");
const kwidthStr = app.stringIDToTypeID("width");
const kheightStr = app.stringIDToTypeID("height");
const kboundsStr = app.stringIDToTypeID("bounds");
const klayerIDStr = app.stringIDToTypeID("layerID");

function ConvertSVG()
{
    // Construction is actually done by "reset" function.
}

var svg = new ConvertSVG();

svg.reset = function ()
{
    this.svgText = "";
    this.svgDefs = "";
    this.gradientID = 0;
    this.filterID = 0;
    this.fxGroupCount = [0];
    this.savedColorMode = null;
    this.currentLayer = null;
    this.saveUnits = null;
    this.startTime = 0;
    this.maxStrokeWidth = 0;
    this.savedGradients = [];
    this.gradientDict = {};
    // Yes, you really need all this gobbledygook
    this.svgHeader = ['<svg ',
                      ' xmlns="http://www.w3.org/2000/svg"',
                      ' xmlns:xlink="http://www.w3.org/1999/xlink"',
                      '>\n'].join('\n');
};

// Convert special characters to &#NN; form.  Note '\r' is
// left in as an exception so multiple text spans are processed.
svg.HTMLEncode = function (str)
{
    var i, result = [];
    for (i = 0; i < str.length; ++i)
    {
        var c = str[i];
        result[i] = ((c < "A" && c !== "\r") || c > "~" || (c > "Z" && c < "a"))
                        ? "&#" + c.charCodeAt() + ";" : str[i];
    }
    return result.join("");
};

// Switch document color mode
// Modes: "RGBColorMode", "CMYKColorMode", "labColorMode"
svg.changeColorMode = function (dstMode)
{
    var sid = stringIDToTypeID;
    // Add the "Mode" suffix if it's missing
    if (! dstMode.match(/Mode$/)) {
        dstMode += "Mode";
    }
    var desc = new ActionDescriptor();
    desc.putClass(sid("to"), sid(dstMode));
    desc.putBoolean(sid("merge"), false);
    desc.putBoolean(sid("rasterize"), false);
    executeAction(sid("convertMode"), desc, DialogModes.NO);
};

svg.documentColorMode = function ()
{
    // Reports "colorSpace:CMYKColorEnum", "colorSpace:RGBColor", "colorSpace:labColor"
    var s = cssToClip.getDocAttr("mode");
    s = s.replace(/^colorSpace:/, "").replace(/Enum$/, ""); // Strip off excess
    return s;
};

// Call internal PS code to write the current layer's pixels and convert it to PNG.
// Note this takes care of encoding it into base64 format (ES is too slow at this).
svg.writeLayerPNGfile = function (path)
{
    var desc = new ActionDescriptor();

    //    desc.putBoolean( kselectedLayerStr, true );
    desc.putInteger(klayerIDStr, this.currentLayer.layerID);
    desc.putString(krawPixmapFilePathStr, path);
    desc.putBoolean(kboundsStr, true);
    desc.putInteger(kwidthStr, 10000);
    desc.putInteger(kheightStr, 10000);
    desc.putInteger(kformatStr, 2); // Want raw pixels, not unsupported JPEG
    executeAction(ksendLayerThumbnailToNetworkClientStr, desc, DialogModes.NO);
};

// Make the last edit to the document vanish from this history state.
// This is so we can silently move the layer to the origin and back.
svg.killLastHistoryState = function ()
{
    const classHistoryState       = app.charIDToTypeID('HstS');
    const enumLast                = app.charIDToTypeID('Lst ');
    const eventDelete             = app.charIDToTypeID('Dlt ');
    const keyCurrentHistoryState  = app.charIDToTypeID('CrnH');

    // Select the last history state
    var selDesc = new ActionDescriptor();
    var selRef = new ActionReference();
    selRef.putEnumerated(classHistoryState, typeOrdinal, enumLast);
    selDesc.putReference(typeNULL, selRef);
    executeAction(eventSelect, selDesc, DialogModes.NO);

    // Nuke it
    var delDesc = new ActionDescriptor();
    var delRef = new ActionReference();
    delRef.putProperty(classHistoryState, keyCurrentHistoryState);
    delDesc.putReference(typeNULL, delRef);
    executeAction(eventDelete, delDesc, DialogModes.NO);
};

// Setting this to "false" tunes out Generator, so changes made in the script
// are not tracked by Generator.
svg.enableGeneratorTrack = function (flag)
{
    const kgeneratorEnableTrack = app.stringIDToTypeID("generatorTrackingEnable");
    const keyEnabled = app.charIDToTypeID('enab');

    var desc = new ActionDescriptor();
    desc.putBoolean(keyEnabled, flag);
    executeAction(kgeneratorEnableTrack, desc, DialogModes.NO);
};

svg.reset();

// Set the current layer to process.  This accepts a layer index number, a DOM layer,
// or an existing PSLayerInfo object.
svg.setCurrentLayer = function (theLayer)
{
    if (typeof theLayer === "number") {
        this.currentLayer = new PSLayerInfo(theLayer - cssToClip.documentIndexOffset);
    }
    else
    if ((typeof theLayer === "object") // Check for DOM layer
        && (typeof theLayer.typename !== "undefined")
        && ((theLayer.typename === "ArtLayer") || (theLayer.typename === "LayerSet"))) {
        this.currentLayer = new PSLayerInfo(theLayer.itemIndex - cssToClip.documentIndexOffset);
    }
    else {
        this.currentLayer = theLayer;   // Existing PSLayerInfo object
    }
};

svg.getLayerAttr = function (keyString, layerDesc)
{
    return this.currentLayer.getLayerAttr(keyString, layerDesc);
};

svg.addText = function (s)
{
    this.svgText += s;
};

// For adding name="value" style parameters.
svg.addParam = function (paramName, value)
{
    this.addText(" " + paramName + '="' + value + '"');
};

// Definitions (such as linear gradients) must be collected and output ahead
// of the rest of the SVG text.  
svg.addDef = function (s)
{
    this.svgDefs += s;
};

function SavedGradient(info, colorStops, url, minOpacity)
{
    this.info = info;
    this.minOpacity = minOpacity;
    this.colorStops = [];
    // Make an explicit copy, so calls to "reverse" don't hammer the copy
    for (var i in colorStops) {
        this.colorStops.push(colorStops[i].copy());
    }
    this.url = url;
}

SavedGradient.prototype.match = function (info, colorStops)
{
    if ((this.info === info) && (this.colorStops.length === colorStops.length))
    {
        var i;
        for (i in colorStops) {
            if (this.colorStops[i] !== colorStops[i]) {
                return false;
            }
        }
        return true;
    }
    return false;
};

// Collect gradient information
svg.getGradient = function (useLayerFX)
{
    // "false" says those defined by layerFX are skipped.
    useLayerFX = (typeof useLayerFX === "undefined") ? false : useLayerFX;
    
    var gradInfo = this.currentLayer.gradientInfo(useLayerFX);
    var colorStops = this.currentLayer.gradientColorStops();
    var gradientURL = null;
    
    function addCoord(coord, v)
    {
        if (v < 0) {
            svg.addDef(' ' + coord + '1="' + Math.abs(v) + '%" ' + coord + '2="0%"');
        }
        else {
            svg.addDef(' ' + coord + '1="0%" ' + coord + '2="' + v + '%"');
        }
    }

    if (gradInfo && colorStops)
    {
        var i, globalOpacity = gradInfo.opacity;
        // If we've seen this gradient before, just return the URL for it
        for (i in this.savedGradients) {
            if (this.savedGradients[i].match(gradInfo, colorStops)) {
                return this.savedGradients[i].url;
            }
        }
                
        // Otherwise, make a new URL and stash it for future reference
        gradientURL = "url(#PSgrad_" + this.gradientID + ")";

        var minOpacity = globalOpacity;
        for (i in colorStops) {
            if (colorStops[i].m / 100 < minOpacity) {
                minOpacity = colorStops[i].m / 100;
            }
        }

        this.savedGradients.push(new SavedGradient(gradInfo, colorStops, gradientURL, minOpacity));
        this.gradientDict[gradientURL] = this.savedGradients[this.savedGradients.length - 1];

        this.addDef("<" + gradInfo.type + "Gradient " + 'id="PSgrad_' + this.gradientID + '"');
        if (gradInfo.type === "linear")
        {
            // SVG wants the angle in cartesian, not polar, coords. 
            var angle = stripUnits(gradInfo.angle) * Math.PI / 180.0;
            var xa = Math.cos(angle) * 100, ya = -Math.sin(angle) * 100;
            addCoord("x", round1k(xa));
            addCoord("y", round1k(ya));
        }
        this.addDef('>\n');
        
        // reverse is applied only to color values, not stop locations
        
        if (gradInfo.reverse) {
            colorStops = GradientStop.reverseStoplist(colorStops);
        }

        var svgStops = [];
        for (var c in colorStops) {
            svgStops.push('  <stop offset="' +  Math.round(colorStops[c].location) + '%"'
                                    + ' stop-color="' + colorStops[c].colorString(true)
                                    + '" stop-opacity="' + ((colorStops[c].m / 100) * globalOpacity) + '" />');
        }
        this.addDef(svgStops.join("\n") + "\n");
        this.addDef("</" + gradInfo.type + "Gradient>\n");
        this.gradientID++;
    }
    return gradientURL;
};

svg.addGradientOverlay = function ()
{
    var gradOverlay = this.getLayerAttr("layerEffects.gradientFill");
    
    if (gradOverlay && this.getLayerAttr("layerFXVisible") && gradOverlay.getVal("enabled")) {
        return this.getGradient(true);  // Explictly ask for layerFX gradient
    }
    return null;
};

// Substitute filter parameters (delimited with $dollar$) using the params dictionary
svg.replaceKeywords = function (filterStr, params)
{
    var i, replaceList = filterStr.match(/[$](\w+)[$]/g);
    if (replaceList) {
        for (i = 0; i < replaceList.length; ++i) {
            filterStr = filterStr.replace(replaceList[i], params[replaceList[i].split('$')[1]]);
        }
    }
    return filterStr;
};

svg.replaceFilterKeys = function (filterStr, params)
{
    this.addDef(this.replaceKeywords(filterStr, params));
    this.pushFXGroup('filter',  'url(#' + params.filterTag + ')');
};

// Note each effect added for a particular layer requires a separate SVG group.
svg.pushFXGroup = function (groupParam, groupValue)
{
    this.addText("<g");
    this.addParam(groupParam, groupValue);
    this.addText(">\n");
    this.fxGroupCount[0]++;
};

svg.popFXGroups = function ()
{
    var i;
    if (this.fxGroupCount[0] > 0)
    {
        for (i = 0; i < this.fxGroupCount[0]; ++i) {
            this.addText("</g>");
        }
        this.addText("\n");
        this.fxGroupCount[0] = 0;
    }
};

svg.psModeToSVGmode = function (psMode)
{
    psMode = psMode.replace(/^blendMode[:]\s*/, ""); // Remove enum class
    var modeMap = { 'colorBurn': null, 'linearBurn': 'multiply', 'darkenColor': null, 'multiply': 'multiply',
                    'lighten': 'lighten', 'screen': 'screen', 'colorDodge': null, 'linearDodge': 'lighten',
                    'lighterColor': 'normal', 'normal': 'normal', 'overlay': null, 'softLight': null,
                    'hardLight': 'normal', 'vividLight': null, 'linearLight': 'normal', 'dissolve': null,
                    'pinLight': 'normal', 'hardMix': null, 'difference': 'lighten', 'exclusion': 'lighten',
                    'subtract': null, 'divide': null, 'hue': 'normal', 'saturation': null, 'color': 'normal',
                    'luminosity': null, 'darken': 'darken' };
    return modeMap[psMode];
};

svg.addColorOverlay = function ()
{
    var overDesc = this.getLayerAttr("layerEffects.solidFill");
    if (overDesc && overDesc.getVal("enabled") && this.getLayerAttr("layerFXVisible"))
    {
        var params = { filterTag: "Filter_" + this.filterID++,
                       color: this.currentLayer.replaceDescKey('flood-color="$color$"', overDesc)[1],
                       opacity: round1k(stripUnits(overDesc.getVal("opacity")) / 100.0),
                       mode: this.psModeToSVGmode(overDesc.getVal("mode")) };

        if (! params.mode) {
            return;         // Bail on unsupported transfer modes
        }
            
        var filterStr =
'<filter id="$filterTag$">\
  <feFlood $color$ flood-opacity="$opacity$" result="floodOut" />\
  <feComposite operator="atop" in="floodOut" in2="SourceGraphic" result="compOut" />\
  <feBlend mode="$mode$" in="compOut" in2="SourceGraphic" />\
</filter>\n';
        this.replaceFilterKeys(filterStr, params);
    }
};

svg.addInnerShadow = function ()
{
    var inshDesc = this.getLayerAttr("layerEffects.innerShadow");
    if (inshDesc && inshDesc.getVal("enabled") && this.getLayerAttr("layerFXVisible"))
    {
        var mode = this.psModeToSVGmode(inshDesc.getVal("mode"));
        // Some of the PS modes don't do anything with this effect
        if (! mode) {
            return;
        }

        var offset = PSLayerInfo.getEffectOffset(inshDesc);
        
        var params = { filterTag: "Filter_" + this.filterID++,
                       dx: stripUnits(offset[0]), dy: stripUnits(offset[1]),
                       blurDist: round1k(Math.sqrt(stripUnits(inshDesc.getVal("blur")))),
                       inshColor: this.currentLayer.replaceDescKey('flood-color="$color$"', inshDesc)[1],
                       opacity: round1k(stripUnits(inshDesc.getVal("opacity")) / 100.0),
                       mode: mode };
        
        var filterStr =
'<filter id="$filterTag$">\
  <feOffset in="SourceAlpha" dx="$dx$" dy="$dy$" />\
  <feGaussianBlur result="blurOut" stdDeviation="$blurDist$" />\
  <feFlood $inshColor$ result="floodOut" />\
  <feComposite operator="out" in="floodOut" in2="blurOut" result="compOut" />\
  <feComposite operator="in" in="compOut" in2="SourceAlpha" />\
  <feComponentTransfer><feFuncA type="linear" slope="$opacity$"/></feComponentTransfer>\
  <feBlend mode="$mode$" in2="SourceGraphic" />\
</filter>\n';
        this.replaceFilterKeys(filterStr, params);
    }
};

// Create drop shadows via SVG filter functions.
svg.addDropShadow = function ()
{
    // Remember, rectangles are [Left, Top, Bottom Right].  Strip the units
    // because SVG chokes on the space between the number and 'px'.  We'll add it back later.
    function rectPx(r) {
        var i, rpx = [];
        for (i in r) {
            rpx.push(r[i].as('px'));
        }
        return rpx;
    }

    var dsInfo = this.currentLayer.getDropShadowInfo();
    if (dsInfo)
    {
        var strokeWidth = 0;
        var agmDesc = this.currentLayer.getLayerAttr("AGMStrokeStyleInfo");
        if (agmDesc && agmDesc.getVal("strokeEnabled")
            && (strokeWidth = agmDesc.getVal("strokeStyleLineWidth")))
        {
            strokeWidth = stripUnits(strokeWidth);
        }

        // The filter needs to specify the bounds of the result.
        var fxBounds = rectPx(this.currentLayer.getBounds());

        var params = { filterTag: "Filter_" + this.filterID++,
                       xoffset: 'x="' + (fxBounds[0] - strokeWidth) + 'px"',
                       yoffset: 'y="' + (fxBounds[1] - strokeWidth) + 'px"',
                       fxWidth: 'width="' + (fxBounds[2] - fxBounds[0] + strokeWidth) + 'px"',
                       fxHeight: 'height="' + (fxBounds[3] - fxBounds[1] + strokeWidth) + 'px"',
                       dx: stripUnits(dsInfo.xoff), dy: stripUnits(dsInfo.yoff),
                       // SVG uses "standard deviation" vs. pixels for the blur distance; sqrt is a rough approximation
                       blurDist: round1k(Math.sqrt(stripUnits(dsInfo.dsDesc.getVal("blur")))),
                       dsColor: this.currentLayer.replaceDescKey('flood-color="$color$"', dsInfo.dsDesc)[1],
                       opacity: round1k(stripUnits(dsInfo.dsDesc.getVal("opacity")) / 100.0) };

        // By default, the filter extends 10% beyond the bounds of the object.
        // x, y, width, height need to specify the entire affected region; 
        // "userSpaceOnUse" hard codes it to the object's coords
        var filterDef =
'<filter filterUnits="userSpaceOnUse" id="$filterTag$" $xoffset$ $yoffset$ $fxWidth$ $fxHeight$  >\
  <feOffset in="SourceAlpha" dx="$dx$" dy="$dy$" />\
  <feGaussianBlur result="blurOut" stdDeviation="$blurDist$" />\
  <feFlood $dsColor$ result="floodOut" />\
  <feComposite operator="atop" in="floodOut" in2="blurOut" />\
  <feComponentTransfer><feFuncA type="linear" slope="$opacity$"/></feComponentTransfer>\
  <feMerge>\n    <feMergeNode/>\n    <feMergeNode in="SourceGraphic"/>\n  </feMerge>\
</filter>\n';
        this.replaceFilterKeys(filterDef, params);
    }
};

svg.addLayerFX = function ()
{
    // Gradient overlay layerFX are handled by just generating another copy of the shape
    // with the desired gradient fill, rather than using an SVG filter
    var saveCount = this.fxGroupCount[0];
    this.addDropShadow();
    this.addInnerShadow();
    this.addColorOverlay();
    // Return true if an effect was actually generated.
    return saveCount !== this.fxGroupCount[0];
};

svg.addOpacity = function (combine)
{
    var colorOver = this.getLayerAttr("layerEffects.solidFill.enabled") && this.getLayerAttr("layerFXVisible");
    combine = (colorOver || (typeof combine === "undefined")) ? false : combine;
    var fillOpacity = this.getLayerAttr("fillOpacity") / 255;
    // Color overlay replaces fill opacity if it's enabled.
    if (colorOver) {
        fillOpacity = this.getLayerAttr("layerEffects.solidFill.opacity");
    }
    var opacity = this.getLayerAttr("opacity") / 255;
    
    if (combine)
    {
        opacity *= fillOpacity;
        if (opacity < 1.0) {
            this.addParam("opacity", round1k(opacity));
        }
    }
    else
    {
        if (fillOpacity < 1.0) {
            this.addParam("fill-opacity", round1k(fillOpacity));
        }
        if (opacity < 1.0) {
            this.addParam("opacity", round1k(opacity));
        }
    }
};

//
// Add an attribute to the SVG output.  Note items delimited
// in $'s are substituted with values looked up from the layer data
// e.g.: 
//     border-width: $AGMStrokeStyleInfo.strokeStyleLineWidth$;"
// puts the stroke width into the output.  If the descriptor in the $'s
// isn't found, no output is added.
//
svg.addAttribute = function (attrText, baseDesc)
{
    var result = this.currentLayer.replaceDescKey(attrText, baseDesc);
    var replacementFailed = result[0];
    attrText = result[1];
    
    if (! replacementFailed) {
        this.addText(attrText);
    }
    return !replacementFailed;
};

// Text items need to try the base, default and baseParentStyle descriptors
svg.addAttribute2 = function (attrText, descList)
{
    var i = 0;
    while ((i < descList.length) && (!descList[i] || ! this.addAttribute(attrText, descList[i]))) {
        i += 1;
    }
};

svg.getVal2 = function (attrName, descList)
{
    var i = 0;
    var result = null;
    while ((i < descList.length) && ((! descList[i]) || !(result = descList[i].getVal(attrName)))) {
        i += 1;
    }

    return result;
};

// Process shape layers
svg.getShapeLayerSVG = function ()
{
    var self = this;
    var agmDesc = this.currentLayer.getLayerAttr("AGMStrokeStyleInfo");
    var capDict = {"strokeStyleRoundCap": 'round', "strokeStyleButtCap": 'butt',
                   "strokeStyleSquareCap": 'square'};
    var joinDict = {"strokeStyleBevelJoin": 'bevel', "strokeStyleRoundJoin": 'round',
                    "strokeStyleMiterJoin": 'miter'};
                    
    function hasStroke() {
        return (agmDesc && agmDesc.getVal("strokeEnabled"));
    }
                    
    function addStroke() {
        if (hasStroke())
        {
            svg.addAttribute(' stroke="$strokeStyleContent.color$"', agmDesc);
            svg.addAttribute(' stroke-width="$strokeStyleLineWidth$"', agmDesc);
            var strokeWidth = stripUnits(agmDesc.getVal("strokeStyleLineWidth"));
            self.maxStrokeWidth = Math.max(strokeWidth, self.maxStrokeWidth);

            var dashes = agmDesc.getVal("strokeStyleLineDashSet", false);
            if (dashes && dashes.length)
            {
                // Patch the "[0,2]" dash pattern from the default dotted style, else the stroke
                // vanishes completely.  Need to investigate further someday.
                if ((dashes.length === 2) && (dashes[0] === 0) && (dashes[1] === 2)) {
                    dashes = [strokeWidth / 2, strokeWidth * 2];
                }
                else {
                    for (var i in dashes) {
                        dashes[i] = dashes[i] * strokeWidth;
                    }
                }
                svg.addParam('stroke-dasharray', dashes.join(", "));
            }
            
            var cap = agmDesc.getVal("strokeStyleLineCapType");
            if (cap) {
                svg.addParam('stroke-linecap', capDict[cap]);
            }

            var join = agmDesc.getVal("strokeStyleLineJoinType");
            if (join) {
                svg.addParam('stroke-linejoin', joinDict[join]);
            }
        }

        // Check for layerFX style borders
        var fxDesc = svg.getLayerAttr("layerEffects.frameFX");
        if (fxDesc && fxDesc.getVal("enabled")
            && (fxDesc.getVal("paintType") === "solidColor"))
        {
            svg.addAttribute(" stroke-width=$strokeStyleLineWidth$", fxDesc);
            svg.addAttribute(" stroke=$strokeStyleContent.color$", fxDesc);
        }
    }

    // Layer fx need to happen first, so they're defined in enclosing groups
    this.addLayerFX();
    var gradOverlayID = this.addGradientOverlay();

    // For now, Everything Is A Path.  We'll revisit this when shape meta-data is available.
    this.addText("<path fill-rule=\"evenodd\" ");
    
    // If there's a gradient overlay effect, the stroke must be added there.
    if (! gradOverlayID) {
        addStroke();
    }

    this.addOpacity();

    var gradientID = this.getGradient();
    if (!agmDesc || (agmDesc && agmDesc.getVal("fillEnabled")))
    {
        if (gradientID) {
            this.addParam('fill', gradientID);
        }
        else {
            this.addAttribute(' fill="$adjustment.color$"');
        }
    }
    else {
        this.addAttribute(' fill="none"');
    }

    this.addText('\n d="' + this.getLayerAttr("layerVectorPointData") + '"');
    this.addText('/>\n');

    this.popFXGroups();
    
    if (gradOverlayID)
    {
        this.addText("<path");
        addStroke();
        this.addParam('fill', gradOverlayID);
        this.addText('\n d="' + this.getLayerAttr("layerVectorPointData") + '"');
        this.addText('/>\n');
    }
    
    // A solid fill layerFX trashes the stroke, so we over-write it with one outside of the solidFill layer effect group
    if (!gradOverlayID && this.getLayerAttr("layerEffects.solidFill.enabled") && hasStroke())
    {
        this.addText('<path fill="none"');
        addStroke();
        this.addText('\n d="' + this.getLayerAttr("layerVectorPointData") + '"');
        this.addText('/>\n');
    }
};

// This works for solid colors and gradients; other stuff, not so much
svg.getAdjustmentLayerSVG = function ()
{
    // Layer fx need to happen first, so they're defined in enclosing groups
    this.addLayerFX();
    var gradOverlayID = this.addGradientOverlay();

    var self = this;
    function addRect()
    {
        self.addText("<rect ");
        self.addAttribute('x="$left$" y="$top$" width="$width$" height="$height$" ',
                          self.getLayerAttr("bounds"));
    }

    addRect();
    this.addOpacity();

    var gradientID = this.getGradient();
    if (gradientID) {
        this.addParam('fill', gradientID);
    }
    else {
        this.addAttribute(' fill="$adjustment.color$"');
    }
    this.addText("/>\n");

    this.popFXGroups();
    
    if (gradOverlayID)
    {
        addRect();  // Add another rect with the gradient overlay FX
        this.addParam('fill', gradOverlayID);
        this.addText('\n d="' + this.getLayerAttr("layerVectorPointData") + '"');
        this.addText('/>\n');
    }
};

// This is a wrapper for the actual code (getTextlayerSVG1), because
// we may need to run it twice if gradients are applied.
svg.getTextLayerSVG = function ()
{
    var gradientURL = this.getGradient(true);
    
    if (gradientURL)
    {
        var minOpacity = this.gradientDict[gradientURL].minOpacity;
        this.getTextLayerSVG1(gradientURL);
        if (this.getLayerAttr("layerEffects.gradientFill") && (minOpacity < 1)) {
            this.getTextLayerSVG1();    // We need the base color as well
        }
    }
    else {
        this.getTextLayerSVG1();
    }
};

// Text; just basic functionality for now; paragraph style text is not handled yet.
svg.getTextLayerSVG1 = function (fillColor)
{
    function isStyleOn(textDesc, styleKey, onText)
    {
        var styleText = textDesc.getVal(styleKey);
        return (styleText && (styleText.search(onText) >= 0));
    }
    var xfm = function () {};
    var midval = function () {}; // For shutting up JSHint

    var textDesc = this.getLayerAttr("textKey.textStyleRange.textStyle");
    var leftMargin = "0";
    var textBottom = "0";
    var textDescList = [textDesc];
    var defaultDesc = this.getLayerAttr("textKey.paragraphStyleRange.paragraphStyle.defaultStyle");
    textDescList.push(defaultDesc);
    var baseParentDesc = textDesc.getVal('baseParentStyle');
    textDescList.push(baseParentDesc);

    if (textDesc)
    {
        this.addLayerFX();
        this.addText('<text');
        var boundsDesc = this.getLayerAttr("boundsNoEffects");
        if (textDesc.getVal("autoKern") === "metricsKern") {
            this.addText(' kerning="auto"');
        }
        this.addAttribute2(' font-family="$fontName$"', textDescList);
        if (typeof fillColor === "undefined") {
            this.addAttribute(' fill="$color$"', textDesc);
        }
        else {
            this.addParam('fill', fillColor);
        }
        this.addOpacity();
        
        var transformMatrixUsed = false;
        var textXform = this.getLayerAttr("textKey.transform");
        // Accomodate PS text baseline for vertical position
        if (textXform)
        {
            xfm = function (key) { return textXform.getVal(key); };
            var xx = xfm("xx"), xy = xfm("xy"), yx = xfm("yx"),
                yy = xfm("yy"), tx = xfm("tx"), ty = xfm("ty");
            
            // Check to make sure it's not an identity matrix
            if (! ((xx === 1) && (xy === 0) && (yx === 0)
                && (yy === 1) && (tx === 0) && (ty === 0)))
            {
                // "boundsDesc" is the bounding box of the transformed text (in doc coords)
                // Original (untransformed, untranslated) text bounding box
                var originalTextBounds = this.getLayerAttr("textKey.boundingBox");
                midval = function (key0, key1, desc, op) {
                    return op(stripUnits(desc.getVal(key0)), stripUnits(desc.getVal(key1))) / 2.0;
                };
                // Find the vector representing the bottom left corner of
                // the original (untransformed) text bounds centered on the origin
                var obx = -midval("left", "right", originalTextBounds, function (a, b) { return b - a; });
                var oby = midval("top", "bottom", originalTextBounds, function (a, b) { return -b - a; });
                // Transform the vector by the matrix
                var tbx = obx * xx + oby * yx + tx;
                var tby = obx * xy + oby * yy + ty;
                // Now find the center of the transformed text:
                var cbx = midval("left", "right", boundsDesc, function (a, b) { return a + b; });
                var cby = midval("top", "bottom", boundsDesc, function (a, b) { return a + b; });
                // Offset the transformed bottom left corner vector by
                // the center of the transformed text bounds in Photoshop:
                tbx += cbx;
                tby += cby;
                // These values become the translate values in the SVG matrix:
                this.addAttribute(' transform="matrix( $xx$, $xy$, $yx$, $yy$,', textXform);
                this.addText(tbx + ", " + tby + ')"');
                transformMatrixUsed = true;
            }
        }
        
        if (! transformMatrixUsed)
        {
            textBottom = stripUnits(boundsDesc.getVal("top"));
            var baselineDelta = stripUnits(this.getLayerAttr("textKey.boundingBox.top"));
            textBottom += -baselineDelta;
            leftMargin = boundsDesc.getVal('left'); // For multi-line text
        }

        // This table is: [PS Style event key ; PS event value keyword to search for ; corresponding SVG]
        var styleTable = [["fontStyleName",     "Bold",             ' font-weight="bold"'],
                          ["fontStyleName",     "Italic",           ' font-style="italic"'],
                          ["strikethrough",     "StrikethroughOn",  ' text-decoration="line-through"'],
                          ["underline",         "underlineOn",      ' text-decoration="underline"'],
                          // Need RE, otherwise conflicts w/"smallCaps"
                          //["fontCaps",          /^allCaps/,         "text-transform: uppercase;"],
                          ["fontCaps",          "smallCaps",        ' font-variant="small-caps"'],
                          // These should probably also modify the font size?
                          ["baseline",          "superScript",      ' baseline-shift="super"']
                          //["baseline",          "subScript",        ' baseline-shift="sub"']
                         ];

        var i;
        for (i in styleTable) {
            if (isStyleOn(textDesc, styleTable[i][0], styleTable[i][1])) {
                this.addText(styleTable[i][2]);
            }
        }
                
        var fontSize = stripUnits(this.getVal2("size", textDescList));
        var fontLeading = textDesc.getVal("leading");
        fontLeading = fontLeading ? stripUnits(fontLeading) : fontSize;

        if (isStyleOn(textDesc, "baseline", "subScript"))
        {
            fontSize = fontSize / 2;
            textBottom += fontLeading;
        }

        this.addParam('font-size', fontSize + 'px');
        if (! transformMatrixUsed)
        {
            this.addParam('x', leftMargin);
            this.addParam('y', textBottom + 'px');
        }
        this.addText('>');

        var textStr = this.getLayerAttr('textKey').getVal('textKey');

        // SVG doesn't have native support for all caps
        if (isStyleOn(textDesc, "fontCaps", /^allCaps/)) {
            textStr = textStr.toUpperCase();
        }
            
        // Weed out < > & % @ ! # etc.
        textStr = this.HTMLEncode(textStr);

        // If text is on multiple lines, break it into separate spans.
        if (textStr.search(/\r/) >= 0)
        {
            // Synthesize the line-height from the "leading" (line spacing) / font-size
            var lineHeight = "1.2em";
            if (fontSize && fontLeading)
            {
                // Strip off the units; this keeps it as a relative measure.
                lineHeight = round1k(fontLeading / fontSize);
            }
        
            var topOffset = "";
            if (! transformMatrixUsed) {
//              topOffset = ' dy="-' + (textStr.match(/\r/g).length * lineHeight) + 'em"';
                topOffset = ' dy="-' + stripUnits(this.getLayerAttr("textKey.boundingBox.bottom")) + 'px"';
            }

            var textSpans = ' <tspan' + topOffset + '>';

            textSpans += textStr.replace(/\r/g, '</tspan><tspan x="' + leftMargin + '" dy="' + lineHeight + 'em">');
            textSpans += '</tspan>\n';
            // Blank lines must have at least a space or else dy is ignored.
            textSpans = textSpans.replace(/><\/tspan>/g, "> </tspan>");
            this.addText(textSpans);
        }
        else {
            this.addText(textStr);
        }
        this.addText('</text>\n');

        this.popFXGroups();
    }
};

// Generate a file reference if the layer ends in an image-file suffix (return true)
// Otherwise, return false.
svg.getImageLayerFileRefSVG = function ()
{
    var validSuffix = {'.tiff': 1, '.png': 1, '.jpg': 1, '.gif': 1};
    
    // Apply generator's naming rules to the image names.  
    // If there's a list, just grab the first.
    var name = this.getLayerAttr("name").split(",")[0];
    
    var suffix = (name.lastIndexOf('.') >= 0)
                    ? name.slice(name.lastIndexOf('.')).toLowerCase() : null;
    suffix = (validSuffix[suffix]) ? suffix : null;
    if (! suffix) {
        return false;
    }

    this.addParam('xlink:href', name);
    return true;
};

// Write layer pixels as in-line PNG, base64 encoded.
svg.getImageLayerSVGdata = function ()
{
    var pngPath = new File(Folder.temp + "/png4svg" + this.currentLayer.layerID).fsName;
    this.writeLayerPNGfile(pngPath);
    var pngFile = new File(pngPath + ".base64");
    pngFile.open('r');
    pngFile.encoding = "UTF-8";

    var pngData64 = pngFile.read();
    pngFile.close();
    pngFile.remove();
    this.addParam('xlink:href', "data:img/png;base64," + pngData64);
};

svg.getImageLayerSVG = function ()
{
    var boundsDesc = this.currentLayer.getLayerAttr("bounds");
    
    this.addText("<image ");

    this.addOpacity(true);
    var i, boundList = [' x="$left$"', ' y="$top$"', ' width="$width$"', ' height="$height$" '];
    for (i in boundList) {
        this.addAttribute(boundList[i], boundsDesc);
    }
    // If the image doesn't have a file suffix, then generate the output as in-line data.
    if (! this.getImageLayerFileRefSVG()) {
        this.getImageLayerSVGdata();
    }
    this.addText(" />\n");
};

// This walks the group and outputs all visible items in that group.  If the current
// layer is not a group, then it walks to the end of the document (i.e., for dumping
// the whole document).
svg.walkLayerGroup = function (processAllLayers)
{
    function isSVGLayerKind(kind)
    {
        return (cssToClip.isCSSLayerKind(kind) || (kind === kAdjustmentSheet));
    }

    processAllLayers = (typeof processAllLayers === "undefined") ? false : processAllLayers;
    // If processing all of the layers, don't stop at the end of the first group
    var layerLevel = processAllLayers ? 2 : 1;
    var visibleLevel = layerLevel;
    var curIndex = this.currentLayer.index;
    var saveGroup = [];
    if (this.currentLayer.layerKind === kLayerGroupSheet)
    {
        if (! this.currentLayer.visible) {
            return;
        }
        curIndex--; // Step to next layer in group so layerLevel is correct
    }

    var groupLayers = [];
    while ((curIndex > 0) && (layerLevel > 0))
    {
        var nextLayer = new PSLayerInfo(curIndex, false);
        if (isSVGLayerKind(nextLayer.layerKind))
        {
            if (nextLayer.layerKind === kLayerGroupSheet)
            {
                if (nextLayer.visible && (visibleLevel === layerLevel)) {
                    visibleLevel++;
                    // The layers and section bounds must be swapped
                    // in order to process the group's layerFX 
                    saveGroup.push(nextLayer);
                    groupLayers.push(kHiddenSectionBounder);
                }
                layerLevel++;
            }
            else
            {
                if (nextLayer.visible && (visibleLevel === layerLevel)) {
                    groupLayers.push(nextLayer);
                }
            }
        }
        else
        if (nextLayer.layerKind === kHiddenSectionBounder)
        {
            layerLevel--;
            if (layerLevel < visibleLevel) {
                visibleLevel = layerLevel;
                if (saveGroup.length > 0) {
                    groupLayers.push(saveGroup.pop());
                }
            }
        }
        curIndex--;
    }
    return groupLayers;
};

svg.getGroupLayerSVG = function (processAllLayers)
{
    var i, groupLayers = this.walkLayerGroup(processAllLayers);

    // Each layerFX (e.g., an inner shadow & outer shadow) needs it's own SVG
    // group.  So a group's set of layerFX must be counted separately from any
    // layerFX that may be present within the group.  The fxGroupCount stack
    // manages the count of individual layerFX for each group.
    this.addLayerFX();
    this.fxGroupCount.unshift(0);

    for (i = groupLayers.length - 1; i >= 0; --i) {
        if (groupLayers[i] === kHiddenSectionBounder)
        {
            this.fxGroupCount.shift();
            this.popFXGroups();
        }
        else
        {
            if (groupLayers[i].layerKind === kLayerGroupSheet)
            {
                this.setCurrentLayer(groupLayers[i]);
                this.addLayerFX();
                this.fxGroupCount.unshift(0);
            }
            else {
                this.processLayer(groupLayers[i]);
            }
        }
    }

    this.fxGroupCount.shift();
    this.popFXGroups();
};

svg.processLayer = function (layer)
{
    this.setCurrentLayer(layer);

    /* jshint -W015 */   // Want this to look like a table, please
    switch (this.currentLayer.layerKind)
    {
    case kVectorSheet:      this.getShapeLayerSVG();    return true;
    case kTextSheet:        this.getTextLayerSVG();     return true;
    case kSmartObjectSheet:
    case kPixelSheet:       this.getImageLayerSVG();    return true;
    case kAdjustmentSheet:  this.getAdjustmentLayerSVG(); return true;
    case kLayerGroupSheet:  this.getGroupLayerSVG();    return true;
    }
    /* jshint +W015 */
    return false;
};

// Save & restore the units (also stash benchmark timing here)
svg.pushUnits = function ()
{
    this.saveUnits = app.preferences.rulerUnits;
    app.preferences.rulerUnits = Units.PIXELS;  // Web dudes want pixels.
    this.startTime = new Date();
    var mode = this.documentColorMode();
    this.savedColorMode = null;
    // Support labColor & CMYK as well
    if ((mode !== "RGBColor") && (mode in {"labColor": 1, "CMYKColor": 1})) {
        this.savedColorMode = mode;
        this.changeColorMode("RGBColor");
    }
};

svg.popUnits = function ()
{
    if (this.saveUnits) {
        app.preferences.rulerUnits = this.saveUnits;
    }
    if (this.savedColorMode) {
        this.changeColorMode(this.savedColorMode);
    }

    var elapsedTime = new Date() - this.startTime;
    return ("time: " + (elapsedTime / 1000.0) + " sec");
};

// Find the actual bounds of all the items, including strokes
svg.findActualBounds = function ()
{
    
    var i, layers = [];
    if (this.currentLayer.layerKind === kLayerGroupSheet) {
        layers = this.walkLayerGroup();
    }
    else {
        layers.push(this.currentLayer);
    }

    var bounds = null;
    // Ugh - can't use symbolic constants for layerKind because they
    // wind up as symbols, not the # they evaluate too.  See CopyCSSToClipboard.jsx
    // for the definitions.
    var contentLayerKinds = { 1: 1, 2: 1, 3: 1, 4: 1, 5: 1 };
    
    for (i = 0; i < layers.length; ++i)
    {
        if ((typeof layers[i] !== "number")
            && (layers[i].layerKind in contentLayerKinds)) {
            var layerBounds = layers[i].getBounds();
            // Extend bounds by stroke
            if (layers[i].layerKind === kVectorSheet)
            {
                // Check for AGM stroke
                var strokeWidth = 0;
                var agmDesc = layers[i].getLayerAttr("AGMStrokeStyleInfo");
                if (agmDesc && agmDesc.getVal("strokeEnabled")) {
                    strokeWidth = stripUnits(agmDesc.getVal("strokeStyleLineWidth"));
                }
                // Try the layerFX stroke
                if (strokeWidth === 0) {
                    var fxDesc = layers[i].getLayerAttr("layerEffects.frameFX");
                    if (fxDesc && fxDesc.getVal("enabled")
                        && (fxDesc.getVal("paintType") === "solidColor")) {
                        strokeWidth = stripUnits(fxDesc.getVal("strokeStyleLineWidth"));
                    }
                }
                strokeWidth *= 0.5;
                layerBounds[0] -= strokeWidth;
                layerBounds[1] -= strokeWidth;
                layerBounds[2] += strokeWidth;
                layerBounds[3] += strokeWidth;
            }
        
            if (bounds === null) {
                bounds = layerBounds;
            }
            else {
                for (var j = 0; j < 4; ++j) {
                    bounds[j] = [Math.min, Math.min, Math.max, Math.max][j](bounds[j], layerBounds[j]);
                }
            }
        }
    }
    return bounds;
};

// This assumes "params" are pre-defined globals
svg.createSVGText = function ()
{
    svg.reset();
    svg.pushUnits();
    // Fixing the SVG bounds requires being able to stop Generator's tracking,
    // which is only available in PS v15 (CC 2014) and up.
    var fixBoundsAvailable = Number(app.version.match(/\d+/)) >= 15;
    
    var savedLayer, curLayer = PSLayerInfo.layerIDToIndex(params.layerId);
    this.setCurrentLayer(curLayer);

    var bounds, wasClean = app.activeDocument.saved;
 
    if (fixBoundsAvailable) {
        this.enableGeneratorTrack(false);

        savedLayer = app.activeDocument.activeLayer;
        this.currentLayer.makeLayerActive();
        bounds = this.findActualBounds();
        // We have to resort to the DOM here, because
        // only the active (target) layer can be translated
        app.activeDocument.activeLayer.translate(-bounds[0], -bounds[1]);
    }
    
    svg.processLayer(curLayer);
    svg.popUnits();
    var svgResult = this.svgHeader;

    if (fixBoundsAvailable) {
        // PS ignores the stroke when finding the bounds (bug?), so we add in
        // a fudge factor based on the largest stroke width found.
        var halfStrokeWidth = new UnitValue(this.maxStrokeWidth / 2, 'px');
        var boundsParams = {width: ((bounds[2] - bounds[0]) + halfStrokeWidth).asCSS(),
                            height: ((bounds[3] - bounds[1]) + halfStrokeWidth).asCSS()};

        var boundsStr = this.replaceKeywords(' width="$width$" height="$height$">', boundsParams);
        svgResult = svgResult.replace(">", boundsStr);

        this.killLastHistoryState();    // Pretend translate never happened
        app.activeDocument.activeLayer = savedLayer;
        if (wasClean) {                 // If saveState was clean, pretend we never touched it
            executeAction(app.stringIDToTypeID("resetDocumentChanged"),
                                  new ActionDescriptor(), DialogModes.NO);
        }
        this.enableGeneratorTrack(true);
    }
       
    if (svg.svgDefs.length > 0) {
        svgResult += "<defs>\n" + svg.svgDefs + "\n</defs>";
    }
    if (params.layerScale !== 1) {
        svgResult += '<g transform="scale(' + round1k(params.layerScale) + ')" >';
    }
    svgResult += svg.svgText;
    if (params.layerScale !== 1) {
        svgResult += '</g>';
    }
    svgResult += "</svg>";
    return svgResult;
};

svg.createSVGDesc = function ()
{
    var saveDocID = null;
    if (params.documentId && (params.documentId !== app.activeDocument.id)) {
        saveDocID = app.activeDocument.id;
        setDocumentByID(params.documentId);
    }
    var svgResult = this.createSVGText();
    var svgDesc = new ActionDescriptor();
    svgDesc.putString(app.stringIDToTypeID("svgText"), encodeURI(svgResult));
    if (saveDocID) {
        setDocumentByID(saveDocID);
    }
    return svgDesc;
};

// Don't execute if runGetLayerSVGfromScript is set, this allows other scripts
// or test frameworks to load and run this file.
if ((typeof runGetLayerSVGfromScript === "undefined") || (! runGetLayerSVGfromScript)) {
    executeAction(app.stringIDToTypeID("sendJSONToNetworkClient"), svg.createSVGDesc(), DialogModes.NO);
}
