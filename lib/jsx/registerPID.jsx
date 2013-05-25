/*global params, stringIDToTypeID, ActionDescriptor, executeAction, DialogModes */

// Expected params:
//   - pid: the PID of the node process

var IDStr = stringIDToTypeID("ID");
var knodeConnectionStr = stringIDToTypeID("nodeConnection");
var desc = new ActionDescriptor();
desc.putLargeInteger(IDStr, params.pid);
executeAction(knodeConnectionStr, desc, DialogModes.NO);
