/*global params, stringIDToTypeID, charIDToTypeID,
    ActionDescriptor, ActionList, executeAction, DialogModes */

var actionDescriptor = new ActionDescriptor(),
    width,
    height;

// Add a transform if necessary
if (params.outputRect) {
    
    width = outputRect.right - outputRect.left;
    height = outputRect.bottom - outputRect.top;

} 
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
