/*
 * Copyright (c) 2013 Adobe Systems Incorporated. All rights reserved.
 *  
 * Permission is hereby granted, free of charge, to any person obtaining a
 * copy of this software and associated documentation files (the "Software"), 
 * to deal in the Software without restriction, including without limitation 
 * the rights to use, copy, modify, merge, publish, distribute, sublicense, 
 * and/or sell copies of the Software, and to permit persons to whom the 
 * Software is furnished to do so, subject to the following conditions:
 *  
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *  
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, 
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER 
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING 
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER 
 * DEALINGS IN THE SOFTWARE.
 * 
 */

(function () {
    "use strict";

    // Built-in libraries
    var resolve = require("path").resolve,
        spawn = require("child_process").spawn;

    // NPM libraries
    var Q = require("q");

    // Constants
    var DEFAULT_IMAGE_QUALITY           = 90,
        BACKGROUND_COLOR_FOR_FLATTENING = "#fff";

    // Helper functions
    function runConvert(psPath, convertArgs) {
        var execpath = null;
        
        if (process.platform === "darwin") {
            execpath = resolve(psPath, "./Adobe Photoshop CC.app/Contents/MacOS/convert");
        } else {
            execpath = resolve(psPath, "convert");
        }
        
        return spawn(execpath, convertArgs);
    }

    function getConvertArgumentsForSettings(settings) {
        var args    = [],
            format  = settings.format,
            quality = settings.quality;

        // Now perform color conversions
        if (format === "jpg" || (format === "png" && String(quality) === "24")) {
            // Blend against a white background. Otherwise, semi-transparent pixels would just
            // lose their transparency, making the colors too intense
            args.push("-background", BACKGROUND_COLOR_FOR_FLATTENING, "-flatten");
        }
        if (format === "gif") {
            // Make it so that pixels that were <1% transparent before become fully transparent
            // while the other pixels have the same color as if seen against a white background
            // Create a copy of the original image, making it truly RGBA, and delete the ARGB original
            // Copy the image and flatten it, then apply the binary transparency of another copy
            // Afterwards, remove the RGBA image as well, leaving just one image
            args = args.concat(("( -clone 0 ) -delete 0 ( -clone 0 -background " + BACKGROUND_COLOR_FOR_FLATTENING +
                " -flatten -clone 0 -channel A -threshold 99% -compose dst-in -composite ) -delete 0").split(/ /));
        }
        if (format === "png" && String(quality) === "8") {
            // Just make sure to use a palette
            args.push("-colors", 256);
        }
        if (format === "jpg" || format === "webp") {
            quality = quality || DEFAULT_IMAGE_QUALITY;
            args.push("-quality", quality);
        }

        return args;
    }

    // Exported functions
    function savePixmap(psPath, pixmap, path, settings) {
        var fileCompleteDeferred = Q.defer();

        // Define the input
        var args = [
            // In order to know the pixel boundaries, ImageMagick needs to know the resolution and pixel depth
            "-size", pixmap.width + "x" + pixmap.height,
            "-depth", pixmap.bitsPerChannel,
            // pixmap.pixels contains the pixels in ARGB format, but ImageMagick only understands RGBA
            // The color-matrix parameter allows us to compensate for that
            "-color-matrix", "0 1 0 0, 0 0 1 0, 0 0 0 1, 1 0 0 0",
            // Pass information about the image's pixel density
            "-units", "PixelsPerInch", "-density", settings.ppi,
            // Read the pixels in RGBA form from STDIN
            "rgba:-"
        ];

        // Define conversions
        args = args.concat(getConvertArgumentsForSettings(settings));

        // Define the output
        var format = settings.format;
        // "png8" as the ImageMagick format produces GIF-like PNGs (binary transparency)
        if (format === "png" && settings.quality && settings.quality !== "8") {
            format = format + settings.quality;
        }

        // Write an image of format <format> to STDOUT
        args.push(format + ":-");

        console.log("Using format", format);

        // Setup a file stream to the output file
        var fileStream = require("fs").createWriteStream(path);
        fileStream.on("error", function (err) {
            fileCompleteDeferred.reject("Could not create write stream for file " + path + ": " + err);
        });

        // Launch convert
        var proc = runConvert(psPath, args);
        
        // Capture STDERR
        var stderr = "";
        proc.stderr.on("data", function (chunk) {
            stderr += chunk;
        });

        // Pipe convert's output (the produced image) into the file stream
        proc.stdout.pipe(fileStream);

        // Send the pixmap to convert
        proc.stdin.end(pixmap.pixels);

        // Wait until convert is done
        proc.stdout.on("close", function () {
            if (stderr) {
                fileCompleteDeferred.reject("ImageMagick error: " + stderr);
            } else {
                fileCompleteDeferred.resolve(path);
            }
        });
        
        return fileCompleteDeferred.promise;
    }

    exports.savePixmap = savePixmap;
}());
