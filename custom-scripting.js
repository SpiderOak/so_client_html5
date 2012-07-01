/* JQuery Mobile Infrastructure settings and customizations. */

/* ** Alternative settings format:
$(document).bind("mobileinit", function(){
    $.mobile.defaultPageTransition = "fade";
});
*/
$(document).bind("mobileinit", function(){
    $.extend($.mobile, {
        "pushStateEnabled": false,
        "defaultPageTransition": "fade",
    });
});
$.ajaxSetup({
    beforeSend:function(){
        $.mobile.loading('show'); },
    // This would hide loading message much too soon on storage login, so we
    // do the hiding explicitly.
    //complete:function(){
    //    $.mobile.hidePageLoadingMsg(); },
});
