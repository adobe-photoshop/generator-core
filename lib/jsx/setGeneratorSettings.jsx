/*global charIDToTypeID, stringIDToTypeID, ActionReference, executeAction,
    ActionDescriptor, DialogModes, params */

var classProperty         = charIDToTypeID("Prpr");
var propNull              = charIDToTypeID("null");
var classNull             = charIDToTypeID("null");
var typeOrdinal           = charIDToTypeID("Ordn");
var enumTarget            = charIDToTypeID("Trgt");
var classDocument         = charIDToTypeID("Dcmn");
// var classLayer            = charIDToTypeID("Lyr ");
var propGeneratorSettings = stringIDToTypeID("generatorSettings");
var keyTo                 = charIDToTypeID("T   ");
var actionSet             = charIDToTypeID("setd");

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
theRef.putProperty(classProperty, propGeneratorSettings);
// Use classDocument for the document
theRef.putEnumerated(classDocument, typeOrdinal, enumTarget);

// Execute the set action setting the descriptor into the property reference
var setDescriptor = new ActionDescriptor();
setDescriptor.putReference(propNull, theRef);
setDescriptor.putObject(keyTo, classNull, generatorSettingsDesc);
executeAction(actionSet, setDescriptor, DialogModes.NO);