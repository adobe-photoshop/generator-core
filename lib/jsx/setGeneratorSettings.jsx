/*global charIDToTypeID, stringIDToTypeID, ActionReference, executeAction,
    ActionDescriptor, DialogModes, params */

// Required params:
//   - settings: An object specifying generatorSettings
// Optional params:
//   - key: The only entry of generatorSettings to set

var classProperty  = charIDToTypeID("Prpr");
var propNull       = charIDToTypeID("null");
var classNull      = charIDToTypeID("null");
var typeOrdinal    = charIDToTypeID("Ordn");
var enumTarget     = charIDToTypeID("Trgt");
var classDocument  = charIDToTypeID("Dcmn");
var classLayer     = charIDToTypeID("Lyr ");
var propProperty   = stringIDToTypeID("property");
var actionSet      = charIDToTypeID("setd");
var keyTo          = charIDToTypeID("T   ");

// These are the generator settings
var generatorSettingsDesc = new ActionDescriptor();

var settings = params.settings;
for (var key in settings) {
    if (settings.hasOwnProperty(key)) {
        generatorSettingsDesc.putString(stringIDToTypeID(key), settings[key]);
    }
}

// Set the generator meta data.
var theRef = new ActionReference();
// Property needs to come first
theRef.putProperty(classProperty, stringIDToTypeID("generatorSettings"));

if (params.layerId) {
    theRef.putIdentifier(classLayer, params.layerId);
} else {
    theRef.putEnumerated(classDocument, typeOrdinal, enumTarget);
}

// Execute the set action setting the descriptor into the property reference
var setDescriptor = new ActionDescriptor();
setDescriptor.putReference(propNull, theRef);

setDescriptor.putObject(keyTo, classNull, generatorSettingsDesc);
if (params.key) {
    setDescriptor.putString(propProperty, params.key);
}
executeAction(actionSet, setDescriptor, DialogModes.NO);
