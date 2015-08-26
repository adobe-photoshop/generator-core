/*global app, params */

// Required param:
//   - key: The id of the plugin for which to retrieve persistent settings

var desc = app.getCustomOptions(params.key);
var settingsKey = app.stringIDToTypeID("settings");

desc.getString(settingsKey);
