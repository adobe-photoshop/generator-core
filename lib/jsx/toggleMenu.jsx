/*jslint sloppy: true, plusplus: true */
/*global params, stringIDToTypeID, ActionDescriptor, executeAction, DialogModes */

// Expected params:
//   - name: the string ID of the menu (e.g. "assets")
//   - enabled: boolean specifying whether the menu should be enabled
//   - checked: boolean specifying whether the menu should be checked

var nameID = stringIDToTypeID("name");
var enabledID = stringIDToTypeID("enabled");
var checkedID = stringIDToTypeID("checked");
var nodeMenuID = stringIDToTypeID("nodeMenu");
var desc = new ActionDescriptor();
desc.putString(nameID, params.name);
desc.putBoolean(enabledID, params.enabled);
desc.putBoolean(checkedID,  params.checked);
executeAction(nodeMenuID, desc, DialogModes.NO);