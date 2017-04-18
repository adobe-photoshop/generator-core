/*global params, stringIDToTypeID, ActionDescriptor, executeAction, DialogModes */
var actionDescriptor = new ActionDescriptor(),
    width = 30000,
    height = 30000,
    params = {};


if (params.targetWidth || params.targetHeight) {
    if (params.targetWidth) {
    	width = params.targetWidth;
    }
    if (params.targetHeight) {
        height = params.targetHeight;
    }
}

actionDescriptor.putInteger(stringIDToTypeID("width"), width);
actionDescriptor.putInteger(stringIDToTypeID("height"), height);
actionDescriptor.putInteger(stringIDToTypeID("format"), 2);

executeAction(stringIDToTypeID("sendDocumentThumbnailToNetworkClient"), actionDescriptor, DialogModes.NO);
