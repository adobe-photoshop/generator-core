/*global params, stringIDToTypeID, ActionDescriptor, executeAction, DialogModes */

// Required params:
//   - documentId: The ID of the document requested

var MAX_DIMENSION = 10000;

var actionDescriptor = new ActionDescriptor();

actionDescriptor.putInteger(stringIDToTypeID("documentID"), params.documentId);
actionDescriptor.putInteger(stringIDToTypeID("width"), MAX_DIMENSION);
actionDescriptor.putInteger(stringIDToTypeID("height"), MAX_DIMENSION);
actionDescriptor.putInteger(stringIDToTypeID("format"), 2);

executeAction(stringIDToTypeID("sendDocumentThumbnailToNetworkClient"), actionDescriptor, DialogModes.NO);