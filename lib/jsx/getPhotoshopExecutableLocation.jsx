/*global charIDToTypeID, stringIDToTypeID, ActionReference, executeAction, ActionDescriptor, DialogModes, File */

var classProperty = charIDToTypeID("Prpr");
var classApplication = charIDToTypeID("capp");
var typeOrdinal = charIDToTypeID("Ordn");
var enumTarget = charIDToTypeID("Trgt");
var kexecutablePathStr = stringIDToTypeID("executablePath");
var typeNULL = charIDToTypeID("null");
var actionGet = charIDToTypeID("getd");

var desc1 = new ActionDescriptor();
var ref1 = new ActionReference();
ref1.putProperty(classProperty, kexecutablePathStr);
ref1.putEnumerated(classApplication, typeOrdinal, enumTarget);
desc1.putReference(typeNULL, ref1);
var result = executeAction(actionGet, desc1, DialogModes.NO);
String((new File(result.getPath(kexecutablePathStr))).fsName);
