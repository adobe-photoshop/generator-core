/*global params, stringIDToTypeID, ActionDescriptor, executeAction, DialogModes, localize */

// Required params:
//   - name: the string ID of the menu (e.g. "assets")
//   - enabled: boolean specifying whether the menu should be enabled
//   - checked: boolean specifying whether the menu should be checked
// Optional params:
//   - displayName: localized string displayed in the PS menu
//       (replaces existing string if specified)

var nameID = stringIDToTypeID("name");
var enabledID = stringIDToTypeID("enabled");
var checkedID = stringIDToTypeID("checked");
var nodeMenuID = stringIDToTypeID("nodeMenu");

var desc = new ActionDescriptor();
desc.putString(nameID, params.name);
desc.putBoolean(enabledID, params.enabled);
desc.putBoolean(checkedID,  params.checked);
if (params.displayName) {
    var displayNameID = stringIDToTypeID("displayName");
    if (params.displayName.indexOf("$$$") === 0) { // PS-localizable strings start with "$$$"
        desc.putString(displayNameID, localize(params.displayName));
    } else {
        desc.putString(displayNameID, params.displayName);
    }
}

executeAction(nodeMenuID, desc, DialogModes.NO);
