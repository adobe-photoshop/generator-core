/*global stringIDToTypeID, ActionDescriptor, executeAction, DialogModes */

// Expected params: none

var desc = new ActionDescriptor();
desc.putBoolean(stringIDToTypeID("getTextStyles"), true);
desc.putBoolean(stringIDToTypeID("expandSmartObjects"), true);
desc.putString(stringIDToTypeID("version"), "0.2.0");

executeAction(
    stringIDToTypeID("sendDocumentInfoToNetworkClient"),
    desc,
    DialogModes.NO
);