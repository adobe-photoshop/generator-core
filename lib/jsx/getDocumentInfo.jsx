/*global params, stringIDToTypeID, ActionDescriptor, executeAction, DialogModes */

// Expected params:
//   - layerID: The ID of the layer requested
//   - scale: The scale for the output pixmap
// params:
//   flags: {compInfo:bool, imageInfo:bool, layerInfo:bool, 
//           expandSmartObjects:bool, getTextStyles:bool, 
//           selectedLayers:bool, getCompSettings:bool}

// Shim creaking old ExtendScript
// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/keys
if (!Object.keys) {
  Object.keys = (function () {
    var hasOwnProperty = Object.prototype.hasOwnProperty,
        hasDontEnumBug = !({toString: null}).propertyIsEnumerable('toString'),
        dontEnums = [
          'toString',
          'toLocaleString',
          'valueOf',
          'hasOwnProperty',
          'isPrototypeOf',
          'propertyIsEnumerable',
          'constructor'
        ],
        dontEnumsLength = dontEnums.length;
 
    return function (obj) {
      if (typeof obj !== 'object' && typeof obj !== 'function' || obj === null) 
          throw new TypeError('Object.keys called on non-object');
 
      var result = [];
 
      for (var prop in obj) {
        if (hasOwnProperty.call(obj, prop)) result.push(prop);
      }
 
      if (hasDontEnumBug) {
        for (var i=0; i < dontEnumsLength; i++) {
          if (hasOwnProperty.call(obj, dontEnums[i])) result.push(dontEnums[i]);
        }
      }
      return result;
    }
  })()
};

var idNS = stringIDToTypeID( "sendDocumentInfoToNetworkClient" );
var i, desc = new ActionDescriptor();
desc.putString( stringIDToTypeID("version"), "1.0" );
//these default to true if none specified
var flagList = Object.keys( params.flags );
for (i in flagList)
  desc.putBoolean( stringIDToTypeID( flagList[i] ), params.flags[flagList[i]] );

executeAction( idNS, desc, DialogModes.NO );
