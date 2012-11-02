/* JQuery Mobile Infrastructure settings and customizations. */

/* Copyright 2012 SpiderOak, Inc.

   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
*/

so_init_manager = function () {
    /* Gather reports that various components are ready, and launch the app
       when all are prepared. */
    var components = {app: false,
                      jQm: false,
                      PhoneGap: false,
                      DOM: false,
                     }
    var launch = function () {
        spideroak.init(); }
    return {ready: function (component) {
        /* Launch the app when the last 'component' is marked as ready. */
        components[component] = true;
        var remaining = Object.keys(components).filter(
            function (component) {
                return  components[component] ? false : component;} );
        if (remaining.length === 0) {
            // All of the components have reported in:
            launch(); }
    }}}()

function onDeviceReady() {
    /* Called by Cordova/PhoneGap when ready for our application. */
    "use strict";               // ECMAScript 5

    // Report that PhoneGap is ready (or not present):
    so_init_manager.ready('PhoneGap'); }

$(document).bind("mobileinit", function(){
    /* jQuery Mobile preliminary intializations. */
    "use strict";               // ECMAScript 5

    // $.support.cors and $.mobile.allowCrossDomainPages:
    // see http://jquerymobile.com/test/docs/pages/phonegap.html
    // We also populate the white list.
    $.support.cors = true;
    $.extend($.mobile, {
        pushStateEnabled: false,
        defaultPageTransition: "fade",
        allowCrossDomainPages: true,
    });

    so_init_manager.ready('jQm');
});

$.ajaxSetup({
    beforeSend:function(){
        $.mobile.loading('show'); }
    // We don't use the 'complete' function to hide the loading message,
    // because it winds up triggering much too soon.  Instead, we do the
    // hiding explicitly.
    //complete:function(){
    //    $.mobile.hidePageLoadingMsg(); }
});
