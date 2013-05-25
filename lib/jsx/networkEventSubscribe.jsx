/* global params, ActionDescriptor, stringIDToTypeID, executeAction, DialogModes */

// Expected params:
//   - events: Array of strings representing event names

var i, actionDescriptor;
for (i = 0; i < params.events.length; i++) {
    actionDescriptor = new ActionDescriptor();
    actionDescriptor.putClass(stringIDToTypeID("eventIDAttr"), stringIDToTypeID(params.events[i]));
    executeAction(stringIDToTypeID("networkEventSubscribe"), actionDescriptor, DialogModes.NO);
}
