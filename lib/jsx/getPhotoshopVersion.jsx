/*global charIDToTypeID, stringIDToTypeID, ActionReference, executeAction, ActionDescriptor, DialogModes */

var classProperty = charIDToTypeID("Prpr");
var classApplication = charIDToTypeID("capp");
var typeOrdinal = charIDToTypeID("Ordn");
var enumTarget = charIDToTypeID("Trgt");
var khostVersionStr = stringIDToTypeID("hostVersion");
var typeNULL = charIDToTypeID("null");
var actionGet = charIDToTypeID("getd");

var desc = new ActionDescriptor();
var ref = new ActionReference();
ref.putProperty(classProperty, khostVersionStr);
ref.putEnumerated(classApplication, typeOrdinal, enumTarget);
desc.putReference(typeNULL, ref);
var result = executeAction(actionGet, desc, DialogModes.NO);

var versionObj = result.getObjectValue(khostVersionStr);
var major = versionObj.getInteger(stringIDToTypeID("versionMajor"));
var minor = versionObj.getInteger(stringIDToTypeID("versionMinor"));
var fix = versionObj.getInteger(stringIDToTypeID("versionFix"));
String(major + "." + minor + "." + fix);
