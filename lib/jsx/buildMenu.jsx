/*global params, stringIDToTypeID, ActionDescriptor, ActionList, executeAction, DialogModes */

// Expected params:
//   - items - array of objects that describe menu items. Each object should 
//     have the following properties:
//         name - string used to identify menu internally
//         displayName - localized string displayed in the PS menu
//         enabled - boolean specifying whether the menu item should be enabled initially
//         checked - boolean specifying whether the menu item should be checked initially

var nameID = stringIDToTypeID("name");
var displayNameStr = stringIDToTypeID("displayName");
var enabledID = stringIDToTypeID("enabled");
var checkedID = stringIDToTypeID("checked");
var nodeMenuInitializeID = stringIDToTypeID("nodeMenuInitialize");
var nodeMenuID = stringIDToTypeID("nodeMenu");

var list = new ActionList();
var menu, i;

for (i = 0; i < params.items.length; i++) {
    menu = new ActionDescriptor();
    menu.putString(nameID, params.items[i].name);
    menu.putString(displayNameStr, params.items[i].displayName);
    // Because of a bug, we always add the menu item in an enabled, unchecked state
    // then set the state later.
    menu.putBoolean(enabledID, true);
    menu.putBoolean(checkedID, true);
    list.putObject(nodeMenuID, menu);
}

var desc = new ActionDescriptor();
desc.putList(nodeMenuInitializeID, list);
executeAction(nodeMenuInitializeID, desc, DialogModes.NO);

// Now set the state of each menu item

for (i = 0; i < params.items.length; i++) {
    desc = new ActionDescriptor();
    desc.putString(nameID, params.items[i].name);
    desc.putBoolean(enabledID, params.items[i].enabled);
    desc.putBoolean(checkedID,  params.items[i].checked);
    executeAction(nodeMenuID, desc, DialogModes.NO);
}
