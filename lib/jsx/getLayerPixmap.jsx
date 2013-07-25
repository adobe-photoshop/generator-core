/*global params, stringIDToTypeID, ActionDescriptor, executeAction, DialogModes */

// Expected params:
//   - layerID: The ID of the layer requested
//   - scale: The scale for the output pixmap

var MAX_DIMENSION = 10000;

var actionDescriptor = new ActionDescriptor();

var transform = new ActionDescriptor();
transform.putDouble(stringIDToTypeID("width"), params.scaleX * 100);
transform.putDouble(stringIDToTypeID("height"), params.scaleY * 100);
transform.putEnumerated(stringIDToTypeID("interpolation"),
                        stringIDToTypeID("interpolationType"),
                        stringIDToTypeID("automaticInterpolation"));

actionDescriptor.putInteger(stringIDToTypeID("width"), MAX_DIMENSION);
actionDescriptor.putInteger(stringIDToTypeID("height"), MAX_DIMENSION);
actionDescriptor.putInteger(stringIDToTypeID("format"), 2);
actionDescriptor.putInteger(stringIDToTypeID("layerID"), params.layerID);
actionDescriptor.putObject(stringIDToTypeID("transform"), stringIDToTypeID("transform"), transform);

executeAction(stringIDToTypeID("sendLayerThumbnailToNetworkClient"), actionDescriptor, DialogModes.NO);
