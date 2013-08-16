/*global params, localize, alert */

// Required params:
//   - message - message to send to the user
// Optional params:
//   - replacements - array of strings that get substituted for "^0", "^1", etc.
//     in the message. Substitutions are done by index into the array.

var theMessage, i;

if (params.message) {
    if (params.message.indexOf("$$$") === 0) { // PS-localizable strings start with "$$$"
        theMessage = localize(params.message);
    } else {
        theMessage = params.message;
    }

    if (params.replacements) {
        for (i = 0; i < params.replacements.length; i++) {
            theMessage = theMessage.replace(new RegExp("\\^" + i, "g"), params.replacements[i]);
        }
    }

    alert(theMessage);
}
