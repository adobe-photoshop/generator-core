/*global params, stringIDToTypeID, charIDToTypeID, ActionDescriptor, executeAction, DialogModes */

// Required param:
//      - clipboard: the string of text to be copied to the clipboard

var ktextToClipboardStr = stringIDToTypeID("textToClipboard");
var keyTextData = charIDToTypeID("TxtD");

var testStrDesc = new ActionDescriptor();
testStrDesc.putString(keyTextData, params.clipboard);
executeAction(ktextToClipboardStr, testStrDesc, DialogModes.NO);
