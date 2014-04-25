/*global preferences, Units, app, params, Direction */

// Required params:
//   - documentId - and id of document to get guides for

var originalUnits = preferences.rulerUnits;
preferences.rulerUnits = Units.PIXELS;

var guides = [];
for (var i = 0; i < app.documents.length; i++) {
    if (app.documents[i].id === params.documentId) {
        guides = app.documents[i].guides;
    }
}

preferences.rulerUnits = originalUnits;

var horizontal = [];
var vertical = [];

var guide;
var coordinate;
for (var i = 0; i < guides.length; ++i) {
    guide = guides[i];
    coordinate = parseFloat(guide.coordinate);

    if (guide.direction === Direction.HORIZONTAL) {
        horizontal.push(coordinate);
    } else {
        vertical.push(coordinate);
    }
}

/* jshint -W030 */

horizontal.join(":") + ";" + vertical.join(":");
