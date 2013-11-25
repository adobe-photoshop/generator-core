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

if (params.boundsOnly) {
    actionDescriptor.putBoolean(stringIDToTypeID("boundsOnly"), params.boundsOnly);
}
actionDescriptor.putBoolean(stringIDToTypeID("bounds"), params.bounds);

executeAction(stringIDToTypeID("sendLayerThumbnailToNetworkClient"), actionDescriptor, DialogModes.NO);
