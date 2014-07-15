/*global ActionDescriptor, app, params */

// Required params:
//   - key: The id of the plugin for which to retrieve persistent settings
//   - settings: A JSON string representing persistent settings for the plugin
// Optional param:
//   - persistent: Boolean that indicates whether the settings should persist across launches

var desc = new ActionDescriptor();

var settingsKey = app.stringIDToTypeID("settings");
desc.putString(settingsKey, params.settings);

app.putCustomOptions(params.key, desc, params.persistent);
