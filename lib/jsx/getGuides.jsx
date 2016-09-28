/*global Units, app, params, Direction */

// Required params:
//   - documentId - and id of document to get guides for

var originalUnits = app.preferences.rulerUnits;
app.preferences.rulerUnits = Units.PIXELS;

var guides = [];
for (var i = 0; i < app.documents.length; i++) {
    if (app.documents[i].id === params.documentId) {
        guides = app.documents[i].guides;
        break;
    }
}

var horizontal = [];
var vertical = [];

var guide;
var coordinate;
for (var i = 0; i < guides.length; ++i) {
    guide = guides[i];
    coordinate = guide.coordinate;

    if (guide.direction === Direction.HORIZONTAL) {
        horizontal.push(coordinate);
    } else {
        vertical.push(coordinate);
    }
}

app.preferences.rulerUnits = originalUnits;

/* jshint -W030 */

horizontal.join(":") + ";" + vertical.join(":");
