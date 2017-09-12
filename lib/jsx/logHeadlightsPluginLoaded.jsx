/*global stringIDToTypeID, ActionDescriptor, executeAction, DialogModes, params */

// Required params:
//   - pluginName: string Plugin Name
//   - pluginVersion: string Plugin Version

var headlightsActionID = stringIDToTypeID("headlightsInfo");
var desc = new ActionDescriptor();
desc.putString(stringIDToTypeID("eventRecord"), "generator_loaded_plugins");
desc.putString(stringIDToTypeID("pluginName"), String(params.pluginName));
desc.putString(stringIDToTypeID("pluginVersion"), String(params.pluginVersion));
executeAction(headlightsActionID, desc, DialogModes.NO);
