/*global stringIDToTypeID, ActionDescriptor, executeAction, DialogModes, params */

// Required params:
//   - event: string to log in headlights

var headlightsActionID = stringIDToTypeID("headlightsLog");
var desc = new ActionDescriptor();
desc.putString(stringIDToTypeID("subcategory"), "Generator");
desc.putString(stringIDToTypeID("eventRecord"), "Generator: " + String(params.event));
executeAction(headlightsActionID, desc, DialogModes.NO);
