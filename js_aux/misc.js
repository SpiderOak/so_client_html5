SO_DEBUGGING = false;            // for blather(), below.

function translate(text) {
    /* Stub translate function for eventual i8n. */
    return text
};

function submit_button_sentinel(inputs, $submit) {
    /* Enable element if all inputs in 'inputs' array have content, else
       disable. */
    function submit_button_sentinel_closure() {
        var passed = true;
        inputs.map(function ($input) {
            if ($input.val() === "") {
                passed = false;
                $submit.button('disable'); }}.bind(this));
        if (passed) {
            $submit.button('enable'); }
        return true; }
    return submit_button_sentinel_closure; }

$(document).ready(function() {
    /* Nothing so far. */
})

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
    $(document).trigger("error");
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

function add_query_param(url, parameter, value, dither) {
    /* Include on 'url' query 'parameter' with 'value'.
       Optional 'dither', if true, adds 'dither=<9-digit random integer>' to
       the query string, for a URL very likely to be distinct.
     */
    var parsed = $.mobile.path.parseUrl(url);
    var got = url + (parsed.search ? "&" : "?") + parameter + "=" + value;
    if (dither) { got += '&dither=' + Math.floor(Math.random() * 1e9); }
    return got;
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

function replace_button_text($slot, label_text) {
    /* Set a button contained in jquery '$slot' element to have 'label_text'.
       We look for .ui-btn-txt within the slot, else replace the slot's html.
     */
    var $into = $slot.find('.ui-btn-text');
    if (! $into.length) { $into = $slot; }
    $into.html(label_text); }

function elide(text, limit) {
    /* Return 'text', with any characters beyond 'limit' elided with "..."
       elipsis. */
    if (text.length <= limit) { return text; }
    else { return text.slice(0, limit) + "..."; }}

function toastish(message, duration, theme) {
    /* Show android-ish toast 'message', timed-out after 'duration' millesecs.
       Optional 'theme' specifies a theme swatch to use, default "b". */
    $.mobile.hidePageLoadingMsg();
    setTimeout(function () {
        $.mobile.showPageLoadingMsg(theme || "b", message, true); }, 0);
    setTimeout(function () { $.mobile.hidePageLoadingMsg(); }, duration); }

function deploy_focus_oneshot(selector, event) {
    /* Deploy a reliable 'selector' input-field focus function on 'event'.
       Use to avoid page-loading timing complications, eg using jQm pageshow.
       The function removes itself after firing. */
    var focus_oneshot = function(e, data) {
        $(selector).focus();
        $(document).unbind(event, focus_oneshot); }
    $(document).bind(event, focus_oneshot); }
