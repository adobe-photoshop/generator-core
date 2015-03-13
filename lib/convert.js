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

    var spawn = require("child_process").spawn,
        Q = require("q");

    // Constants
    var DEFAULT_IMAGE_QUALITY           = 90,
        BACKGROUND_COLOR_FOR_FLATTENING = "#fff";

    function _getConvertArgumentsForSettings(settings, binaryPaths) {
        var args    = [],
            format  = settings.format,
            quality = settings.quality ? String(settings.quality) : null,
            lossless = settings.lossless,
            _scale = settings._scale ? parseFloat(settings._scale) : 1.0;

        // Note: The _scale setting should be considered private and may be removed at any time
        // with only a bump to the "patch" version number of generator-core. Use at your own risk.
        if (_scale && _scale !== 1.0) {
            args.push("-resize", Math.round(_scale * 100) + "%");
        }
        
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

            if (binaryPaths.pngquant && settings.usePngquant && quality === "8") {
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
        if (format === "webp") {
            if (lossless !== undefined) {
                args.push("-define", "webp:lossless=" + Boolean(lossless));
            }
        }

        return args;
    }

    function _getConvertArguments(binaryPaths, pixmap, settings) {
        var finalWidth = pixmap.width,
            finalHeight = pixmap.height;

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

        if (settings.extract && Number.isFinite(settings.extract.width) && settings.extract.width > 0 &&
                                Number.isFinite(settings.extract.height) && settings.extract.height > 0) {
            finalWidth = settings.extract.width;
            finalHeight = settings.extract.height;
            var x = Number.isFinite(settings.extract.x) ? settings.extract.x : 0,
                y = Number.isFinite(settings.extract.y) ? settings.extract.y : 0,
                xSign = x < 0 ? "" : "+",
                ySign = y < 0 ? "" : "+";
            //extract offsets explictly need a sign. Negagtive x/y will include a "-" sign in toString
            //and positive values will get an explicit "+" before them
            args.push("-extract", finalWidth + "x" + finalHeight + xSign + x + ySign + y);
        }

        // Read the pixels in RGBA form from STDIN
        args.push("rgba:-");

        var padding = settings.padding;
        if (padding) {
            // Calculate the new image size
            finalWidth  = finalWidth  + padding.left + padding.right;
            finalHeight = finalHeight + padding.top  + padding.bottom;

            // Apply background color or use transparent ("transparent" doesn't work because Colors.xml is missing)
            var background = settings.background || [0, 0, 0, 0];
            background = "rgba(" + background.join(",") + ")";
            args.push("-background", background);

            // Set the canvas size and position the image inside of it
            args.push("-extent", finalWidth + "x" + finalHeight + "-" + padding.left + "-" + padding.top);
        }

        // Define conversions
        args = args.concat(_getConvertArgumentsForSettings(settings, binaryPaths));

        // Define the output
        var format = settings.format;
        // "png8" as the ImageMagick format produces GIF-like PNGs (binary transparency)
        if (format === "png" && settings.quality && settings.quality !== 8) {
            format = format + settings.quality;
        }

        // Write an image of format <format> to STDOUT
        args.push(format + ":-");

        return args;
    }

    function _rejectDeferredOnProcessIOError(process, processName, deferred) {
        process.on("error", function (err) {
            deferred.reject("Error with " + processName + ": " + err);
        });
        process.stdin.on("error",  function (err) {
            deferred.reject("Error with " + processName + "'s STDIN: "  + err);
        });
        process.stdout.on("error", function (err) {
            deferred.reject("Error with " + processName + "'s STDOUT: " + err);
        });
        process.stderr.on("error", function (err) {
            deferred.reject("Error with " + processName + "'s STDERR: " + err);
        });
    }

    function _shouldUsePNGQuant(settings) {
        return settings.usePngquant && settings.format === "png" && settings.pngquantQuality === 8;
    }

    function _pipeThroughPNGQuant(binaryPaths, inputStream, outputStream, outputCompleteDeferred) {
        var pngquantProc = spawn(binaryPaths.pngquant, ["-"]);

        _rejectDeferredOnProcessIOError(pngquantProc, "pngquant", outputCompleteDeferred);

        pngquantProc.stdout.pipe(outputStream);
        inputStream.pipe(pngquantProc.stdin);
    }

    // Exported functions
    function streamPixmap(binaryPaths, pixmap, outputStream, settings) {
        var outputCompleteDeferred = Q.defer();

        var args = _getConvertArguments(binaryPaths, pixmap, settings);

        // Launch convert
        var convertProc = spawn(binaryPaths.convert, args);

        // Handle errors
        _rejectDeferredOnProcessIOError(convertProc, "convert", outputCompleteDeferred);

        // Capture STDERR
        var stderr = "";
        convertProc.stderr.on("data", function (chunk) {
            stderr += chunk;
        });

        // pngquant changes the process from `convert < pixmap > outputStream`
        // to `convert < pixmap | pngquant > outputStream`
        if (_shouldUsePNGQuant(settings)) {
            _pipeThroughPNGQuant(binaryPaths, convertProc.stdout, outputStream, outputCompleteDeferred);
        } else {
            // Pipe convert's output (the produced image) into the output stream
            convertProc.stdout.pipe(outputStream);
        }

        // Send the pixmap to convert
        convertProc.stdin.end(pixmap.pixels);

        // Wait until convert is done (pipe from the last utility will close the stream)
        outputStream.on("close", function () {
            if (stderr) {
                outputCompleteDeferred.reject("ImageMagick error: " + stderr);
            } else {
                outputCompleteDeferred.resolve();
            }
        });
        
        return outputCompleteDeferred.promise;
    }

    function savePixmap(binaryPaths, pixmap, path, settings) {
        var fs = require("fs");

        // Open a stream to the output file.
        var fileStream = fs.createWriteStream(path);

        // Stream the pixmap into the file and resolve with path when successful.
        return streamPixmap(binaryPaths, pixmap, fileStream, settings)
            .thenResolve(path)
            .catch(function (err) {
                // If an error occurred, clean up the file.
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

                // Propagate the error.
                throw err;
            });
    }

    exports.streamPixmap = streamPixmap;
    exports.savePixmap = savePixmap;
}());
