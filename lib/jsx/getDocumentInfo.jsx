/*global stringIDToTypeID, ActionDescriptor, executeAction, DialogModes, params */

var idNS = stringIDToTypeID("sendDocumentInfoToNetworkClient");
var k, desc = new ActionDescriptor();
desc.putString(stringIDToTypeID("version"), "1.0");

var flags = params.flags;

for (k in flags) {
    if (flags.hasOwnProperty(k)) {
        desc.putBoolean(stringIDToTypeID(k), flags[k]);
    }
}
executeAction(idNS, desc, DialogModes.NO);
