/* Stub translate function for eventual i8n. */
function translate(text) {
    return text
};


/* Object instantiation convenience, from Douglas Crockford */
if (typeof Object.beget !== 'function') {
     Object.beget = function (o) {
        var F = function () {};
         F.prototype = o;
         return new F();
  };
}
