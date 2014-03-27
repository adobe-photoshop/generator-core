/*global params, stringIDToTypeID, ActionDescriptor, executeAction, DialogModes */

// Required params:
//   - documentId: The ID of the document requested
//   - layerId:    The ID of the layer requested

var actionDescriptor = new ActionDescriptor();

actionDescriptor.putInteger(stringIDToTypeID("documentID"), params.documentId);
actionDescriptor.putInteger(stringIDToTypeID("layerID"), params.layerId);

executeAction(stringIDToTypeID("sendLayerShapeToNetworkClient"), actionDescriptor, DialogModes.NO);
