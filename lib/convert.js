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
            execpath = resolve(psPath, "convert");
        } else {
            execpath = resolve(psPath, "convert.exe");
        }
        
        return spawn(execpath, convertArgs);
    }

    function runPngquant(psPath, pngquantArgs) {
        var execpath = null;

        if (process.platform === "darwin") {
            execpath = resolve(psPath, "pngquant");
        } else {
            execpath = resolve(psPath, "pngquant.exe");
        }

        return spawn(execpath, pngquantArgs);
    }

    function getConvertArgumentsForSettings(settings) {
        var args    = [],
            format  = settings.format,
            quality = settings.quality ? String(settings.quality) : null;

        // Now perform color conversions
        if (format === "jpg" || (format === "png" && quality === "24")) {
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
        if (format === "png") {
            // Avoid embedding time stamps into the file.
            args.push("-define", "png:exclude-chunk=date");

            if (settings.usePngquant && quality === "8") {
                // Use ImageMagick to create 32-bit PNG with appropriate padding, etc.
                // and then pngquant will convert it to PNG8.
                quality = "32";
                settings.quality = 32;
                settings.pngquantQuality = 8;
            }

            if (quality === "8") {
                // The default Riemersma dithering is broken in ImageMagick 6.8.6-2
                // Use Floyd Steinberg instead - it looks better, too
                args.push("-dither", "FloydSteinberg");
                // Do not force type 3 as that seems to remove the alpha channel
                // Just reduce the number of colors, inspiring ImageMagick to use
                // a palette anyway (with RGBA colors)
                args.push("-colors", 256);
            } else if (quality === "24") {
                args.push("-define", "PNG:color-type=" + 2);
            } else if (quality === "32") {
                // This only forces RGBA colors when quality 32 is set explicitly.
                // Otherwise, ImageMagick gets to decide.
                args.push("-define", "PNG:color-type=" + 6);
            }
        }
        if (format === "jpg" || format === "webp") {
            quality = quality || DEFAULT_IMAGE_QUALITY;
            args.push("-quality", quality);
        }

        return args;
    }

    // Exported functions
    function savePixmap(psPath, pixmap, path, settings) {
        var fileCompleteDeferred = Q.defer(),
            fs  = require("fs");

        // Define the input
        var args = [
            // In order to know the pixel boundaries, ImageMagick needs to know the resolution and pixel depth
            "-size", pixmap.width + "x" + pixmap.height,
            "-depth", pixmap.bitsPerChannel,
            // pixmap.pixels contains the pixels in ARGB format, but ImageMagick only understands RGBA
            // The color-matrix parameter allows us to compensate for that
            "-color-matrix", "0 1 0 0, 0 0 1 0, 0 0 0 1, 1 0 0 0"
        ];

        if (!isNaN(settings.ppi)) {
            // Pass information about the image's pixel density
            args.push("-units", "PixelsPerInch", "-density", settings.ppi);
        } else {
            console.warn("Did not pass the document's resolution because it is not a valid number:", settings.ppi);
        }

        // Read the pixels in RGBA form from STDIN
        args.push("rgba:-");

        var padding = settings.padding;
        if (padding) {
            // Calculate the new image size
            var newWidth  = pixmap.width  + padding.left + padding.right,
                newHeight = pixmap.height + padding.top  + padding.bottom;

            // Use a transparent background color ("transparent" doesn't work because Colors.xml is missing)
            args.push("-background", "rgba(0,0,0,0)");
            // Set the canvas size and position the image inside of it
            args.push("-extent", newWidth + "x" + newHeight + "-" + padding.left + "-" + padding.top);
        }

        // Define conversions
        args = args.concat(getConvertArgumentsForSettings(settings));

        // Define the output
        var format = settings.format;
        // "png8" as the ImageMagick format produces GIF-like PNGs (binary transparency)
        if (format === "png" && settings.quality && settings.quality !== 8) {
            format = format + settings.quality;
        }

        // Write an image of format <format> to STDOUT
        args.push(format + ":-");

        // Setup a file stream to the output file
        var fileStream = fs.createWriteStream(path);
        fileStream.on("error", function (err) {
            fileCompleteDeferred.reject("Could not create write stream for file " + path + ": " + err);
        });

        // Launch convert
        var convertProc = runConvert(psPath, args);

        function onStreamError(err) {
            try {
                fileStream.close();
            } catch (e) {
                console.error("Error when closing file stream", e);
            }
            try {
                if (fs.existsSync(path)) {
                    fs.unlinkSync(path);
                }
            } catch (e) {
                console.error("Error when deleting file", path, e);
            }
            fileCompleteDeferred.reject(err);
        }
        
        // Handle errors
        convertProc.on("error", function (err) { onStreamError("Error with convert: " + err); });
        convertProc.stdin.on("error",  function (err) { onStreamError("Error with convert's STDIN: "  + err); });
        convertProc.stdout.on("error", function (err) { onStreamError("Error with convert's STDOUT: " + err); });
        convertProc.stderr.on("error", function (err) { onStreamError("Error with convert's STDERR: " + err); });
        fileStream.on("error",  function (err) { onStreamError("Error with stream to temporary file: " + err); });

        // Capture STDERR
        var stderr = "";
        convertProc.stderr.on("data", function (chunk) {
            stderr += chunk;
        });

        // pngquant changes the process from `convert < pixmap > fileStream`
        // to `convert < pixmap | pngquant > fileStream`
        if (settings.usePngquant && settings.format === "png" && settings.pngquantQuality === 8) {
            var pngquantProc = runPngquant(psPath, ["-"]);

            pngquantProc.on("error", function (err) { onStreamError("Error with pngquant: " + err); });
            pngquantProc.stdin.on("error",  function (err) { onStreamError("Error with pngquant's STDIN: "  + err); });
            pngquantProc.stdout.on("error", function (err) { onStreamError("Error with pngquant's STDOUT: " + err); });
            pngquantProc.stderr.on("error", function (err) { onStreamError("Error with pngquant's STDERR: " + err); });

            pngquantProc.stdout.pipe(fileStream);
            convertProc.stdout.pipe(pngquantProc.stdin);
        } else {
            // Pipe convert's output (the produced image) into the file stream
            convertProc.stdout.pipe(fileStream);
        }

        // Send the pixmap to convert
        convertProc.stdin.end(pixmap.pixels);

        // Wait until convert is done (pipe from the last utility will close the stream)
        fileStream.on("close", function () {
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
