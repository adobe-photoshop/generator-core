/*
 * Copyright (c) 2017 Adobe Systems Incorporated. All rights reserved.
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

    var Q = require("q");

    var PromiseQueue = function () {};

    /**
     * Queue of requested
     *
     * @private
     * @type {Array<{deferred: Deferred, fn: function}>}
     */
    PromiseQueue.prototype._queue = [];

    /**
     * Promise of active operation, if any
     *
     * @private
     * @type {?Promise}
     */
    PromiseQueue.prototype._currentPromise = null;

    /**
     * Fetch the next Pixmap on the request queue
     *
     * @private
     * @return {[type]}
     */
    PromiseQueue.prototype._next = function () {
        if (this._currentPromise || this._queue.length === 0) {
            return;
        }

        var job = this._queue.shift(),
            jobPromise = job.fn();

        this._currentPromise = jobPromise;

        // TODO test that the function returned a promise!?

        jobPromise.finally(function () {
            this._currentPromise = null;
            setImmediate(this._next.bind(this));
        }.bind(this));

        job.deferred.resolve(jobPromise);
    };

    /**
     * Enqueue the function, returning a promise.
     * The function will be called after previous functions in the queue have resolved.
     * Eventually the returned promise will be resolved with the value from the supplied fn.
     *
     * @param {Function} fn that returns a promise
     * @return {Promise}
     */
    PromiseQueue.prototype.enqueue = function (fn) {
        var deferred = Q.defer();

        this._queue.push({ deferred: deferred, fn: fn });
        this._next();

        return deferred.promise;
    };

    module.exports = PromiseQueue;
}());
