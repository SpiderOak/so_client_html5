SO_DEBUGGING = false;            // for blather(), below.

function translate(text) {
    /* Stub translate function for eventual i8n. */
    return text
};


$(document).ready(function() {
    /* Prevent "event.layerX and event.layerY are broken and deprecated ..."
       WebKit warning message, per:
      http://stackoverflow.com/questions/7825448/webkit-issues-with-event-layerx-and-event-layery
      */
    $.event.props = $.event.props.join('|').replace('layerX|layerY|', '').split('|');
})

/* from http://forthescience.org/blog/2010/11/30/base32-encoding-in-javascript/
   Unrestrained via "WTFPL": http://sam.zoy.org/wtfpl/
*/
function b32encode_trim(s) {
    return b32encode(s).replace(/=+$/, '');
}
function b32encode(s) {
    /* encodes a string s to base32 and returns the encoded string */
    var alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    var parts = [];
    var quanta= Math.floor((s.length / 5));
    var leftover = s.length % 5;

    if (leftover != 0) {
        for (var i = 0; i < (5-leftover); i++) { s += '\x00'; }
        quanta += 1;
    }
    for (i = 0; i < quanta; i++) {
        parts.push(alphabet.charAt(s.charCodeAt(i*5) >> 3));
        parts.push(alphabet.charAt( ((s.charCodeAt(i*5) & 0x07) << 2)
                                    | (s.charCodeAt(i*5+1) >> 6)));
        parts.push(alphabet.charAt( ((s.charCodeAt(i*5+1) & 0x3F) >> 1) ));
        parts.push(alphabet.charAt( ((s.charCodeAt(i*5+1) & 0x01) << 4)
                                    | (s.charCodeAt(i*5+2) >> 4)));
        parts.push(alphabet.charAt( ((s.charCodeAt(i*5+2) & 0x0F) << 1)
                                    | (s.charCodeAt(i*5+3) >> 7)));
        parts.push(alphabet.charAt( ((s.charCodeAt(i*5+3) & 0x7F) >> 2)));
        parts.push(alphabet.charAt( ((s.charCodeAt(i*5+3) & 0x03) << 3)
                                    | (s.charCodeAt(i*5+4) >> 5)));
        parts.push(alphabet.charAt( ((s.charCodeAt(i*5+4) & 0x1F) )));
    }
    var replace = 0;
    if (leftover == 1) replace = 6;
    else if (leftover == 2) replace = 4;
    else if (leftover == 3) replace = 3;
    else if (leftover == 4) replace = 1;
    for (i = 0; i < replace; i++) parts.pop();
    for (i = 0; i < replace; i++) parts.push("=");
    return parts.join("");
}

function error_alert(purpose, status_code) {
    /* Post and alert and throw an error for 'purpose' with 'status_code'.
       'purpose' should name the problem, and 'status_code' can be one
       of a few SpiderOak web status codes, or text elaborating the problem. */
    var msg;
    if (typeof status_code === "string") {
        msg = status_code; }
    else if (status_code === 401) {
        msg = 'Unauthorized.'; }
    else if (status_code === 403) {
        msg = 'Incorrect username or password.'; }
    else if (status_code === 404) {
        msg = 'Incorrect ShareID or RoomKey.'; }
    else {
        msg = ('Temporary server failure. Please try again later.'); }
    msg = translate(purpose) + ": " + translate(msg);
    if (typeof status_code !== "string") {
        msg += " (" + status_code + ")"; }
    alert(msg);
    throw new Error(msg);
}

function fragment_quote(id) {
    /* Escape fragment selector chars to avoid jQuery mistaking for CSS
       selector *or other* non-fragment constructs. */
    // The '/' does need to be quoted, surprisingly.
    return id.replace(/(:|\.|\/)/g,'\\$1'); }

function blather(msg, do_alert) {
    if (SO_DEBUGGING) {
        if (do_alert) { alert(msg); }
        else { console.log(msg); }
    }
}

FILE_TYPE_BY_SUFFIX = {txt: "Text",
                       pdf: "Adobe PDF",
                       doc: "MS Word", docx: "MS Word (Open XML)",
                       xls: "MS Excel",
                       ppt: "MS Powerpoint",
                       png: "Image", jpg: "Image", jpeg: "Image", gif: "Image",
                       ico: "MS Icon",
                       svg: "Structured Vector Graphics",
                       ps: "PostScript", eps: "Extended PostScript",
                       avi: "Video", mpg: "Video", mpeg: "Video",
                       mov: "Video",
                       mp3: "MPEG Audio", ogg: "Ogg Vorbis Audio",
                       wav: "Waveform Audio",
                       exe: "Executable",
                       o: "Linkable Object Code",
                       c: "C Source Code",
                       sh: "Shell Script",
                       py: "Python Script",
                       pl: "Perl Script",
                       tcl: "TCL Script",
                       js: "Javascript",
                       bat: "MS Batch Script",
                       zip: "Compressed Archive (zip)",
                       gz: "Compressed (gzip)",
                       tgz: "Compressed Archive (gzip)",
                       jar: "Java Archive",
                       htm: "HyperText", html: "HyperText",
                       php: "PHP HyperText",
                       xml: "Extensible Markup Language",
                      }
function classify_file_by_name(name) {
    /* Return a string inferred from a file's name.
       Return an empty string if fail to infer anything.
     */
    var splat = name.split('.');
    var extension = splat[splat.length-1];
    var is_backup = false;
    var classification = FILE_TYPE_BY_SUFFIX[extension.toLowerCase()];
    if (! classification) {
        if (splat.length > 2 && (extension.match(/[0-9]/)
                                 || extension.match("~")
                                 || extension.match("#"))) {
            is_backup = true;
            var extension = splat[splat.length-2];
            classification = FILE_TYPE_BY_SUFFIX[extension];
        }}
    return classification || "";
}
function bytesToSize(bytes) {
    /* Return description of number of 'bytes' */
    /* Adapted from an entry found on:
       http://codeaid.net/javascript/convert-size-in-bytes-to-human-readable-format-(javascript) */
    if (! bytes) { return "empty"; }
    var sizes = [ 'n/a', 'bytes', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB'];
    var i = +Math.floor(Math.log(bytes) / Math.log(1024));
    return  ((bytes / Math.pow(1024, i)).toFixed(i ? 1 : 0)
             + ' ' + sizes[isNaN(bytes) ? 0 : i+1]);
}

function add_query_param(url, parameter, value) {
    /* Include on 'url' query 'parameter' with 'value'. */
    var parsed = $.mobile.path.parseUrl(url);
    return url + (parsed.search ? "&" : "?") + parameter + "=" + value;
}
function query_params(url) {
    /* Return an object with settings indicated by 'url' search parameters. */
    var search = $.mobile.path.parseUrl(url).search;
    var got = {};
    if (search) {
        search.slice(1,search.length).split('&').map(
            function (combo) {
                var pair = combo.split('='); got[pair[0]] = pair[1]; })};
    return got;
}
