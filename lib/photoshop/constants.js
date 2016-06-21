/*
 * Copyright (c) 2016 Adobe Systems Incorporated. All rights reserved.
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

    exports.CONSTANTS = {
        MESSAGE_HEADER_LENGTH     : 8,
        MESSAGE_LENGTH_OFFSET     : 0,
        MESSAGE_STATUS_OFFSET     : 4,
        MESSAGE_STATUS_LENGTH     : 4,
        PAYLOAD_HEADER_LENGTH     : 12,
        PAYLOAD_PROTOCOL_OFFSET   : 0,
        PAYLOAD_ID_OFFSET         : 4,
        PAYLOAD_TYPE_OFFSET       : 8,
        MAX_MESSAGE_ID            : 256 * 256 * 256,
        PROTOCOL_VERSION          : 1,
        MESSAGE_TYPE_ERROR        : 1,
        MESSAGE_TYPE_JAVASCRIPT   : 2,
        MESSAGE_TYPE_PIXMAP       : 3,
        MESSAGE_TYPE_ICC_PROFILE  : 4,
        STATUS_NO_COMM_ERROR      : 0
    };

    exports.corylog = console.log;
    
}());
