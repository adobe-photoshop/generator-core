/*global charIDToTypeID, stringIDToTypeID, ActionReference, executeAction,
    ActionDescriptor, DialogModes, params */

// Optional params:
//   - documentId: The ID of the document to get the settings for (otherwise the active document is used)
//   - key:        The only entry of generatorSettings to return (instead of returning all entries)

var classProperty  = charIDToTypeID("Prpr");
var propNull       = charIDToTypeID("null");

var typeOrdinal    = charIDToTypeID("Ordn");
var enumTarget     = charIDToTypeID("Trgt");
var classDocument  = charIDToTypeID("Dcmn");
var classLayer     = charIDToTypeID("Lyr ");
var propProperty   = stringIDToTypeID("property");
var actionGet      = charIDToTypeID("getd");
var actionSendJSON = stringIDToTypeID("sendJSONToNetworkClient");

var theRef = new ActionReference();
theRef.putProperty(classProperty, stringIDToTypeID("generatorSettings"));

if (params.layerId) {
    theRef.putIdentifier(classLayer, params.layerId);
} else if (params.documentId) {
    theRef.putIdentifier(classDocument, params.documentId);
} else {
    theRef.putEnumerated(classDocument, typeOrdinal, enumTarget);
}

var getDescriptor = new ActionDescriptor();
getDescriptor.putReference(propNull, theRef);
if (params.key) {
    getDescriptor.putString(propProperty, params.key);
}

var desc = executeAction(actionGet, getDescriptor, DialogModes.NO);
executeAction(actionSendJSON, desc, DialogModes.NO);
