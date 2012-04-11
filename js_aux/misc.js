/* Stub translate function for eventual i8n. */
function translate(text) {
    return text
};


$(document).ready(function() {
    /* Prevent "event.layerX and event.layerY are broken and deprecated ..."
       WebKit warning message, per:
      http://stackoverflow.com/questions/7825448/webkit-issues-with-event-layerx-and-event-layery
      */
    $.event.props = $.event.props.join('|').replace('layerX|layerY|', '').split('|');
})

/* Object instantiation convenience, from Douglas Crockford */
if (typeof Object.beget !== 'function') {
     Object.beget = function (o) {
        var F = function () {};
         F.prototype = o;
         return new F();
  };
}
