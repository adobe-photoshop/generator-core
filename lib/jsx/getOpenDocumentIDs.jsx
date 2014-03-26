/*global app */

// Required params: none

var i,
    ids = [];

for (i = 0; i < app.documents.length; i++) {
    ids.push(app.documents[i].id);
}

ids.join(":");
