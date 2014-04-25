/*global preferences, Units, app, params, Direction */

// Optional params:
//   - documentId - and id of document to get guides for

var originalUnits = preferences.rulerUnits;
preferences.rulerUnits = Units.PIXELS;

var guides = [];
if (params.documentId) {
    for (var i = 0; i < app.documents.length; i++) {
        if (app.documents[i].id === params.documentId) {
            guides = app.documents[i].guides;
        }
    }
} else {
    guides = app.activeDocument.guides;
}

preferences.rulerUnits = originalUnits;

var result = [];

var guide;
for (var i = 0; i < guides.length; ++i) {
    guide = guides[i];
    result.push("{" +
        "\"coordinate\":" + parseFloat(guide.coordinate, 10) + "," +
        "\"direction\":\"" + (guide.direction === Direction.HORIZONTAL ? "h" : "v") +
    "\"}");
}

/* jshint -W030 */

"[" + (result.join(",")) + "]";
