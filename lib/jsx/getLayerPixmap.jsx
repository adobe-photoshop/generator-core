/*global params, stringIDToTypeID, ActionDescriptor, executeAction, DialogModes */

// Required params:
//   - documentId: The ID of the document requested
//   - layerId:    The ID of the layer requested
//   - boundsOnly: Whether to only request the bounds fo the pixmap
//   - scaleX:     The x-dimension scale factor (e.g. 0.5 for half size) for the output pixmap
//   - scaleY:     The y-dimension scale factor (e.g. 0.5 for half size) for the output pixmap

var MAX_DIMENSION = 10000;

var actionDescriptor = new ActionDescriptor(),
    transform;

// Add a transform if necessary
if (params.scaleX && params.scaleY && (params.scaleX !== 1 || params.scaleY !== 1)) {
    transform = new ActionDescriptor();
    transform.putDouble(stringIDToTypeID("width"), params.scaleX * 100);
    transform.putDouble(stringIDToTypeID("height"), params.scaleY * 100);
    transform.putEnumerated(stringIDToTypeID("interpolation"),
                            stringIDToTypeID("interpolationType"),
                            stringIDToTypeID("automaticInterpolation"));
    actionDescriptor.putObject(stringIDToTypeID("transform"), stringIDToTypeID("transform"), transform);
}

actionDescriptor.putInteger(stringIDToTypeID("documentID"), params.documentId);
actionDescriptor.putInteger(stringIDToTypeID("width"), MAX_DIMENSION);
actionDescriptor.putInteger(stringIDToTypeID("height"), MAX_DIMENSION);
actionDescriptor.putInteger(stringIDToTypeID("format"), 2);
actionDescriptor.putInteger(stringIDToTypeID("layerID"), params.layerId);
actionDescriptor.putEnumerated(
    stringIDToTypeID("includeAncestors"),
    stringIDToTypeID("includeLayers"),
    stringIDToTypeID("includeNone")
);

if (params.boundsOnly) {
    actionDescriptor.putBoolean(stringIDToTypeID("boundsOnly"), params.boundsOnly);
}

executeAction(stringIDToTypeID("sendLayerThumbnailToNetworkClient"), actionDescriptor, DialogModes.NO);
