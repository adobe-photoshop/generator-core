/*global params, stringIDToTypeID, ActionDescriptor, executeAction, DialogModes */

// Required params:
//   - documentId: The ID of the document requested
//   - layerId: The ID of the layer requested
//   - scaleX: The x-dimension scale factor (e.g. 0.5 for half size) for the output pixmap
//   - scaleY: The y-dimension scale factor (e.g. 0.5 for half size) for the output pixmap

var MAX_DIMENSION = 10000;

var actionDescriptor = new ActionDescriptor();

var transform = new ActionDescriptor();
transform.putDouble(stringIDToTypeID("width"), params.scaleX * 100);
transform.putDouble(stringIDToTypeID("height"), params.scaleY * 100);
transform.putEnumerated(stringIDToTypeID("interpolation"),
                        stringIDToTypeID("interpolationType"),
                        stringIDToTypeID("automaticInterpolation"));

actionDescriptor.putInteger(stringIDToTypeID("documentID"), params.documentId);
actionDescriptor.putInteger(stringIDToTypeID("width"), MAX_DIMENSION);
actionDescriptor.putInteger(stringIDToTypeID("height"), MAX_DIMENSION);
actionDescriptor.putInteger(stringIDToTypeID("format"), 2);
actionDescriptor.putInteger(stringIDToTypeID("layerID"), params.layerId);
actionDescriptor.putObject(stringIDToTypeID("transform"), stringIDToTypeID("transform"), transform);

executeAction(stringIDToTypeID("sendLayerThumbnailToNetworkClient"), actionDescriptor, DialogModes.NO);
