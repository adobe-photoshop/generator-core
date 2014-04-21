/*global params, stringIDToTypeID, charIDToTypeID,
    ActionDescriptor, ActionList, executeAction, DialogModes */

// Required params:
//   - documentId: The ID of the document requested
//   - layerId:    The ID of the layer requested
//   - boundsOnly: Whether to only request the bounds fo the pixmap
//   Either use absolute scaling by specifying which part of the doc should be transformed into what shape:
//   - inputRect:  { left: ..., top: ..., right: ..., bottom: ... }
//   - outputRect: { left: ..., top: ..., right: ..., bottom: ... }
//   Or use relative scaling by specifying horizontal and vertical factors:
//   - scaleX:     The x-dimension scale factor (e.g. 0.5 for half size) for the output pixmap
//   - scaleY:     The y-dimension scale factor (e.g. 0.5 for half size) for the output pixmap
//
// Optional params:
//   - useSmartScaling: setting to "true" causes shapes to be scaled in the "smart" way, which (confusingly)
//         means that stroke effects (e.g. rounded rect corners) are *not* scaled. (Default: false)
//   - includeAncestorMasks: setting to "true" causes exported layer to be clipped by any ancestor
//         masks that are visible (Default: false)
//   - allowDither: controls whether any dithering could possibly happen in the color conversion
//         to 8-bit RGB. If false, then dithering will definitely not occur, regardless of either
//         the value of useColorSettingsDither and the color settings in Photoshop. (Default: false)
//   - useColorSettingsDither: If allowDither is true, then this controls whether to (if true) defer to
//         the user's color settings in PS, or (if false) to force dither in any case where a
//         conversion to 8-bit RGB would otherwise be lossy. If allowDither is false, then the
//         value of this parameter is ignored. (Default: false)

var MAX_DIMENSION = 10000;

var actionDescriptor = new ActionDescriptor(),
    transform;

// Add a transform if necessary
if (params.inputRect && params.outputRect) {
    transform = new ActionDescriptor();

    if (!params.useSmartScaling) {
        transform.putBoolean(stringIDToTypeID("forceDumbScaling"), true);
    }

    // The part of the document to use
    var inputRect   = params.inputRect,
        psInputRect = new ActionList();

    psInputRect.putUnitDouble(charIDToTypeID("#Pxl"), inputRect.left);
    psInputRect.putUnitDouble(charIDToTypeID("#Pxl"), inputRect.top);
    
    psInputRect.putUnitDouble(charIDToTypeID("#Pxl"), inputRect.right);
    psInputRect.putUnitDouble(charIDToTypeID("#Pxl"), inputRect.bottom);

    transform.putList(stringIDToTypeID("rectangle"), psInputRect);

    // Where to move the four corners
    var outputRect      = params.outputRect,
        psOutputCorners = new ActionList();

    psOutputCorners.putUnitDouble(charIDToTypeID("#Pxl"), outputRect.left);
    psOutputCorners.putUnitDouble(charIDToTypeID("#Pxl"), outputRect.top);
    
    psOutputCorners.putUnitDouble(charIDToTypeID("#Pxl"), outputRect.right);
    psOutputCorners.putUnitDouble(charIDToTypeID("#Pxl"), outputRect.top);
    
    psOutputCorners.putUnitDouble(charIDToTypeID("#Pxl"), outputRect.right);
    psOutputCorners.putUnitDouble(charIDToTypeID("#Pxl"), outputRect.bottom);
    
    psOutputCorners.putUnitDouble(charIDToTypeID("#Pxl"), outputRect.left);
    psOutputCorners.putUnitDouble(charIDToTypeID("#Pxl"), outputRect.bottom);

    transform.putList(stringIDToTypeID("quadrilateral"), psOutputCorners);

    // Absolute scaling may not keep the aspect ratio intact, in which case effects
    // cannot be scaled. To be consistent, turn it off for all of absolute scaling
    // transform.putBoolean(stringIDToTypeID("scaleStyles"), false);
}
else if (params.scaleX && params.scaleY && (params.scaleX !== 1 || params.scaleY !== 1)) {
    transform = new ActionDescriptor();

    if (!params.useSmartScaling) {
        transform.putBoolean(stringIDToTypeID("forceDumbScaling"), true);
    }

    transform.putDouble(stringIDToTypeID("width"), params.scaleX * 100);
    transform.putDouble(stringIDToTypeID("height"), params.scaleY * 100);
    transform.putEnumerated(stringIDToTypeID("interpolation"),
                            stringIDToTypeID("interpolationType"),
                            stringIDToTypeID("automaticInterpolation"));
}

if (transform) {
    actionDescriptor.putObject(stringIDToTypeID("transform"), stringIDToTypeID("transform"), transform);
}

actionDescriptor.putInteger(stringIDToTypeID("documentID"), params.documentId);
actionDescriptor.putInteger(stringIDToTypeID("width"), MAX_DIMENSION);
actionDescriptor.putInteger(stringIDToTypeID("height"), MAX_DIMENSION);
actionDescriptor.putInteger(stringIDToTypeID("format"), 2);
actionDescriptor.putInteger(stringIDToTypeID("layerID"), params.layerId);

if (!params.includeAncestorMasks) {
    actionDescriptor.putEnumerated(
        stringIDToTypeID("includeAncestors"),
        stringIDToTypeID("includeLayers"),
        stringIDToTypeID("includeNone")
    );
} else {
    actionDescriptor.putEnumerated(
        stringIDToTypeID("includeAncestors"),
        stringIDToTypeID("includeLayers"),
        stringIDToTypeID("includeVisible")
    );
}

actionDescriptor.putEnumerated(
    stringIDToTypeID("includeAdjustors"),
    stringIDToTypeID("includeLayers"),
    stringIDToTypeID("includeVisible")
);

// NOTE: on the PS side, allowDither and useColorSettingsDither default to "true" if they are
// not set at all. However, in Generator, the common case will be that we do NOT want to dither,
// regardless of the settings in PS. So, on the Generator side, we default to false (hence the !! on
// the params properties).
actionDescriptor.putBoolean(stringIDToTypeID("allowDither"), !!params.allowDither);
actionDescriptor.putBoolean(stringIDToTypeID("useColorSettingsDither"), !!params.useColorSettingsDither);

if (params.boundsOnly) {
    actionDescriptor.putBoolean(stringIDToTypeID("boundsOnly"), params.boundsOnly);
}
actionDescriptor.putBoolean(stringIDToTypeID("bounds"), params.bounds);

executeAction(stringIDToTypeID("sendLayerThumbnailToNetworkClient"), actionDescriptor, DialogModes.NO);
