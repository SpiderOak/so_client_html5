/* JQuery Mobile Infrastructure settings and customizations. */

/* ** Alternative settings format:
$(document).bind("mobileinit", function(){
    $.mobile.defaultPageTransition = "fade";
});
*/
$(document).bind("mobileinit", function(){
    $.extend(  $.mobile , {
        "defaultPageTransition": "fade",
    });
});
