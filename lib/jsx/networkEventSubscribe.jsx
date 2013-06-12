/* global params, ActionDescriptor, stringIDToTypeID, executeAction, DialogModes */

// Expected params:
//   - events: Array of strings representing event names

var i, actionDescriptor;
actionDescriptor = new ActionDescriptor();
actionDescriptor.putString( stringIDToTypeID( "version" ), "1.0.0" ); 
for (i = 0; i < params.events.length; i++) {
    actionDescriptor.putClass(stringIDToTypeID("eventIDAttr"), stringIDToTypeID(params.events[i]));
    executeAction(stringIDToTypeID("networkEventSubscribe"), actionDescriptor, DialogModes.NO);
}
