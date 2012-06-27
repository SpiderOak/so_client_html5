/* SpiderOak html5 client Main app.

 * Works with:
 * - jquery.mobile-1.0.1.css
 * - jquery-1.6.4.js
 * - jquery.mobile-1.0.1.js
 * - js_aux/misc.js - blather(), fragment_quote(), error_alert(), ...
 * - Nibbler 2010-04-07 - base32 encode, decode, and enhance with encode_trim.
 * - custom-scripting.js - jqm settings and contextual configuration
 */

/*
  NOTES

  - Content visits:
    We intercept navigation to content (eg, $.mobile.changePage) repository
    URLs and intervene via binding of handle_content_visit to jQuery mobile
    "pagebeforechange" event. URLs included as href links must start with
    '#' to trigger jQuery Mobile's navigation detection, which by default
    tracks changes to location.hash.  handle_content_visit() dispatches those
    URLs it receives that reside within the ones satisfy .is_content_root_url(),
    to which the root URLs are registered by the root visiting routines.

  - My routines which return jQuery objects end in '$', and - following common
    practice - my variables intended to contain jQuery objects start with '$'.
*/

// For misc.js:blather() and allowing dangerous stuff only during debugging.
SO_DEBUGGING = true;

var spideroak = function () {
    /* SpiderOak application object, as a modular singleton. */
    "use strict";               // ECMAScript 5


    /* Private elements: */

    /* ==== Object-wide settings ===== */

    var defaults = {
        /* Settings not specific to a particular login session: */
        // API v1.
        // XXX base_host_url may vary according to brand package.
        base_host_url: "https://spideroak.com",
        combo_root_url: "https://home",
        combo_root_page_id: "home",
        original_shares_root_page_id: "original-home",
        other_shares_root_page_id: "share-home",
        storage_login_path: "/browse/login",
        storage_logout_suffix: "logout",
        storage_path_prefix: "/storage/",
        original_shares_path_suffix: "shares",
        shares_path_suffix: "/share/",
        content_page_template_id: "content-page-template",
        devices_query_expression: 'device_info=yes',
        versions_query_expression: 'format=version_info',
        home_page_id: 'home',
        root_storage_node_label: "Devices",
        preview_sizes: [25, 48, 228, 800],
        dividers_threshold: 10,
        filter_threshold: 20,
    };
    var my = {
        /* Login session settings: */
        username: null,
        storage_web_url: null,  // Location of storage web UI for user.
        storage_root_url: null,
        original_shares_root_url: null,
        // All the service's actual shares reside within:
        shares_root_url: defaults.base_host_url + "/share/",
        share_room_urls: {},
        original_share_room_urls: {},
    };

    var base32 = new Nibbler({dataBits: 8,
                              codeBits: 5,
                              keyString: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567',
                              pad: '='});
    Nibbler.prototype.encode_trim = function (str) {
        /* Base32 encoding with trailing "=" removed. */
        return this.encode(str).replace(/=+$/, ''); }

    /* Navigation handlers: */


    function handle_content_visit(e, data) {
        /* Intercept URL visits and intervene for repository content. */
        var page = internalize_url(data.toPage);

        if ((typeof page === "string")
            && (is_content_url(page)
                || document_addrs.hasOwnProperty(page))) {
            e.preventDefault();
            var mode_opts = query_params(page);
            if (document_addrs.hasOwnProperty(page)) {
                var current_internal = internalize_url(document.location.href);
                return document_addrs[page].call(this, current_internal); }
            else {
                content_node_manager.get(page).visit(data.options,
                                                     mode_opts); }}}


    function establish_traversal_handler() {
        /* Establish page change event handler. */
        $(document).bind("pagebeforechange.SpiderOak", handle_content_visit); }


    /*  ===== Content Root Registration =====  */

    function set_storage_account(username, storage_host, storage_web_url) {
        /* Register confirmed user-specific storage details.  Return the
           storage root URL.
           'username' - the account name
           'storage_host' - the server for the account
           'storage_web_url' - the account's web UI entry address
        */

        var storage_url = register_storage_root(storage_host, username,
                                                storage_web_url);
        if (! is_content_root_url(storage_url)) {
            register_content_root_url(storage_url); }

        if (remember_manager.active()) {
            remember_manager.store({username: username,
                                    storage_host: storage_host,
                                    storage_web_url: storage_web_url}); }

        // Now let's direct the caller to the combo root:
        return my.combo_root_url; }
    function clear_storage_account() {
        /* Obliterate internal settings and all content nodes for a clean slate.
           All share artifacts, original and other, are removed, as well
           as registered storage.  We do not remove persistent settings. */

        Object.keys(my.original_share_room_urls).map(function (room_url) {
            if (! is_other_share_room_url(room_url)) {
                delete my.share_room_urls[room_url]; }})
        my.original_share_room_urls = {};

        if (my.original_shares_root_url) {
            content_node_manager.clear_hierarchy(my.original_shares_root_url); }
        my.original_shares_root_url = "";

        if (my.storage_root_url) {
            content_node_manager.clear_hierarchy(my.storage_root_url); }
        my.storage_root_url = "";

        content_node_manager.free(content_node_manager.get_combo_root());

        my.username = "";
        my.storage_host = "";
        my.storage_web_url = ""; }


    /* ===== Node-independent content URL categorization ===== */

    // Managed content is organized within two content roots:
    //
    // - the storage root, my.storage_root_url, determined by the user's account
    // - the public share root, which is the same across all accounts
    //
    // There is also a collection of the shares originated by the account,
    // in the OriginalRootShareNode.  Like all SpiderOak share rooms, the
    // items are actually public shares, but the collection listing is only
    // visible from within the account.
    //
    // Content urls are recognized by virtue of beginning with one of the
    // registered content roots. The storage root is registered when the user
    // logs in. The share rooms root is registered upon the registration of
    // any share room.

    function register_storage_root(host, username, storage_web_url) {
        /* Identify user's storage root according to 'host' and 'username'.
           The account's 'storage_web_url' is also conveyed.
           Return the url. */
        my.username = username;
        my.storage_host = host;
        my.storage_web_url = storage_web_url;

        my.storage_root_url = (host
                               + defaults.storage_path_prefix
                               + base32.encode_trim(username)
                               + "/");
        // Original root is determined by storage root:
        register_original_shares_root();

        return my.storage_root_url;
    }
    function register_original_shares_root() {
        /* Identify original share rooms root url. Depends on established
           storage root.  Return the url. */
        my.original_shares_root_url =
            (my.storage_root_url + defaults.original_shares_path_suffix); }
    function register_share_room_url(url) {
        /* Include url among the registered share rooms.  Returns the url. */
        my.share_room_urls[url] = true;
        return url; }
    function unregister_share_room_url(url) {
        /* Remove 'url' from the registered share rooms.  Persists the change
           if remembering mode is active.  Returns the url. */
        if (my.share_room_urls.hasOwnProperty(url)) {
            delete my.share_room_urls[url];
            return url; }}
    function register_original_share_room_url(url) {
        /* Include url among the registered original rooms.
           Also registers among the set of all familiar share room urls.
           Returns the url. */
        my.original_share_room_urls[url] = true;
        register_share_room_url(url);
        return url; }
    function is_combo_root_url(url) {
        return (url === my.combo_root_url); }
    function is_content_root_url(url) {
        /* True if the 'url' is for one of the root content items.
           Doesn't depend on the url having an established node. */
        return ((url === my.combo_root_url)
                || (url === my.storage_root_url)
                || (url === my.original_shares_root_url)
                || (url === my.shares_root_url)); }
    function is_content_root_page_id(url) {
        return ((url === defaults.combo_root_page_id)
                || (url === defaults.other_shares_root_page_id)
                || (url === defaults.original_shares_root_page_id)); }
    function is_share_room_url(url) {
        /* True if the 'url' is for one of the familiar share rooms.
           Doesn't depend on the url having an established node. */
        return my.share_room_urls.hasOwnProperty(url); }
    function is_original_share_room_url(url) {
        /* True if the 'url' is for one of the original share rooms.
           Doesn't depend on the url having an established node. */
        return (my.original_share_room_urls.hasOwnProperty(url)); }
    function is_other_share_room_url(url) {
        /* True if the 'url' is for one of the original share rooms.
           Doesn't depend on the url having an established node. */
        return is_share_room_url(url) && (! is_original_share_room_url(url)); }
    function is_storage_url(url) {
        /* True if the URL is for a content item in the user's storage area.
           Doesn't depend on the url having an established node. */
        return (my.storage_root_url
                && (url.slice(0, my.storage_root_url.length)
                    === my.storage_root_url)); }
    function is_share_url(url) {
        /* True if the URL is for a content item in the user's storage area.
           Doesn't depend on the url having an established node. */
        return (my.shares_root_url
                && (url.slice(0, my.shares_root_url.length)
                    === my.shares_root_url)); }
    function is_content_url(url) {
        /* True if url within registered content roots. */
        return (is_storage_url(url)
                || is_share_url(url)
                || is_combo_root_url(url)
                || is_content_root_url(url)
                || is_content_root_page_id(url)); }

    function other_share_room_urls() {
        /* Return an array of known share room urls that are not among the
           ones originated by the current account, *including* ones from
           peristence storage.  Doesn't depend on the urls being
           established as nodes. */
        var others = Object.keys(pmgr.get('other_share_urls') || {});
        others.map(function (candidate) {
            if (! my.share_room_urls.hasOwnProperty(candidate)) {
                register_share_room_url(candidate); }})
        var all = Object.keys(my.share_room_urls);
        return all.filter(is_other_share_room_url); }

    /* ===== Data model ===== */

    /* SpiderOak content includes storage (backups) and share rooms. The
       data model distinguishes different kinds of those things - the
       roots, devices, folders, and files - and wraps them in abstract
       general types - the ContentNode and variants of it, where useful. */

    function ContentNode(url, parent) {
        /* Constructor for items representing stored content.
           - 'url' is absolute URL for the collection's root (top) node.
           - 'parent' is containing node. The root's parent is null.
           See JSON data examples towards the bottom of this script.
        */
        if ( !(this instanceof ContentNode) ) {      // Coding failsafe.
            throw new Error("Constructor called as a function");
        }
        if (url) {             // Skip if we're in prototype assignment.
            this.url = url;
            this.root_url = parent ? parent.root_url : url;
            this.query_qualifier = "";
            this.parent_url = parent ? parent.url : null;
            this.is_container = true; // Typically.
            this.subdirs = [];  // Urls of contained devices, folders.
            this.files = [];    // Urls of contained files.
            this.$page = null;  // This node's jQuery-ified DOM data-role="page"
            this.lastfetched = false;
            this.emblem = "";   // At least for debugging/.toString()
            this.icon_path = ""; }}
    ContentNode.prototype.free = function () {
        /* Free composite content to make available for garbage collection. */
        if (this.$page) {
            this.$page.remove();
            this.$page = null; }}

    function StorageNode(url, parent) {
        ContentNode.call(this, url, parent);
        // All but the root storage nodes are contained within a device.
        // The DeviceStorageNode sets the device url, which will trickle
        // down to all its contents.
        this.device_url = parent ? parent.device_url : null; }
    StorageNode.prototype = new ContentNode();
    function ShareNode(url, parent) {
        /* Share room abstract prototype for collections, rooms, and contents */
        ContentNode.call(this, url, parent);
        this.root_url = parent ? parent.root_url : null;
        this.room_url = parent ? parent.room_url : null; }
    ShareNode.prototype = new ContentNode();

    function RootContentNode(url, parent) {
        /* Consolidated root of the storage and share content hierarchies. */
        ContentNode.call(this, url, parent);
        this.root_url = url;
        this.emblem = "Root";
        this.name = "Dashboard";
        delete this.subdirs;
        delete this.files; }
    RootContentNode.prototype = new ContentNode();
    RootContentNode.prototype.free = function () {
        /* Free composite content to make available for garbage collection. */
        if (this.$page) {
            // Do not .remove() the page - it's the original, not a clone.
            this.$page = null; }}
    RootContentNode.prototype.loggedin_ish = function () {
        /* True if we have enough info to be able to use session credentials. */
        return (my.username && true); }

    function RootStorageNode(url, parent) {
        StorageNode.call(this, url, parent);
        this.query_qualifier = "?" + defaults.devices_query_expression;
        this.emblem = "Root Storage";
        this.stats = null;
        delete this.files; }
    RootStorageNode.prototype = new StorageNode();
    function RootShareNode(url, parent) {
        ShareNode.call(this, url, this);
        this.emblem = "Root Share";
        this.root_url = url; }
    RootShareNode.prototype = new ShareNode();
    function OtherRootShareNode(url, parent) {
        RootShareNode.call(this, url, parent);
        this.name = "Other Share Rooms";
        this.emblem = "Other Share Rooms";
        this.job_id = 0;
        // Whitelist of methods eligible for invocation via mode_opts.action:
        this.action_methods = {'collection_menu': true,
                               'remove_item': true,
                               'persist_item': true,
                               'unpersist_item': true}

    }
    OriginalRootShareNode.prototype = new RootShareNode();
    function OriginalRootShareNode(url, parent) {
        RootShareNode.call(this, url, parent);
        this.name = "My Share Rooms";
        this.emblem = "Originally Published Share Rooms"; }
    OtherRootShareNode.prototype = new RootShareNode();

    function DeviceStorageNode(url, parent) {
        StorageNode.call(this, url, parent);
        this.emblem = "Storage Device";
        this.device_url = url; }
    DeviceStorageNode.prototype = new StorageNode();
    function RoomShareNode(url, parent) {
        ShareNode.call(this, url, parent);
        this.emblem = "Share Room";
        this.room_url = url; }
    RoomShareNode.prototype = new ShareNode();

    function FolderContentNode(url, parent) {
        /* Stub, for situating intermediary methods. */ }
    function FileContentNode(url, parent) {
        /* Stub, for situating intermediary methods. */ }

    function FolderStorageNode(url, parent) {
        this.emblem = "Storage Folder";
        StorageNode.call(this, url, parent); }
    FolderStorageNode.prototype = new StorageNode();
    function FolderShareNode(url, parent) {
        this.emblem = "Share Room Folder";
        ShareNode.call(this, url, parent); }
    FolderShareNode.prototype = new ShareNode();

    function FileStorageNode(url, parent) {
        this.emblem = "Storage File";
        StorageNode.call(this, url, parent);
        this.is_container = false;
        delete this.subdirs;
        delete this.files; }
    FileStorageNode.prototype = new StorageNode();
    function FileShareNode(url, parent) {
        this.emblem = "Share Room File";
        ShareNode.call(this, url, parent);
        this.is_container = false;
        delete this.subdirs;
        delete this.files; }
    FileShareNode.prototype = new ShareNode();

    /* ===== Content type and role predicates ===== */

    ContentNode.prototype.is_root = function () {
        /* True if the node is a collections top-level item. */
        return (this.url === this.root_url); }

    ContentNode.prototype.is_device = function() {
        return false; }
    DeviceStorageNode.prototype.is_device = function() {
        return true; }

    /* ===== Remote data access ===== */

    ContentNode.prototype.visit = function (chngpg_opts, mode_opts) {
        /* Fetch current data from server, provision, layout, and present.
           'chngpg_opts': framework changePage() options,
           'mode_opts': node provisioning and layout modal settings. */

        if (! this.up_to_date()) {
            this.fetch_and_dispatch(chngpg_opts, mode_opts); }
        else {
            this.show(chngpg_opts, mode_opts); }}

    RootContentNode.prototype.visit = function (chngpg_opts, mode_opts) {
        /* Do the special visit of the consolidated storage/share root. */

        // Trigger visits to the respective root content nodes in 'passive'
        // mode so they do not focus the browser on themselves. 'notify' mode
        // is also provoked, so they report their success or failure to our
        // notify_subvisit_status() method.
        //
        // See docs/AppOverview.txt "Content Node navigation modes" for
        // details about mode controls.

        this.remove_error_message();

        this.show(chngpg_opts, {});

        if (! this.loggedin_ish()) {
            // Not enough registered info to try authenticating:
            this.authenticated(false);
            this.layout(mode_opts);
            this.show(chngpg_opts, {}); }
        else {
            var storage_root = content_node_manager.get(my.storage_root_url);
            var our_mode_opts = {passive: true,
                                 notify_callback:
                                     this.notify_subvisit_status.bind(this),
                                 notify_token: 'storage'};
            $.extend(our_mode_opts, mode_opts);
            try {
                // Will chain via notify_callback:
                storage_root.visit(chngpg_opts, our_mode_opts); }
            catch (err) {
                // XXX These failsafes should be in error handlers:
                this.authenticated(false,
                                   {status: 0, statusText: "System error"},
                                   err);
                this.layout(); }
            // XXX Populate the familiar other share rooms.
            // XXX Provide other share edit and "+" add controls - somewhere.
            }}

    OtherRootShareNode.prototype.visit = function (chngpg_opts, mode_opts) {
        /* Obtain the known, non-original share rooms and present them. */
        // Our content is the set of remembered urls, from:
        // - those visited in this session
        // - those remembered across sessions

        if (mode_opts.hasOwnProperty('action')) {
            var action = mode_opts.action;
            if (this.action_methods.hasOwnProperty(action)) {
                return this[action](mode_opts); }}

        this.subdirs = other_share_room_urls();
        // .add_item() will also remove invalid ones from this.subdirs:
        this.subdirs.map(this.add_item.bind(this));
        this.do_presentation(chngpg_opts, mode_opts); }


    ContentNode.prototype.fetch_and_dispatch = function (chngpg_opts,
                                                         mode_opts) {
        /* Retrieve this node's data and deploy it.
           'chngpg_opts' - Options for the framework's changePage function
           'mode_opts': node provisioning and layout modal settings.

           - On success, call this.handle_visit_success() with the retrieved
             JSON data, new Date() just prior to the retrieval, chngpg_opts,
             mode_opts, a text status categorization, and the XMLHttpRequest
             object.
           - Otherwise, this.handle_visit_failure() is called with the
             XMLHttpResponse object, chngpg_opts, mode_opts, the text status
             categorization, and an exception object, present if an exception
             was caught.

           See the jQuery.ajax() documentation for XMLHttpResponse details.
        */

        var when = new Date();
        var url = this.url + this.query_qualifier;
        $.ajax({url: url,
                type: 'GET',
                dataType: 'json',
                cache: false,
                success: function (data, status, xhr) {
                    this.handle_visit_success(data, when,
                                              chngpg_opts, mode_opts,
                                              status, xhr); }.bind(this),
                error: function (xhr, statusText, thrown) {
                    this.handle_visit_failure(xhr, chngpg_opts, mode_opts,
                                              statusText,
                                              thrown)}.bind(this), })}

    RootContentNode.prototype.notify_subvisit_status = function(succeeded,
                                                                token,
                                                                response) {
        /* Callback passed to subordinate root content nodes to signal their
           update disposition:
           'succeeded': true for success, false for failure.
           'token': token they were passed to identify the transaction,
           'response': on failure: the resulting XHR object. */

        if (token !== 'other-shares') {
            this.authenticated(true); }

        var $page = this.my_page$();
        var selector = ((token === 'storage')
                        ? "#my-storage-leader"
                        : "#my-rooms-leader")
        var $leader = $(selector);

        if (! succeeded) {
            $.mobile.hidePageLoadingMsg();
            if (token === "storage") {
                this.authenticated(false, response);
                this.layout(); }}
        else {
            this.layout();

            if (token === 'storage') {
                // Ensure we're current page and chain to original shares root.

                this.layout();
                this.show();

                var our_mode_opts = {passive: true,
                                     notify_callback:
                                       this.notify_subvisit_status.bind(this),
                                     notify_token: 'original-share'};
                if (this.veiled) {
                    this.veil(false, $.mobile.hidePageLoadingMsg); }
                this.authenticated(true, response);
                var ps_root = cnmgr.get(my.original_shares_root_url, this);
                ps_root.visit({}, our_mode_opts); }}}

    OtherRootShareNode.prototype.notify_subvisit_status = function(succeeded,
                                                                   token,
                                                                   content) {
        /* Callback for subordinate share nodes to signal their visit result:
           'succeeded': true for success, false for failure.
           'token': token we passed in to identify transaction and convey info:
                    [job_id, subnode_URL],
           'content': on success: the jquery $(dom) for the populated content,
                      for failure: the resulting XHR object. */
        // We ignore the content.

        var $page = this.my_page$();
        var sub_job_id = token[0];
        var url = token[1];

        if (succeeded !== true) {
            var splat = url.split('/');
            var share_id = base32.decode(splat[splat.length-3]);
            var room_key = splat[splat.length-2];
            var message = ("Sorry - " + share_id + " / " + room_key + " was "
                           + content.statusText + " (" + content.status + ")");
            var remove = true;
            if (content.status === 404) {
                this.show_error_message(message); }
            else {
                message = [].concat(message, " - omit it?");
                remove = confirm(message); }
            if (remove) {
                this.remove_item(url);
                this.unpersist_item(url); }}
        else {
            this.remove_error_message(); }

        if (sub_job_id === this.job_id) {
            // Do update, whether or not it was successful:
            this.subdirs = other_share_room_urls()
            this.subdirs.sort(content_nodes_by_url_sorter)
            this.do_presentation({}, {passive: true}); }}

    ContentNode.prototype.handle_visit_success = function (data, when,
                                                           chngpg_opts,
                                                           mode_opts,
                                                           status, xhr) {
        /* Deploy successfully obtained node data.
           See ContentNode.fetch_and_dispatch() for parameter details. */
        this.provision(data, when, mode_opts);
        this.layout(mode_opts);
        this.show(chngpg_opts, mode_opts);
        if (mode_opts.notify_callback) {
            mode_opts.notify_callback(true,
                                      mode_opts.notify_token); }}

    ContentNode.prototype.handle_visit_failure = function (xhr,
                                                           chngpg_opts,
                                                           mode_opts,
                                                           exception) {
        /* Do failed visit error handling with 'xhr' XMLHttpResponse report. */
        if (mode_opts.notify_callback) {
            mode_opts.notify_callback(false, mode_opts.notify_token, xhr); }
        else {
            $.mobile.hidePageLoadingMsg();
            alert("Visit '" + this.name + "' failed: "
                  + xhr.statusText + " (" + xhr.status + ")");
            var combo_root = content_node_manager.get_combo_root();
            if (! is_combo_root_url(this.url)) {
                // Recover upwards, eventually to the top:
                $.mobile.changePage(this.parent_url
                                    ? this.parent_url
                                    : combo_root.url); }}}

    RootContentNode.prototype.handle_visit_failure = function (xhr,
                                                               chngpg_opts,
                                                               mode_opts,
                                                               exception) {
        /* Do failed visit error handling with 'xhr' XMLHttpResponse report. */
        this.layout();
        this.authenticated(false, xhr, exception); }

    RootContentNode.prototype.authenticated = function (succeeded, response,
                                                        exception) {
        /* Present login challenge versus content, depending on access success.
           'succeeded': true for success, false for failure.
           'response': on failure: the resulting XHR object, if any.
           'exception': on failure, exception caught by ajax machinery, if any.
         */
        var $page = this.my_page$();
        var $content_section = $page.find('.my-content');
        var $login_section = $page.find('.login-section');

        if (succeeded) {
            // Show the content instead of the form
            $login_section.hide();
            this.remove_error_message();
            $content_section.show();
            if (remember_manager.active()) {
                // remember_manager will store just the relevant fields.
                remember_manager.store(my);
                this.layout_header(); }}
        else {
            // Include the xhr.statusText in the form.
            this.veil(false);
            $content_section.hide();
            $login_section.show();
            var username;
            if (remember_manager.active()
                && (username = persistence_manager.get('username'))) {
                $('#my_login_username').val(username); }
            if (response) {
                var error_message = response.statusText;
                if (exception) {
                    error_message += " - " + exception.message; }
                this.show_error_message(error_message);
                if (response.status === 401) {
                    // Unauthorized - expunge all privileged info:
                    clear_storage_account(); }}
            // Hide the storage and original shares sections
            $content_section.hide();
            if (this.veiled) { this.veil(false); }}}

    OtherRootShareNode.prototype.collection_menu = function (target_url) {
        /* Present a menu of collection membership actions for 'target_url'. */
        // >>>
        }

    OtherRootShareNode.prototype.add_item_external = function (credentials) {
        /* Visit a specified share room, according to 'credentials' object:
           {username, password}.
           Use this routine only for adding from outside the object - use
           this.add_item(), instead, for internal operation.
        */

        this.job_id += 1;       // Entry

        return this.add_item(my.shares_root_url
                             + base32.encode_trim(credentials.shareid)
                             + "/" + credentials.password
                             + "/"); }

    OtherRootShareNode.prototype.add_item = function (url) {
        /* Visit a specified share room, according its' URL address.
           Return the room object. */
        register_share_room_url(url);
        var room = content_node_manager.get(url, cnmgr.get_combo_root());
        room.visit({},
                   {passive: true,
                    notify_callback: this.notify_subvisit_status.bind(this),
                    notify_token: [this.job_id, url]});
        return room; }

    OtherRootShareNode.prototype.remove_item_external = function (room_url) {
        /* Omit a non-original share room from persistent and resident memory.
           This is for use from outside of the object. Use .remove_item() for
           internal object operation. */
        this.job_id += 1;
        this.remove_item(url); }

    OtherRootShareNode.prototype.remove_item = function (room_url) {
        /* Omit a non-original share room from the persistent and resident
           collections. Returns true if the item was present, else false. */
        if (is_other_share_room_url(room_url)) {
            unregister_share_room_url(room_url);
            this.unpersist_item(room_url);
            return true; }
        else { return false; }}

    OtherRootShareNode.prototype.persist_item = function (room_url) {
        /* Add a share rooms to the collection persistent non-originals. */
        var persistents = pmgr.get("other_share_urls") || {};
        if (! persistents.hasOwnProperty(room_url)) {
            persistents[room_url] = true;
            pmgr.set("other_share_urls", persistents); }}

    OtherRootShareNode.prototype.unpersist_item = function (room_url) {
        /* Omit a non-original share room from the persistent
           collection.  Returns true if the item was present, else false. */
        var persistents = pmgr.get("other_share_urls") || {};
        if (persistents.hasOwnProperty(room_url)) {
            delete persistents[room_url];
            pmgr.set("other_share_urls", persistents);
            return true; }
        else { return false; }}

    /* ===== Containment ===== */
    /* For content_node_manager.clear_hierarchy() */

    ContentNode.prototype.contained_urls = function () {
        return [].concat(this.subdirs, this.files); }
    RootContentNode.prototype.contained_urls = function () {
        return [].concat(this.storage_devices,
                         this.original_shares, this.shares); }
    RootStorageNode.prototype.contained_urls = function () {
        return [].concat(this.subdirs); }
    FileStorageNode.prototype.contained_urls = function () {
        return []; }
    FileShareNode.prototype.contained_urls = function () {
        return []; }


    /* "Provisioning": Data model assimilation of fetched data */

    ContentNode.prototype.provision = function (data, when, mode_opts) {
        /* Populate node with JSON 'data'. 'when' is the data's current-ness.
           'when' should be no more recent than the XMLHttpRequest.
        */
        this.provision_preliminaries(data, when, mode_opts);
        this.provision_populate(data, when, mode_opts); }

    ContentNode.prototype.provision_preliminaries = function (data, when,
                                                              mode_opts) {
        /* Do provisioning stuff generally useful for derived types. */
        if (! when) {
            throw new Error("Node provisioning without reliable time stamp.");
        }
        this.up_to_date(when); }

    ContentNode.prototype.provision_populate = function (data, when,
                                                         mode_opts) {
        /* Stub, must be overridden by type-specific provisionings. */
        error_alert("Not yet implemented",
                    this.emblem
                    + " type-specific provisioning implementation"); }

    ContentNode.prototype.provision_items = function (data_items,
                                                      this_container,
                                                      url_base, url_element,
                                                      trailing_slash,
                                                      fields,
                                                      contents_parent) {
        /* Register data item fields into subnodes of this node:
           'data_items' - the object to iterate over for the data,
           'this_container' - the container into which to place the subnodes,
           'url_base' - the base url onto which the url_element is appended,
           'url_element' - the field name for the url of item within this node,
           'trailing_slash' - true: url is given a trailing slash if absent,
           'fields' - an array of field names for properties to be copied (1),
           'contents_parent' - the node to attribute as the subnodes parent (2).

           (1) Fields are either strings, denoting the same attribute name in
               the data item and subnode, or two element subarrays, with the
               first element being the data attribute name and the second being
               the attribute name for the subnode.
           (2) The contained item's parent is not always this object, eg for
               the content roots. */
        var parent = content_node_manager.get(contents_parent);
        data_items.map(function (item) {
            var url = url_base + item[url_element];
            if (trailing_slash && (url.slice(url.length-1) !== '/')) {
                url += "/"; }
            var subnode = content_node_manager.get(url, parent);
            fields.map(function (field) {
                if (field instanceof Array) {
                    subnode[field[1]] = item[field[0]]; }
                else {
                    subnode[field] = item[field]; }})
            // TODO Scaling - make subdirs an object for hashed lookup.
            if (this_container.indexOf(url) === -1) {
                this_container.push(url); }})}

    RootStorageNode.prototype.provision_populate = function (data, when,
                                                             mode_opts) {
        /* Embody the root storage node with 'data'.
           'when' is time soon before data was fetched. */
        var combo_root = content_node_manager.get_combo_root();
        var url, dev, devdata;

        // XXX ?:
        this.name = my.username;
        // TODO: We'll cook stats when UI is ready.
        this.stats = data["stats"];

        this.subdirs = [];
        this.provision_items(data.devices, this.subdirs,
                             this.url, 'encoded', true,
                             ['name', 'lastlogin', 'lastcommit'],
                             my.combo_root_url);

        this.lastfetched = when; }

    FolderContentNode.prototype.provision_populate = function (data, when) {
        /* Embody folder content items with 'data'.
           'when' is time soon before data was fetched. */

        this.subdirs = [];
        this.provision_items(data.dirs, this.subdirs, this.url, 1, true,
                             [[0, 'name']], this.url);

        if (data.hasOwnProperty('files')) {
            this.files = [];
            var fields = ['name', 'size', 'ctime', 'mtime', 'versions'];
            defaults.preview_sizes.map(function (size) {
                /* Add previews, if any, to the fields. */
                if (("preview_" + size) in data.files) {
                    fields.push("preview_" + size); }})
            this.provision_items(data.files, this.files, this.url, 'url', false,
                                 fields, this.url); }

        this.lastfetched = when; }

    OriginalRootShareNode.prototype.provision_populate = function (data, when) {
        /* Embody the root share room with 'data'.
           'when' is time soon before data was fetched. */
        this.subdirs = [];
        var room_base = my.shares_root_url + data.share_id_b32 + "/";
        this.provision_items(data.share_rooms, this.subdirs,
                             room_base, 'room_key', true,
                             [['room_name', 'name'],
                              ['room_description', 'description'],
                              'room_key', 'share_id'],
                             my.combo_root_url);
        this.subdirs.map(function (url) {
            /* Ensure the contained rooms urls are registered as originals. */
            register_original_share_room_url(url); });

        this.lastfetched = when; }

    DeviceStorageNode.prototype.provision_populate = function (data, when) {
        /* Embody storage folder items with 'data'.
           'when' is time soon before data was fetched. */
        FolderStorageNode.prototype.provision_populate.call(this, data, when); }
    RoomShareNode.prototype.provision_populate = function (data, when) {
        /* Embody storage folder items with 'data'.
           'when' is time soon before data was fetched. */
        FolderShareNode.prototype.provision_populate.call(this, data,
                                                              when);
        this.name = data.stats.room_name;
        this.description = data.stats.description;
        this.number_of_files = data.stats.number_of_files;
        this.number_of_folders = data.stats.number_of_folders;
        this.firstname = data.stats.firstname;
        this.lastname = data.stats.lastname;
        this.lastfetched = when; }

    FolderStorageNode.prototype.provision_populate = function (data, when) {
        /* Embody storage folder items with 'data'.
           'when' is time soon before data was fetched. */
        FolderContentNode.prototype.provision_populate.call(this, data, when); }
    FolderShareNode.prototype.provision_populate = function (data, when){
        /* Embody share room folder items with 'data'.
           'when' is time soon before data was fetched. */
        FolderContentNode.prototype.provision_populate.call(this, data, when); }
    FileStorageNode.prototype.provision_populate = function (data, when) {
        error_alert("Not yet implemented", "File preview"); }

    ContentNode.prototype.up_to_date = function (when) {
        /* True if provisioned data is considered current.
           Optional 'when' specifies (new) time we were fetched. */
        // The generic case offers no shortcut for determining up-to-date-ness.
        if (when) { this.lastfetched = when; }
        if (! this.lastfetched) { return false; }
        // No intelligence yet.
        return false; }


    /* ===== Content node page presentation ===== */

    ContentNode.prototype.my_page_id = function () {
        /* Set the UI page id, escaping special characters as necessary. */
        return this.url; }
    RootContentNode.prototype.my_page_id = function () {
        /* Set the UI page id, escaping special characters as necessary. */
        return defaults.combo_root_page_id; }
    OtherRootShareNode.prototype.my_page_id = function () {
        /* Set the UI page id, escaping special characters as necessary. */
        return defaults.other_shares_root_page_id; }
    OriginalRootShareNode.prototype.my_page_id = function () {
        /* Set the UI page id, escaping special characters as necessary. */
        return defaults.original_shares_root_page_id; }
    ContentNode.prototype.show = function (chngpg_opts, mode_opts) {
        /* Trigger UI focus on our content layout.
           If mode_opts "passive" === true, don't do a changePage.
         */
        var $page = this.my_page$();
        if ($.mobile.activePage
            && ($.mobile.activePage[0].id !== this.my_page_id())
            && (!mode_opts.passive)) {
            $.mobile.changePage($page, chngpg_opts); }
        // Just in case, eg of refresh:
        $.mobile.hidePageLoadingMsg(); }

    OtherRootShareNode.prototype.do_presentation = function (chngpg_opts,
                                                             mode_opts) {
        /* An exceptional, consolidated presentation routine. */
        // For use by this.visit() and this.notify_subvisit_status().
        this.subdirs.sort(content_nodes_by_url_sorter);
        this.layout(mode_opts);
        this.show(chngpg_opts, mode_opts);

        if (mode_opts.notify_callback) {
            mode_opts.notify_callback(true,
                                      mode_opts.notify_token); }}

    ContentNode.prototype.layout = function (mode_opts) {
        /* Deploy content as markup on our page. */
        this.layout_header(mode_opts);
        this.layout_content(mode_opts);
        this.layout_footer(mode_opts); }

    OtherRootShareNode.prototype.layout = function (mode_opts) {
        /* Deploy content as markup on our page. */
        // Get a split button on each item to provoke an action menu:
        var split_params = {url: this.url + '?action=collection_menu&target=',
                            icon: 'gear',
                            title: "Collection membership"};
        mode_opts.split_button_url_append = split_params;
        ContentNode.prototype.layout.call(this, mode_opts);
        var $content_items = this.my_page$().find('.page-content')
        if (this.subdirs.length === 0) {
            $content_items.hide(); }
        else {
            $content_items.show(); }}

    OtherRootShareNode.prototype.show = function (chngpg_opts, mode_opts) {
        /* Deploy content as markup on our page. */
        ContentNode.prototype.show.call(this, chngpg_opts, mode_opts);
        deploy_focus_oneshot('#my_share_id', "pageshow"); }

    RootContentNode.prototype.layout = function (chngpg_opts, mode_opts) {
        /* Do layout arrangements - different than other node types. */
        var $page = this.my_page$();

        this.layout_header();

        // Storage content section:
        // We avoid doing layout of these when not authenticated so the
        // re-presentation of the hidden sections doesn't show through.
        var storage_subdirs = (my.storage_root_url
                               && cnmgr.get(my.storage_root_url,
                                            this).subdirs
                               || [])
        this.layout_content(mode_opts, storage_subdirs, false,
                            '.storage-list');

        // My share rooms section:
        var myshares_subdirs = (my.original_shares_root_url
                                && cnmgr.get(my.original_shares_root_url,
                                             this).subdirs
                                || [])
        this.layout_content(mode_opts, myshares_subdirs, false,
                            '.my-shares-list');

        // Other share rooms section:
        var other_share_urls = other_share_room_urls();
        var $other_shares_nonempty = $page.find('.other-content');
        var $other_shares_empty = $page.find('.other-no-content');
        // Show the section or the button depending on whether there's content:
        if (other_share_urls.length === 0) {
            $other_shares_nonempty.hide();
            $other_shares_empty.show(); }
        else {
            $other_shares_empty.hide();
            $other_shares_nonempty.show();
            this.layout_content(mode_opts, other_share_urls, false,
                                '.other-shares-list'); }

        this.layout_footer(mode_opts); }

    ContentNode.prototype.layout_header_fields = function(fields) {
        /* Populate this content node's page header with these fields settings:
           field.title: html (or just text) with the page label;
           left_url: left-hand button URL; if absent left button not changed;
           left_label: text for left-hand button, or empty to hide the button;
                       left_label = "-" => use the login URL;
           right_url: right-hand button URL; if absent right button not changed;
           right_label: text for right-hand button, or empty to hide the button;
        */
        var $header = this.my_page$().find('[data-role="header"]');
        var $label;

        if (fields.hasOwnProperty('title')) {
            $header.find('.header-title').html(elide(fields.title, 25)); }

        if (fields.hasOwnProperty('right_url')) {
            var $right_slot = $header.find('.header-right-slot');
            $right_slot.attr('href', fields.right_url);
            if (fields.hasOwnProperty('right_label')) {
                if (! fields.right_label) {
                    $right_slot.hide(); }
                else {
                    replace_button_text($right_slot, elide(fields.right_label,
                                                           15));
                    $right_slot.show(); }}}

        if (fields.hasOwnProperty('left_url')) {
            var $left_slot = $header.find('.header-left-slot');
            if (fields.left_url === "-") {
                var parsed = $.mobile.path.parseUrl(window.location.href);
                fields.left_url = parsed.hrefNoHash; }
            $left_slot.attr('href', fields.left_url);
            if (fields.hasOwnProperty('left_label')) {
                if (! fields.left_label) {
                    $left_slot.hide(); }
                else {
                    replace_button_text($left_slot, elide(fields.left_label,
                                                          15));
                    $left_slot.show(); }}}}

    RootContentNode.prototype.layout_header = function (mode_opts) {
        /* Do special RootContentNode header layout. */
        var $header = this.my_page$().find('[data-role="header"]');
        var $logout_button = $header.find('.logout-button');
        if (! this.loggedin_ish()) {
            $logout_button.hide(); }
        else {
            $logout_button.show(); }}

    StorageNode.prototype.layout_header = function(mode_opts) {
        /* Fill in typical values for header fields of .my_page$().
           Many storage node types will use these values as is, some will
           replace them.
         */
        var fields = {};
        fields.right_url = ('#' + add_query_param(this.url,
                                                  "refresh", "true", true));
        fields.right_label = "Refresh";
        fields.title = this.name;
        if (this.parent_url) {
            var container = content_node_manager.get(this.parent_url);
            fields.left_url = '#' + this.parent_url;
            fields.left_label = container.name; }
        this.layout_header_fields(fields); }
    RootStorageNode.prototype.layout_header = function(mode_opts) {
        /* Fill in typical values for header fields of .my_page$(). */
        StorageNode.prototype.layout_header.call(this, mode_opts);
        this.layout_header_fields({'title': "Storage Devices",
                                   'left_label': "Home",
                                   'left_url': "#" + this.parent_url}); }

    ShareNode.prototype.layout_header = function(mode_opts) {
        /* Fill in header fields of .my_page$(). */
        var fields = {};
        if (this.parent_url) {
            var container = content_node_manager.get(this.parent_url);
            fields.right_url = '#' + add_query_param(this.url,"refresh","true");
            fields.right_label = "Refresh"
            fields.left_url = '#' + this.parent_url;
            fields.left_label = container.name;
            fields.title = this.name; }
        else {
            fields.right_url = '#' + add_query_param(this.url, "mode", "edit");
            fields.right_label = "Edit";
            fields.left_url = '#' + add_query_param(this.url, 'mode', "add");
            fields.left_label = "+";
            fields.title = "ShareRooms"; }
        this.layout_header_fields(fields); }

    RootShareNode.prototype.layout_header = function(mode_opts) {
        /* Fill in header fields of .my_page$(). */
        ShareNode.prototype.layout_header.call(this, mode_opts);
        var fields = {'right_url': '#' + add_query_param(this.url,
                                                         "mode", "edit"),
                      'right_label': "Edit"};
        this.layout_header_fields(fields); }

    ContentNode.prototype.layout_content = function (mode_opts,
                                                     subdirs,
                                                     files,
                                                     content_items_selector) {
        /* Present this content node by adjusting its DOM data-role="page".
           'mode_opts' adjust various aspects of provisioning and layout.
           'subdirs' is an optional array of urls for contained directories,
             otherwise this.subdirs is used;
           'files' is an optional array of urls for contained files, otherwise
             this.files is used;
           'content_items_selector' optionally specifies the selector for
             the listview to hold the items, via this.my_content_items$().
         */
        var $page = this.my_page$();
	var $content = $page.find('[data-role="content"]');
	var $list = this.my_content_items$(content_items_selector);
        if ($list.children().length) {
            $list.empty(); }

        subdirs = subdirs || this.subdirs;
        var lensubdirs = subdirs ? subdirs.length : 0;
        files = files || this.files;
        var lenfiles = files ? files.length : 0;
        var do_dividers = (lensubdirs + lenfiles) > defaults.dividers_threshold;
        var do_filter = (lensubdirs + lenfiles) > defaults.filter_threshold;

        function insert_item($item) {
            if ($cursor === $list) { $cursor.append($item); }
            else { $cursor.after($item); }
            $cursor = $item; }
        function conditionally_insert_divider(t) {
            if (do_dividers && t && (t[0].toUpperCase() !== curinitial)) {
                curinitial = t[0].toUpperCase();
                indicator = divider_prefix + curinitial;
                $item = $('<li data-role="list-divider" id="divider-'
                          + indicator + '">' + indicator + '</li>')
                insert_item($item); }}
        function insert_subnode(suburl) {
            var subnode = content_node_manager.get(suburl, this);
            conditionally_insert_divider(subnode.name);
            insert_item(subnode.layout_item$(mode_opts)); }

        if (lensubdirs + lenfiles === 0) {
            $list.append($('<li title="Empty" class="empty-placeholder"/>')
                         .html('<span class="empty-sign ui-btn-text">'
                               + '&empty;</span>')); }
        else {
            var $item;
            var curinitial, divider_prefix, indicator = "";
            var $cursor = $list;

            if (do_filter) { $list.attr('data-filter', 'true'); }
            if (lensubdirs) {
                divider_prefix = "/";
                for (var i=0; i < subdirs.length; i++) {
                    insert_subnode(subdirs[i]); }}
            if (lenfiles) {
                divider_prefix = "";
                for (var i=0; i < files.length; i++) {
                    insert_subnode(files[i]); }}}

        $page.page();
        $list.listview("refresh");
        return $page; }

    FolderContentNode.prototype.layout_item$ = function(mode_opts) {
        /* Return a folder-like content item's description as jQuery item.
           Optional:
           mode_opts['split_button_url_append']: {icon:, title:, url:}
            - construct a split button, appending node's url onto passed url.
         */
        var $a = $('<a/>').attr('class', "compact-vertical");
        $a.attr('href', "#" + this.url);
        $a.html($('<h4/>').html(this.name));

        var $it = $('<li/>').append($a);

        if (mode_opts && mode_opts.hasOwnProperty('split_button_url_append')) {
            var split_params = mode_opts.split_button_url_append;
            $a = $('<a/>');
            $a.attr('href', '#' + split_params.url + this.url);
            $a.attr('data-icon', split_params.icon);
            $a.attr('title', split_params.title);
            $it.find('a').after($a); }

        $it.attr('data-filtertext', this.name);

        return $it; }
    DeviceStorageNode.prototype.layout_item$ = function(mode_opts) {
        /* Return a storage device's description as a jQuery item. */
        return FolderStorageNode.prototype.layout_item$.call(this); }
    FolderStorageNode.prototype.layout_item$ = function(mode_opts) {
        /* Return a storage folder's description as a jQuery item. */
        return FolderContentNode.prototype.layout_item$.call(this, mode_opts); }
    FolderShareNode.prototype.layout_item$ = function(mode_opts) {
        /* Return a share room folder's description as a jQuery item. */
        return FolderContentNode.prototype.layout_item$.call(this, mode_opts); }
    RoomShareNode.prototype.layout_item$ = function(mode_opts) {
        /* Return a share room's description as a jQuery item. */
        return FolderShareNode.prototype.layout_item$.call(this,
                                                           mode_opts); }
    FileContentNode.prototype.layout_item$ = function(mode_opts) {
        /* Return a file-like content node's description as a jQuery item. */
        var $it = $('<li data-mini="true"/>');
        $it.attr('data-filtertext', this.name);

        var type = classify_file_by_name(this.name);
        var pretty_type = type ? (type + ", ") : "";
        var $details = $('<p>' + pretty_type + bytesToSize(this.size) +'</p>');

        var date = new Date(this.mtime*1000);
        var day_splat = date.toLocaleDateString().split(",");
        var $date = $('<p class="ul-li-aside">'
                      + day_splat[1] + "," + day_splat[2]
                      + " " + date.toLocaleTimeString()
                      +'</p>');
        var $table = $('<table width="100%"/>');
        var $td = $('<td colspan="2"/>').append($('<h4/>').html(this.name));
        $table.append($('<tr/>').append($td));
        var $tr = $('<tr/>');
        $tr.append($('<td/>').append($details).attr('wrap', "none"));
        $tr.append($('<td/>').append($date).attr('align', "right"));
        $table.append($tr);
        var $href = $('<a/>');
        $href.attr('href', this.url);
        $href.attr('class', "compact-vertical");
        $href.append($table);
        $it.append($href);

        // XXX use classification to select an icon:
        $it.attr('data-icon', "false");

        return $it; }

    FileStorageNode.prototype.layout_item$ = function(mode_opts) {
        /* Return a storage file's description as a jQuery item. */
        return FileContentNode.prototype.layout_item$.call(this, mode_opts); }
    FileShareNode.prototype.layout_item$ = function(mode_opts) {
        /* Return a storage file's description as a jQuery item. */
        return FileContentNode.prototype.layout_item$.call(this, mode_opts); }

    ContentNode.prototype.layout_footer = function(mode_opts) {
        /* Return markup with general and specific legend fields and urls. */
        // XXX Not yet implemented.
    }

    ContentNode.prototype.my_page_from_dom$ = function () {
        /* Return a jquery DOM search for my page, by id. */
        return $('#' + fragment_quote(this.my_page_id())); }
    ContentNode.prototype.my_page$ = function (reinit) {
        /* Return this node's jQuery page object, producing if not present.

           Optional 'reinit' means to discard existing page, if any,
           forcing clone of a new copy.

           If not present, we get a clone of the storage page template, and
           situate the clone after the storage page template.
        */
        if (reinit && this.$page) {
            this.$page.remove();
            delete this.$page; }
        if (! this.$page) {
            var $template = this.get_storage_page_template$();
            if (! $template) {
                error_alert("Missing markup",
                            "Expected page #"
                            + defaults.content_page_template_id
                            + " not present."); }
            this.$page = $template.clone();
            this.$page.attr('id', this.my_page_id());
            this.$page.attr('data-url', this.my_page_id());
            // Include our page in the DOM, after the storage page template:
            $template.after(this.my_page$()); }
        return this.$page; }
    OtherRootShareNode.prototype.my_page$ = function () {
        return RootContentNode.prototype.my_page$.call(this); }
    RootContentNode.prototype.my_page$ = function () {
        /* Return the special case of the root content nodes actual page. */
        return (this.$page
                ? this.$page
                : (this.$page = $("#" + this.my_page_id()))); }

    ContentNode.prototype.my_content_items$ = function (selector) {
        /* Return this node's jQuery contents litview object.
           Optional 'selector' is used, otherwise '.content-items'. */
        return this.my_page$().find(selector || '.content-items'); }
    ContentNode.prototype.get_storage_page_template$ = function() {
        return $("#" + defaults.content_page_template_id); }


    /* ===== Resource managers ===== */

    var persistence_manager = {
        /* Maintain domain-specific persistent settings, using localStorage.
           - Value structure is maintained using JSON.
           - Use .get(name), .set(name, value), and .remove(name).
           - .keys() returns an array of all stored keys.
           - .length returns the number of keys.
         */
        // NOTE Compat: versions of android < 2.1 do not support localStorage.
        //              They do support gears sqlite. lawnchair would make it
        //              easy to switch between them.
        get: function (name) {
            /* Retrieve the value for 'name' from persistent storage. */
            return JSON.parse(localStorage.getItem(name)); },
        set: function (name, value) {
            /* Preserve name and value in persistent storage.
               Return the settings manager, for chaining. */
            localStorage.setItem(name, JSON.stringify(value));
            return persistence_manager; },
        remove: function (name) {
            /* Delete persistent storage of name. */
            localStorage.removeItem(name); },
        keys: function () { return Object.keys(localStorage); },
        };
    // Gratuitous 'persistence_manager.length' getter, for a technical example:
    persistence_manager.__defineGetter__('length',
                                         function() {
                                             return localStorage.length; });
    var pmgr = persistence_manager;            // Compact name.


    var remember_manager = {
        /* Maintain user account info in persistent storage. */

        // "remember_me" field not in fields, so only it is retained when
        // remembering is disabled:
        fields: ['username', 'storage_host', 'storage_web_url'],

        unset: function (disposition) {
            /* True if no persistent remember manager settings are found. */
            return persistence_manager.get("remember_me") === null; },
        active: function (disposition) {
            /* Report or set "Remember Me" persistent account info retention.
               'disposition':
                 - activate if truthy,
                 - return status if not passed in, ie undefined,
                 - deactivate otherwise.
               Deactivating entails wiping the retained account info settings.
            */
            if (disposition) {
                return persistence_manager.set("remember_me", true); }
            else if (typeof disposition === "undefined") {
                return persistence_manager.get("remember_me") || false; }
            else {
                remember_manager.fields.map(function (key) {
                    persistence_manager.remove(key); });
                return persistence_manager.set("remember_me", false); }},

        fetch: function () {
            /* Return remembered account info . */
            var got = {};
            remember_manager.fields.map(function (key) {
                got[key] = persistence_manager.get(key); });
            return got; },

        store: function (obj) {
            /* Preserve account info, obtaining specific fields from 'obj'.
               Error is thrown if obj lacks any fields. */
            remember_manager.fields.map(function (key) {
                if (! obj.hasOwnProperty(key)) {
                    throw new Error("Missing field: " + key); }
                persistence_manager.set(key, obj[key]); })},

        remove_storage_host: function () {
            /* How to inhibit auto-login, without losing the convenience of
               a remembered username, in the absence of a way to remove the
               authentication cookies. */
            persistence_manager.remove('storage_host'); },
    };
    var remgr = remember_manager;


    var content_node_manager = function () {
        /* A singleton utility for getting and removing content node objects.
           "Getting" means finding existing ones or else allocating new ones.
        */
        // Type of newly minted nodes are according to get parameters.

        // ???: Cleanup? Remove nodes when ascending above them?
        // ???:
        // - prefetch offspring layer and defer release til 2 layers above.
        // - make fetch of multiple items contingent to device lastcommit time.

        /* Private */
        var by_url = {};

        /* Public */
        return {
            get_combo_root: function () {
                return this.get(my.combo_root_url, null); },

            get: function (url, parent) {
                /* Retrieve a node according to 'url'.
                   'parent' is required for production of new nodes,
                   which are produced on first reference.
                   Provisioning nodes with remote data is done elsewhere,
                   not here.
                 */
                url = url.split('?')[0];             // Strip query string.
                var got = by_url[url];
                if (! got) {

                    // Roots:
                    if (is_content_root_url(url)) {
                        if (is_combo_root_url(url)) {
                            got = new RootContentNode(url, parent); }
                        else if (url === my.storage_root_url) {
                            got = new RootStorageNode(url, parent); }
                        else if (url === my.original_shares_root_url) {
                            got = new OriginalRootShareNode(url, parent); }
                        else if (url === my.shares_root_url) {
                            got = new OtherRootShareNode(url, parent); }
                        else {
                            throw new Error("Content model management error");}}

                    // Contents:
                    else if (parent && (is_combo_root_url(parent.url))) {
                        // Content node just below a root:
                        if (is_storage_url(url)) {
                            got = new DeviceStorageNode(url, parent); }
                        else {
                            got = new RoomShareNode(url, parent); }}
                    else if (url.charAt(url.length-1) !== "/") {
                        // No trailing slash.
                        if (is_storage_url(url)) {
                            got = new FileStorageNode(url, parent); }
                        else {
                            got = new FileShareNode(url, parent); }}
                    else {
                        if (is_storage_url(url)) {
                            got = new FolderStorageNode(url, parent); }
                        else {
                            got = new FolderShareNode(url, parent); }
                    }
                    by_url[url] = got;
                }
                return got; },

            free: function (node) {
                /* Remove a content node from index and free it for gc. */
                if (by_url.hasOwnProperty(node.url)) {
                    delete by_url[node.url]; }
                node.free(); },

            clear_hierarchy: function (url) {
                /* Free node at 'url' and its recursively contained nodes. */
                var it = this.get(url);
                var suburls = it.contained_urls();
                for (var i=0; i < suburls.length; i++) {
                    this.clear_hierarchy(suburls[i]); }
                this.free(it); },

            // Expose the by_url registry when debugging:
            bu: (SO_DEBUGGING ? by_url : null),
        }
    }()
    var cnmgr = content_node_manager; // Compact name, for convenience.


    /* ===== Login ===== */

    function go_to_entrance() {
        /* Visit the entrance page. Depending on session state, it might
           present a login challenge or it might present the top-level
           contents associated with the logged-in account. */
        $.mobile.changePage(content_node_manager.get_combo_root().url); }

    function storage_login(login_info, url) {
        /* Login to storage account and commence browsing at devices.
           'login_info': An object with "username" and "password" attrs.
           'url': An optional url, else defaults.storage_login_path is used.
           We provide for redirection to specific alternative servers
           by recursive calls. See:
           https://spideroak.com/apis/partners/web_storage_api#Loggingin
        */
        var login_url;
        var server_host_url;
        var parsed;

        if (url
            && (parsed = $.mobile.path.parseUrl(url))
            && ["http:", "https:"].indexOf(parsed.protocol) !== -1) {
            server_host_url = parsed.domain;
            login_url = url; }

        else {
            server_host_url = defaults.base_host_url;
            login_url = (server_host_url + defaults.storage_login_path); }

        $.ajax({
            url: login_url,
            type: 'POST',
            dataType: 'text',
            data: login_info,
            success: function (data) {
                var match = data.match(/^(login|location):(.+)$/m);
                if (!match) {
                    error_alert('Temporary server failure',
                                'Please try again later.');
                } else if (match[1] === 'login') {
                    if (match[2].charAt(0) === "/") {
                        login_url = server_host_url + match[2];
                    } else {
                        login_url = match[2];
                    }
                    storage_login(login_info, login_url);
                } else {
                    // Browser haz auth cookies, we haz relative location.
                    // Go there, and machinery will intervene to handle it.
                    $.mobile.changePage(
                        set_storage_account(login_info['username'],
                                            server_host_url,
                                            match[2]));
                }},

            error: function (xhr) {
                $.mobile.hidePageLoadingMsg();
                var username;
                if (remember_manager.active()
                    && (username = persistence_manager.get('username'))) {
                    $('#my_login_username').val(username); }
                error_alert("Storage login", xhr.status); },

        }); }

    function storage_logout() {
        /* Conclude storage login, clearing credentials and stored data.
           Wind up back on the main entry page.
         */
        function finish() {
            clear_storage_account();
            if (remember_manager.active()) {
                // The storage server doesn't remove cookies, so we inhibit
                // relogin by removing the persistent info about the
                // storage host. This leaves the username intact as a
                // "remember" convenience for the user.
                remember_manager.remove_storage_host(); }
            go_to_entrance(); }

        var combo_root = content_node_manager.get_combo_root();
        combo_root.veil(true);

        if (! combo_root.loggedin_ish()) {
            // Can't reach logout location without server - just clear and bail.
            finish(); }
        else {
            // SpiderOak's logout url doesn't (as of 2012-06-15) remove cookies!
            $.ajax({url: my.storage_root_url + defaults.storage_logout_suffix,
                    type: 'GET',
                    success: function (data) {
                        finish(); },
                    error: function (xhr) {
                        console.log("Logout ajax fault: "
                                    + xhr.status
                                    + " (" + xhr.statusText + ")");
                        finish(); }}); }}

    RootContentNode.prototype.veil = function (conceal, callback) {
        /* If 'conceal' is true, conceal our baudy body.  Otherwise, gradually
           reveal and position the cursor in the username field.
           Optional callback is a function to invoke as part of the un/veiling.
        */
        function do_focus() {
            var $username = $('#my_login_username');
            if ($username.val() === "") { $username.focus(); }
            else { $('#my_login_password').focus(); }}
        function do_focus_and_callback() {
            do_focus();
            if (callback) { callback(); }}
        var selector = '#home [data-role="content"]';
        if (conceal) {
            $(selector).hide(0, callback);
            this.veiled = true; }
        else {
            this.veiled = false;
            // Surprisingly, doing focus before dispatching fadeIn doesn't work.
            // Also, username field focus doesn't *always* work before the
            // delay is done, hence the redundancy.  Sigh.
            $(selector).fadeIn(3000, do_focus_and_callback);
            do_focus(); }}

    function prep_login_form(content_selector, submit_handler, name_field,
                             do_fade) {
        /* Instrument form within 'content_selector' to submit with
           'submit_handler'. 'name_field' is the id of the form field with
           the login name, "password" is assumed to be the password field
           id. If 'do_fade' is true, the content portion of the page will
           be rigged to fade on form submit, and on pagechange reappear
           gradually.  In any case, the password value will be cleared, so
           it can't be reused.
        */
        var $content = $(content_selector);
        var $form = $(content_selector + " form");

        var $password = $form.find('input[name=password]');
        var $name = $form.find('input[name=' + name_field + ']');

        var $submit = $form.find('[type="submit"]');
        var sentinel = new submit_button_sentinel([$name, $password], $submit)
        $name.bind('keyup', sentinel);
        $password.bind('keyup', sentinel);
        $submit.button()
        sentinel();

        var $remember_widget = $form.find('#remember-me');
        var remembering = remember_manager.active();
        if (remembering && ($remember_widget.val() !== "on")) {
            $remember_widget.find('option[value="on"]').attr('selected',
                                                             'selected');
            $remember_widget.val("on");
            // I believe the reason we need to also .change() is because
            // the presented slider is just tracking the actual select widget.
            $remember_widget.trigger('change'); }
        else if (!remember_manager.unset() && !remembering) {
            $remember_widget.val("off");
            $remember_widget.trigger('change'); }
        var name_field_val = pmgr.get(name_field);
        if (name_field_val
            && ($remember_widget.length > 0)
            && ($remember_widget.val() === "on")) {
            $name.attr('value',name_field_val); }

        $form.submit(function () {
            var $remember_widget = $form.find('#remember-me');
            var $name = $('input[name=' + name_field + ']', this);
            var $password = $('input[name=password]', this);
            var data = {};
            if (($name.val() === "") || ($password.val() === "")) {
                // Minimal - the submit button sentinel should prevent this.
                return false; }
            data[name_field] = $name.val();
            $name.val("");
            if ($remember_widget.length > 0) {
                // Preserve whether or not we're remembering, so on a
                // successful visits we'll know whether to preserve data:
                if ($remember_widget.val() === "on") {
                    remember_manager.active(true); }
                else {
                    remember_manager.active(false); }}

            data['password'] = $password.val();
            if (do_fade) {
                var combo_root = content_node_manager.get_combo_root();
                combo_root.veil(true, function() { $password.val(""); });
                var unhide_form_oneshot = function(event, data) {
                    $content.show('fast');
                    $.mobile.hidePageLoadingMsg();
                    $(document).unbind("pagechange", unhide_form_oneshot);
                    $(document).unbind("error", unhide_form_oneshot); }
                $(document).bind("pagechange", unhide_form_oneshot)
                $(document).bind("error", unhide_form_oneshot); }
            else {
                $name.val("");
                $password.val(""); }
            $name.focus();
            submit_handler(data);
            return false; }); }


    /* ===== Public interface ===== */

    // ("public_interface" because "public" is reserved in strict mode.)
    var public_interface = {
        init: function () {
            /* Do preliminary setup and launch into the combo root. */

            // Setup traversal hook:
            establish_traversal_handler();

            my.combo_root_url = defaults.combo_root_url;
            var combo_root = content_node_manager.get_combo_root();
            var other_shares = content_node_manager.get(my.shares_root_url);

            // Properly furnish login form:
            prep_login_form('.nav_login_storage', storage_login,
                            'username', true);
            prep_login_form('.nav_login_share',
                            other_shares.add_item_external.bind(other_shares),
                            'shareid', false);

            // Hide everything below the banner, for subsequent unveiling:
            combo_root.veil(true);

            // Try a storage account if available from persistent settings
            if (remember_manager.active()) {
                var settings = remember_manager.fetch();
                if (settings.username && settings.storage_host) {
                    set_storage_account(settings.username,
                                        settings.storage_host,
                                        settings.storage_web_url); }}

            // ... and go:
            $.mobile.changePage(combo_root.url); },

    }


    /* ===== Boilerplate ===== */

    ContentNode.prototype.show_error_message = function (html) {
        /* Inject an 'html' error message after the node header.
           Returns the produced $esm object. */
        this.remove_error_message(); // Ditch prior.

        var $page = this.my_page$();
        var $esm = $page.find('.error-status-message');

        $esm = $('<ul data-role="listview" data-inset="true"/>')
            .append($('<li class="error-status-message" data-inset="true">')
                    .html(html));

        var $header = $page.find('[data-role="header"]');
        $header.after($('<br/>').after($esm));
        $esm.listview();
        $esm.show();
        return $esm; }

    ContentNode.prototype.remove_error_message = function () {
        /* Remove existing error status message, if present.
           Returns the prior message, if any was present, else null. */
        var $page = this.my_page$();
        var $esm = $page.find('.error-status-message');
        var was = null;

        if ($esm.length !== 0) {
            was = $esm.find('li').html;
            $esm.remove(); }

        return was; }

    ContentNode.prototype.toString = function () {
        return "<" + this.emblem + ": " + this.url + ">"; }


    var document_addrs = {
        /* Map specific document fragment addresses from the application
           document to internal functions/methods. */
        logout: storage_logout,
    }

    function internalize_url(obj) {
        /* Return the "internal" version of the 'url'.

           - For non-string objects, returns the object
           - For fragments of the application code's url, returns the fragment
             (sans the '#'),
           - Translates page-ids for root content nodes to their urls,
           - Those last two Combined transforms fragment references to root
             content pages to the urls of those pages.

           main body is that of the application.  Otherwise, the original
           object is returned. */
        if (typeof obj !== "string") { return obj; }
        if (obj.split('#')[0] === window.location.href.split('#')[0]) {
            obj = obj.split('#')[1]; }
        if (document_addrs.hasOwnProperty(obj)) {
            return obj; }
        switch (obj) {
        case (defaults.combo_root_page_id):
            return defaults.combo_root_url;
        case (defaults.original_shares_root_page_id):
            return my.original_shares_root_url;
        case (defaults.other_shares_root_page_id):
            return my.shares_root_url;
        default: return obj; }}

    function content_nodes_by_url_sorter(prev, next) {
        var prev_str = prev, next_str = next;
        var prev_name = content_node_manager.get(prev).name;
        var next_name = content_node_manager.get(next).name;
        if (prev_name && next_name) {
            prev_str = prev_name, next_str = next_name; }
        if (prev_str < next_str) { return -1; }
        else if (prev_str > next_str) { return 1; }
        else { return 0; }}

    if (SO_DEBUGGING) {
        // Expose the managers for access while debugging:
        public_interface.cnmgr = cnmgr;
        public_interface.pmgr = pmgr; }


    /* ===== Here we go: ===== */
    return public_interface;
}();



$(document).ready(function () {
    "use strict";               // ECMAScript 5

    // Development convenience: Go back to start page on full document reload.
    // All the internal application state is gone, anyway.
    if (window.location.hash) {
        $.mobile.changePage(window.location.href.split('#')[0]); }

    spideroak.init();
});
