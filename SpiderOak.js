/* SpiderOak html5 client Main app.

 * Works with:
 * - jquery.mobile-1.0.1.css
 * - jquery-1.6.4.js
 * - jquery.mobile-1.0.1.js
 * - cordova-1.9.0.js - PhoneGap API
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


    /* == Private elements == */

    /* ==== Object-wide settings ==== */

    var generic = {
        /* Settings not specific to a particular login session: */
        // API v1.
        // XXX base_host_url may vary according to brand package.
        base_host_url: brand.base_host_url,
        icons_dir: "icons",
        brand_images_dir: "brand_images",
        combo_root_url: "https://home",
        recents_url: "https://recents",
        combo_root_page_id: "home",
        recents_page_id: "recents",
        storage_root_page_id: "storage-home",
        original_shares_root_page_id: "original-home",
        public_shares_root_page_id: "share-home",
        content_page_template_id: "content-page-template",
        storage_login_path: "/browse/login",
        storage_logout_suffix: "logout",
        storage_path_prefix: "/storage/",
        original_shares_path_suffix: "shares",
        shares_path_suffix: "/share/",
        devices_query_expression: 'device_info=yes',
        versions_query_expression: 'format=version_info',
        home_page_id: 'home',
        root_storage_node_label: "Devices",
        preview_sizes: [25, 48, 228, 800],
        dividers_threshold: 10,
        filter_threshold: 10,
        compact_threshold: 500,
        recents_max_size: 25,
        public_share_room_urls: {},
        titled_choice_popup_id: 'titled-choice-popup',
        depth_path_popup_id: 'depth-path-popup',
        top_level_info_ids: ['about-dashboard', 'about-spideroak'],
    };

    if (SO_DEBUGGING) {
        var hostname = window.location.hostname;
        if (hostname.slice(hostname.length-6) == "fx5.de") {
            generic.fx5_proxying = true;
            generic.base_host_url = "https://www.fx5.de/so";
            generic.alt_host_replace = "https://web-dc2.spideroak.com";
            generic.alt_host_url = "https://www.fx5.de/so_dc2";
            generic.storage_path_prefix = "/so" + generic.storage_path_prefix;
            generic.shares_path_suffix = "/so" + generic.shares_path_suffix; }}

    var my = {
        /* Login session settings: */
        username: "",
        storage_host: null,
        storage_web_url: null,  // Location of storage web UI for user.
        storage_root_url: null,
        original_shares_root_url: null,
        // All the service's actual shares reside within:
        public_shares_root_url: generic.base_host_url + "/share/",
        original_share_room_urls: {},
    };

    var base32 = new Nibbler({dataBits: 8,
                              codeBits: 5,
                              keyString: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567',
                              pad: '='});
    Nibbler.prototype.encode_trim = function (str) {
        /* Base32 encoding with trailing "=" removed. */
        return this.encode(str).replace(/=+$/, ''); }


    /* ==== Navigation handlers ==== */

    function handle_content_visit(e, data) {
        /* Intercept URL visits and intervene for repository content. */
        var page = internalize_url(data.toPage);

        if ((typeof page === "string")
            && (is_content_url(page)
                || document_addrs.hasOwnProperty(page))) {
            e.preventDefault();
            if (transit_manager.is_repeat_url(page)) {
                // Popup dismissal sends the URL back through, and the
                // default machinery needs to see it.
                return true; }
            var mode_opts = query_params(page);
            if (document_addrs.hasOwnProperty(page)) {
                var internal = internalize_url(document.location.href);
                return document_addrs[page].call(this, internal); }
            else if (data.toPage !== $.mobile.activePage.attr('id')) {
                node_manager.get_recents().add_visited_url(page);
                // Skip exact duplicates, for eg non-select popup dismissals.
                return node_manager.get(page).visit(data.options,
                                                    mode_opts); }}}

    function establish_traversal_handler() {
        /* Establish page change event handler. */
        bind_replace($(document),
                     "pagebeforechange.SpiderOak",
                     handle_content_visit); }


    /* ==== Content Root Registration ====  */

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
        /* Obliterate internal settings and all content nodes for a clean
           slate.  All share artifacts, original and other, are removed, as
           well as registered storage and recents.  We do not remove
           persistent settings. */

        if (my.original_shares_root_url) {
            var original_shares_root = nmgr.get(my.original_shares_root_url);
            original_share_room_urls_list().map(
                original_shares_root.clear_item)
            // remove_item, above, frees the rooms and contents.
            nmgr.free(original_shares_root); }
        my.original_shares_root_url = "";

        if (my.storage_root_url) {
            node_manager.clear_hierarchy(my.storage_root_url); }
        my.storage_root_url = "";

        node_manager.free(node_manager.get_recents());
        node_manager.free(node_manager.get_combo_root());

        my.username = "";
        my.storage_host = "";
        my.storage_web_url = ""; }


    /* ===== Node-independent content URL categorization ==== */

    // Managed content is organized within two content roots:
    //
    // - the storage root, my.storage_root_url, determined by the user's account
    // - the public share root, which is the same across all accounts
    //
    // There is also a collection of the shares originated by the account,
    // in the OriginalRootShareNode.  Like all share rooms, the items are
    // actually public shares, but the collection listing is only visible
    // from within the account.
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
                               + generic.storage_path_prefix
                               + base32.encode_trim(username)
                               + "/");
        // Original root is determined by storage root:
        register_original_shares_root();

        return my.storage_root_url; }

    function register_original_shares_root() {
        /* Identify original share rooms root url. Depends on established
           storage root.  Return the url. */
        my.original_shares_root_url =
            (my.storage_root_url + generic.original_shares_path_suffix); }
    function register_public_share_room_url(url) {
        /* Include url among the registered share rooms.  Returns the url. */
        generic.public_share_room_urls[url] = true;
        return url; }
    function unregister_public_share_room_url(url) {
        /* Remove 'url' from the registered public share rooms.
           Returns the url, or none if nothing to unregister. */
        if (generic.public_share_room_urls.hasOwnProperty(url)) {
            delete generic.public_share_room_urls[url];
            return url; }}
    function register_original_share_room_url(url) {
        /* Include url among the registered original rooms.
           Also registers among the set of all familiar share room urls.
           Returns the url. */
        my.original_share_room_urls[url] = true;
        return url; }
    function unregister_original_share_room_url(url) {
        /* Remove 'url' from the registered original share rooms.
           Returns the url, or none if nothing to unregister. */
        if (my.original_share_room_urls.hasOwnProperty(url)) {
            delete my.original_share_room_urls[url];
            return url; }}
    function is_combo_root_url(url) {
        return (url === my.combo_root_url); }
    function is_recents_url(url) {
        return (url === generic.recents_url); }
    function is_content_root_url(url) {
        /* True if the 'url' is for one of the root content items.  We
           split off any search fragment.  Doesn't depend on the url having
           an established node. */
        url = url.split('?')[0];
        return ((url === my.combo_root_url)
                || (url === generic.recents_url)
                || (url === my.storage_root_url)
                || (url === my.original_shares_root_url)
                || (url === my.public_shares_root_url)); }
    function is_share_room_url(url) {
        /* True if the 'url' is for one of the familiar share rooms.
           Doesn't depend on the url having an established node. */
        return (is_original_share_room_url(url)
                || is_public_share_room_url(url)); }
    function is_original_share_room_url(url) {
        /* True if the 'url' is for one of the original share rooms.
           Doesn't depend on the url having an established node. */
        return my.original_share_room_urls.hasOwnProperty(url); }
    function is_public_share_room_url(url) {
        /* True if the 'url' is for one of the original share rooms.
           Doesn't depend on the url having an established node. */
        return generic.public_share_room_urls.hasOwnProperty(url); }
    function is_storage_url(url) {
        /* True if the URL is for a content item in the user's storage area.
           Doesn't depend on the url having an established node. */
        return (my.storage_root_url
                && (url.slice(0, my.storage_root_url.length)
                    === my.storage_root_url)); }
    function is_share_url(url) {
        /* True if the URL is for a content item in the user's storage area.
           Does not include the original shares root.
           Doesn't depend on the url having an established node. */
        return (my.public_shares_root_url
                && (url.slice(0, my.public_shares_root_url.length)
                    === my.public_shares_root_url)); }
    function is_content_url(url) {
        /* True if url within registered content roots. */
        url = internalize_url(url); // ... for content root page ids.
        return (is_storage_url(url)
                || is_share_url(url)
                || is_combo_root_url(url)
                || is_content_root_url(url)); }

    function public_share_room_urls_list() {
        /* Return an array of public share room urls being visited. */
        return Object.keys(generic.public_share_room_urls); }
    function original_share_room_urls_list() {
        /* Return an array of original share room urls being visited. */
        return Object.keys(my.original_share_room_urls); }

    /* ===== Data model ==== */

    /* Nodes coordinate data - remote content details, settings, account
       info - and DOM presentation.  The collection is managed by the
       node_manager, where the nodes are addressed by their url. */

    function Node(url, parent) {
        /* Constructor for any kinds of managed items.
           'url' - address by which item is retrived from node_manager. For
                   remotely managed content, it's the remote-data access URL.
           'parent' - containing node
        */
        if (! (this instanceof Node)) {      // Coding failsafe.
            throw new Error("Constructor called as a function");
        }
        if (url) {             // Skip if we're in prototype assignment.
            this.url = url;
            this.name = "";
            // Top-level content nodes have content-specific root_url but
            // combo-root (RootContentNode) parent.
            this.root_url = parent ? parent.root_url : url;
            this.parent_url = parent ? parent.url : null;
            this.$page = null;  // This node's jQuery-ified DOM data-role="page"
            this.emblem = "";   // At least for debugging/.toString()
            this.icon_path = ""; }}
    Node.prototype.free = function () {
        /* Free composite content to make available for garbage collection. */
        if (this.$page) {
            this.$page.remove();
            this.$page = null; }}

    function PanelNode(url, parent) {
        /* Constructor for items representing application interface items.
           - 'url' is absolute URL for the collection's root (top) node.
           - 'parent' is containing node. The root's parent is null.
        */
        if ( !(this instanceof PanelNode) ) {      // Coding failsafe.
            throw new Error("Constructor called as a function");
        }
        if (url) {             // Skip if we're in prototype assignment.
            this.url = url;
            this.name = "";
            this.root_url = parent.root_url;
            this.parent_url = parent ? parent.url : null;
            this.subdirs = [];  // Urls of contained devices, folders.
            this.files = [];    // Urls of contained files.
            this.$page = null;  // This node's jQuery-ified DOM data-role="page"
            this.lastfetched = false;
            this.emblem = "";   // At least for debugging/.toString()
            this.icon_path = ""; }}
    ContentNode.prototype = new Node();


    /* ContentNodes represent service-managed content. That includes
       distinct manifestations of storage (backups) content and share
       rooms. Content-specific roots encompass the various remote content
       collections.  An extrapolated RootContentNode, aka the "combo root",
       consolidates them all. */

    function ContentNode(url, parent) {
        /* Constructor for items representing service-managed content.
           - 'url' is absolute URL for the collection's root (top) node.
           - 'parent' is containing node. The root's parent is null.
           See JSON data examples in docs/api_json_examples.txt
        */
        Node.call(this, url, parent);
        if (url) {             // Skip if we're in prototype assignment.
            this.query_qualifier = "";
            this.subdirs = [];  // Urls of contained devices, folders.
            this.files = [];    // Urls of contained files.
            this.lastfetched = false;
            this.emblem = "";   // At least for debugging/.toString()
            this.icon_path = ""; }}
    ContentNode.prototype = new Node();

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
        this.emblem = brand.title;
        this.name = "Dash";
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
        this.query_qualifier = "?" + generic.devices_query_expression;
        this.emblem = "Root Storage";
        this.stats = null;
        delete this.files; }
    RootStorageNode.prototype = new StorageNode();
    function RootShareNode(url, parent) {
        ShareNode.call(this, url, parent);
        this.emblem = "Root Share";
        this.root_url = url; }
    RootShareNode.prototype = new ShareNode();

    function RecentContentsNode(url, parent) {
        ContentNode.call(this, url, parent);
        this.emblem = "Recently Visited Items";
        // We'll use subdirs for the items - we care not about the types:
        this.items = this.subdirs;
        delete this.files; }
    RecentContentsNode.prototype = new ContentNode();

    function PublicRootShareNode(url, parent) {
        RootShareNode.call(this, url, parent);
        this.name = "Public Share Rooms";
        this.emblem = "Public Share Rooms";
        this.job_id = 0; }
    OriginalRootShareNode.prototype = new RootShareNode();
    function OriginalRootShareNode(url, parent) {
        RootShareNode.call(this, url, parent);
        this.name = "My Share Rooms";
        this.emblem = "Originally Published Share Rooms"; }
    PublicRootShareNode.prototype = new RootShareNode();

    function DeviceStorageNode(url, parent) {
        StorageNode.call(this, url, parent);
        this.emblem = "Storage Device";
        this.device_url = url; }
    DeviceStorageNode.prototype = new StorageNode();
    function RoomShareNode(url, parent) {
        ShareNode.call(this, url, parent);
        this.emblem = "Share Room";
        this.room_url = url;
        var splat = url.split('/');
        if (splat[splat.length-1] === "") {
            splat.pop(); }
        this.share_id = base32.decode(splat[splat.length-2]);
        this.room_key = splat[splat.length-1]; }
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
        delete this.subdirs;
        delete this.files; }
    FileStorageNode.prototype = new StorageNode();
    function FileShareNode(url, parent) {
        this.emblem = "Share Room File";
        ShareNode.call(this, url, parent);
        delete this.subdirs;
        delete this.files; }
    FileShareNode.prototype = new ShareNode();

    /* ===== Content type and role predicates ==== */

    ContentNode.prototype.is_root = function () {
        /* True if the node is a collections top-level item. */
        return (this.url === this.root_url); }

    ContentNode.prototype.is_device = function() {
        return false; }
    DeviceStorageNode.prototype.is_device = function() {
        return true; }

    /* ===== Remote data access ==== */

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

        this.veil(true);

        this.remove_status_message();

        this.show(chngpg_opts, {});
        $.mobile.loading('show');

        if (mode_opts && mode_opts.logout) {
            this.logout();
            return true; }

        // We always dispatch the public shares visit:
        var public_mode_opts = {passive: true,
                                notify_callback:
                                    this.notify_subvisit_status.bind(this),
                                notify_token: 'public-shares'};
        $.extend(public_mode_opts, mode_opts);
        var public_root = nmgr.get(my.public_shares_root_url);
        public_root.visit(chngpg_opts, public_mode_opts);

        if (! this.loggedin_ish()) {
            // Not enough registered info to try authenticating:
            this.authenticated(false);
            this.layout(mode_opts);
            this.show(chngpg_opts, {}); }

        else {
            var storage_root = node_manager.get(my.storage_root_url, this);
            // Use a distinct copy of mode_opts:
            var storage_mode_opts = $.extend({}, public_mode_opts);
            storage_mode_opts.notify_token = 'storage';
            // Will chain to original shares via notify_callback.
            $.mobile.loading('show');
            storage_root.visit(chngpg_opts, storage_mode_opts); }}

    RecentContentsNode.prototype.visit = function (chngpg_opts, mode_opts) {
        /* Present the accumulated list of recently visited nodes. */

        // (Could mode_opts.hasOwnProperty('action') for recents editing.)

        this.layout($.extend({no_dividers: true}, mode_opts));
        this.show(chngpg_opts, mode_opts); }

    PublicRootShareNode.prototype.visit = function (chngpg_opts, mode_opts) {
        /* Obtain the known, non-original share rooms and present them. */
        // Our content is the set of remembered urls, from:
        // - those visited in this session
        // - those remembered across sessions

        this.remove_status_message('result');
        this.remove_status_message('error');

        if (mode_opts.hasOwnProperty('action')) {
            var action = mode_opts.action;
            if (this[action] && this[action].is_action) {
                var got = this[action](mode_opts.subject);
                this.do_presentation(chngpg_opts, {});
                return got; }}

        // this.add_item() only adds what's missing, and sets this.subdirs.
        this.get_subdir_prospects().map(this.add_item.bind(this));
        this.do_presentation(chngpg_opts, mode_opts); }

    PublicRootShareNode.prototype.get_subdir_prospects = function () {
        /* Load the subdirs list from active list and persistence. */
        var subdirs = public_share_room_urls_list();
        var persisted = persistence_manager.get('public_share_urls') || {};
        var additions = [];
        Object.keys(persisted).map(function (item) {
            if (subdirs.indexOf(item) === -1) {
                additions.push(item); }});
        return subdirs.concat(additions); }

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

        if (token !== 'public-shares') {
            this.authenticated(true); }

        var $page = this.my_page$();
        var selector = ((token === 'storage')
                        ? "#my-storage-leader"
                        : "#my-rooms-leader")
        var $leader = $(selector);

        if (! succeeded) {
            $.mobile.loading('hide');
            if (token === "storage") {
                this.authenticated(false, response);
                this.layout(); }}
        else {
            // Unnecessary relayout of header and footer is future-proofing:
            this.layout();

            if (token === 'storage') {
                // Ensure we're current page and chain to original shares root.

                this.layout({}, {});
                this.show({}, {});

                var our_mode_opts = {passive: true,
                                     notify_callback:
                                       this.notify_subvisit_status.bind(this),
                                     notify_token: 'original-share'};
                this.authenticated(true, response);
                var ps_root = nmgr.get(my.original_shares_root_url, this);
                ps_root.visit({}, our_mode_opts); }
            else {
                if (this.veiled) {
                    this.veil(false, $.mobile.loading('hide')); }
                else {
                    $.mobile.loading('hide'); }}}}

    PublicRootShareNode.prototype.notify_subvisit_status = function(succeeded,
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
        var splat = url.split('/');
        if (splat[splat.length-1] === "") {
            splat.pop(); }
        var share_id = base32.decode(splat[splat.length-2]);
        var room_key = splat[splat.length-1];

        if (succeeded !== true) {
            this.remove_status_message('result');
            which_msg += (_t("Share ID")
                          + ' <span class="message-subject">'
                          + share_id + "</span> ");
            var message = (_t("Sorry") + " - " + which_msg + " "
                           + content.statusText + " (" + content.status + ")");
            var remove = true;
            this.show_status_message(message);
            // We may wind up unpersisting items due to a transient problem,
            // but the situation is too complicated to settle by prompting.
            this.remove_item(url);
            this.unpersist_item(url); }
        else {
            this.remove_status_message('error');
            if (this.adding_external) {
                var room = node_manager.get(url);
                var digested_name = (room && room.title()
                                     ? elide(room.title(), 30)
                                     : ("(" + _t("Share ID") + " "
                                        + share_id + ")"));
                var which_msg = ('<span class="message-subject">'
                                 + digested_name + "</span>");
                var $sm = this.show_status_message(_t("Added") +" "+ which_msg,
                                                   'result');
                this.adding_external = false; }
            else {
                this.remove_status_message('result'); }
            if (persistence_manager.get('retaining_visits')) {
                this.persist_item(url); }}

        // Do update, whether or not it was successful:
        this.subdirs = public_share_room_urls_list()
        this.subdirs.sort(content_nodes_by_url_sorter)
        this.do_presentation({}, {passive: true});
        // NOTE: Necessary to avoid skeleton items in init combo-root view.
        //       There should be a better, less arbitrarily intrusive way.
        node_manager.get_combo_root().layout(); }

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
            $.mobile.loading('hide');
            alert("Visit '" + this.name + "' failed: "
                  + xhr.statusText + " (" + xhr.status + ")");
            var combo_root = node_manager.get_combo_root();
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
            this.remove_status_message();
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
                this.show_status_message(error_message);
                if (response.status === 401) {
                    // Unauthorized - expunge all privileged info:
                    clear_storage_account(); }}
            // Hide the storage and original shares sections
            $content_section.hide();
            if (this.veiled) { this.veil(false); }}}

    PublicRootShareNode.prototype.actions_menu_link = function (subject_url) {
        /* Create a menu for 'subject_url' using 'template_id'.  Return an
           anchor object that will popup the menu when clicked. */

        var href = ('#' + this.url
                    + '?action=enlisted_room_menu&subject='
                    + subject_url)
        href = transit_manager.distinguish_url(href);

        var $anchor = $('<a/>');
        $anchor.attr('href', href);
        $anchor.attr('data-icon', 'gear');
        $anchor.attr('title', "Actions menu");
        // Return it for deployment:
        return $anchor; }

    PublicRootShareNode.prototype.enlisted_room_menu = function (subject_url) {
        /* For an enlisted RoomShareNode 'subject_url', furnish the simple
         * popup menu with context-specific actions. */

        var fab_anchor = function (action, subject_url, icon_name, item_text) {
            var href = (this.here() + '?action=' + action
                        + '&subject=' + subject_url);
            return ('<a href="' + href + '" data-icon="' + icon_name + '"'
                    + 'data-mini="true" data-iconpos="right">'
                    + item_text + '</a>')}.bind(this);

        var $popup = $('#' + generic.titled_choice_popup_id);
        var $listview = $popup.find('[data-role="listview"]');
        // Ditch prior contents:
        $listview.empty()

        var subject_room = node_manager.get(subject_url);
        $popup.find('.title').html('<span class="subdued">Room: </span>'
                                   + elide(subject_room.title(), 50));
        $popup.find('.close-button').attr('href',
                                          this.here() + '?refresh=true');

        var $remove_li = $('<li/>');
        $remove_li.append(fab_anchor('remove_item_external',
                                     subject_url,
                                     'delete',
                                     _t("Drop this room from the list")));

        var $persistence_li = $('<li/>');
        if (this.is_persisted(subject_url)) {
            $persistence_li.append(fab_anchor('unpersist_item',
                                              subject_url,
                                              'minus',
                                              _t("Stop retaining across"
                                                 + " sessions"))); }
        else {
            $persistence_li.append(fab_anchor('persist_item',
                                              subject_url,
                                              'plus',
                                              "Retain across sessions")); }
        $listview.append($remove_li, $persistence_li);

        // popup handlers apparently not actually implemented as of 2012-07-01.
        //var handlers = {opened: function (event, ui) {
        //                    console.log('opened'); },
        //                closed: function (event, ui) {
        //                    console.log("popup closed"); }}
        //$popup.popup(handlers);
        $popup.popup();
        $popup.parent().page();
        $listview.listview('refresh');
        $popup.popup('open');
    }
    // Whitelist this method for use as a mode_opts 'action':
    PublicRootShareNode.prototype.enlisted_room_menu.is_action = true;

    RecentContentsNode.prototype.add_visited_url = function (url) {
        /* Register a recent visit.  Omit our own address and any
           duplicates, disregarding query parameters. */
        url = url.split('?')[0];
        if ((url !== this.url)) {
            var was = this.items.indexOf(url);
            if (was !== 0) {
                // If the item isn't already the first.
                if (was !== -1) {
                    this.items.splice(was, 1); }
                this.items.unshift(url);
                this.items.splice(generic.recents_max_size); }}}

    PublicRootShareNode.prototype.add_item_external = function (credentials) {
        /* Visit a specified share room, according to 'credentials' object:
           {username, password}.
           Use this routine only for the form add.  Use this.add_item(),
           instead, for internal operation.
        */

        this.job_id += 1;       // Entry

        var share_id = credentials.shareid;
        var room_key = credentials.password;
        var new_share_url = (my.public_shares_root_url
                             + base32.encode_trim(share_id)
                             + "/" + room_key
                             + "/");
        if (is_public_share_room_url(new_share_url)) {
            this.remove_status_message('result');
            var room = node_manager.get(new_share_url);
            var digested_title = ((room && room.title())
                                  ? elide(room.title(), 25)
                                  : "(" + _t("Share ID") +" " + share_id + ")");
            var message = (_t("Room")
                           + ' <span class="message-subject">'
                           + digested_title + "</span> "
                           + _t("already added"))
            this.show_status_message(message, 'error'); }
        else {
            this.remove_status_message('error');
            var $sm = this.show_status_message(_t("Working..."),
                                               'result');
            this.adding_external = true;
            $sm.hide();
            $sm.delay(1000).fadeIn(2000); // Give time for error to appear.
            return this.add_item(new_share_url); }}

    PublicRootShareNode.prototype.add_item = function (url) {
        /* Visit a specified share room, according its' URL address.
           Return the room object. */
        register_public_share_room_url(url);
        var room = node_manager.get(url, node_manager.get_combo_root());
        room.visit({},
                   {passive: true,
                    notify_callback: this.notify_subvisit_status.bind(this),
                    notify_token: [this.job_id, url]});
        this.subdirs = public_share_room_urls_list();
        return room; }


    PublicRootShareNode.prototype.remove_item_external = function (room_url) {
        /* Omit a non-original share room from persistent and resident memory.
           This is for use from outside of the object. Use .remove_item() for
           internal object operation. */
        this.job_id += 1;
        var splat = room_url.split('/');
        if (splat[splat.length-1] === "") {
            splat.pop(); }
        var share_id = base32.decode(splat[splat.length-2]);
        var room_key = splat[splat.length-1];
        var room = node_manager.get(room_url);
        var digested_name = ((room && room.title())
                             ? elide(room.title(), 25)
                             : "(Share ID " + share_id + ")")
        var message = ("Public share room "
                       + '<span class="message-subject">'
                       + digested_name + "</span>");

        if (! is_public_share_room_url(room_url)) {
            this.show_status_message(message + " " + _t("not found."),
                                     'error'); }
        else {
            this.remove_status_message('error');
            this.adding_external = true;
            this.remove_item(room_url);
            this.show_status_message(message + " " + _t("removed."),
                                     'result'); }}
    // Whitelist this method for use as a mode_opts 'action':
    PublicRootShareNode.prototype.remove_item_external.is_action = true;

    PublicRootShareNode.prototype.remove_item = function (room_url) {
        /* Omit a non-original share room from the persistent and resident
           collections. Returns true if the item was present, else false. */
        if (is_public_share_room_url(room_url)) {
            if (! is_original_share_room_url(room_url)) {
                // Free the nodes.
                node_manager.clear_hierarchy(room_url); }
            unregister_public_share_room_url(room_url);
            this.unpersist_item(room_url);
            this.subdirs = public_share_room_urls_list();
            return true; }
        else { return false; }}

    OriginalRootShareNode.prototype.clear_item = function (room_url) {
        /* Omit an original share room from the resident collection.
           (The share room is not actually removed on the server.)
           Returns true if the item was present, else false. */
        if (is_original_share_room_url(room_url)) {
            if (! is_public_share_room_url(room_url)) {
                // Free the nodes.
                node_manager.clear_hierarchy(room_url); }
            unregister_original_share_room_url(room_url);
            return true; }
        else { return false; }}

    PublicRootShareNode.prototype.persist_item = function (room_url) {
        /* Add a share rooms to the collection persistent non-originals. */
        var persistents = pmgr.get('public_share_urls') || {};
        if (! persistents.hasOwnProperty(room_url)) {
            persistents[room_url] = true;
            pmgr.set("public_share_urls", persistents); }}
    // Whitelist this method for use as a mode_opts 'action':
    PublicRootShareNode.prototype.persist_item.is_action = true;

    PublicRootShareNode.prototype.unpersist_item = function (room_url) {
        /* Omit a non-original share room from the persistent
           collection.  Returns true if the item was present, else false. */
        var persistents = pmgr.get("public_share_urls") || {};
        if (persistents.hasOwnProperty(room_url)) {
            delete persistents[room_url];
            pmgr.set('public_share_urls', persistents);
            return true; }
        else { return false; }}
    // Whitelist this method for use as a mode_opts 'action':
    PublicRootShareNode.prototype.unpersist_item.is_action = true;

    PublicRootShareNode.prototype.is_persisted = function (room_url) {
        var persisteds = persistence_manager.get('public_share_urls') || {};
        return persisteds.hasOwnProperty(room_url); }

    /* ===== Containment ==== */
    /* For node_manager.clear_hierarchy() */

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


    /* ==== Provisioning - Data model assimilation of fetched data ==== */

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
                                                      fields,
                                                      contents_parent) {
        /* Register data item fields into subnodes of this node:
           'data_items' - the object to iterate over for the data,
           'this_container' - the container into which to place the subnodes,
           'url_base' - the base url onto which the url_element is appended,
           'url_element' - the field name for the url of item within this node,
           'fields' - an array of field names for properties to be copied (1),
           'contents_parent' - the node to attribute as the subnodes parent (2).

           (1) Fields are either strings, denoting the same attribute name in
               the data item and subnode, or two element subarrays, with the
               first element being the data attribute name and the second being
               the attribute name for the subnode.
           (2) The contained item's parent is not always this object, eg for
               the content roots. */
        var parent = node_manager.get(contents_parent);
        data_items.map(function (item) {
            var url = url_base + item[url_element];
            var subnode = node_manager.get(url, parent);
            fields.map(function (field) {
                if (field instanceof Array) {
                    subnode[field[1]] = item[field[0]]; }
                else {
                    if (typeof item[field] !== "undefined") {
                        subnode[field] = item[field]; }}})
            if (subnode.name && (subnode.name[subnode.name.length-1] === "/")) {
                // Remove trailing slash.
                subnode.name = subnode.name.slice(0, subnode.name.length-1); }
            // TODO Scaling - make subdirs an object for hashed lookup?
            if (this_container.indexOf(url) === -1) {
                this_container.push(url); }})}

    RootStorageNode.prototype.provision_populate = function (data, when,
                                                             mode_opts) {
        /* Embody the root storage node with 'data'.
           'when' is time soon before data was fetched. */
        var combo_root = node_manager.get_combo_root();
        var url, dev, devdata;

        this.name = my.username;
        // TODO: We'll cook stats when UI is ready.
        this.stats = data["stats"];

        this.subdirs = [];
        this.provision_items(data.devices, this.subdirs,
                             this.url, 'encoded',
                             ['name', 'lastlogin', 'lastcommit'],
                             my.combo_root_url);

        this.lastfetched = when; }

    FolderContentNode.prototype.provision_populate = function (data, when) {
        /* Embody folder content items with 'data'.
           'when' is time soon before data was fetched. */

        this.subdirs = [];
        this.provision_items(data.dirs, this.subdirs, this.url, 1,
                             [[0, 'name']], this.url);

        if (data.hasOwnProperty('files')) {
            this.files = [];
            var fields = ['name', 'size', 'ctime', 'mtime', 'versions'];
            generic.preview_sizes.map(function (size) {
                /* Add previews, if any, to the fields. */
                if (("preview_" + size) in data.files) {
                    fields.push("preview_" + size); }})
            this.provision_items(data.files, this.files, this.url, 'url',
                                 fields, this.url);
            if (this.name && (this.name[this.name.length-1] === "/")) {
                // Remove trailing slash.
                this.name = this.name.slice(0, this.name.length-1); }
        }

        this.lastfetched = when; }

    OriginalRootShareNode.prototype.provision_populate = function (data, when) {
        /* Embody the root share room with 'data'.
           'when' is time soon before data was fetched. */
        this.subdirs = [];
        var room_base = my.public_shares_root_url + data.share_id_b32 + "/";
        // Introduce a room.room_tail with trailing slash:
        data.share_rooms.map(function (room) {
            if (room.room_key[room.room_key.length-1] !== "/") {
                room.room_tail = room.room_key + "/"; }
            else { room.room_tail = room.room_key; }});
        this.provision_items(data.share_rooms, this.subdirs,
                             room_base, 'room_tail',
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


    /* ==== Content node page presentation ==== */

    ContentNode.prototype.my_page_id = function () {
        /* Set the UI page id, escaping special characters as necessary. */
        return this.url; }
    RootContentNode.prototype.my_page_id = function () {
        return generic.combo_root_page_id; }
    RootStorageNode.prototype.my_page_id = function () {
        return generic.storage_root_page_id; }
    OriginalRootShareNode.prototype.my_page_id = function () {
        return generic.original_shares_root_page_id; }
    PublicRootShareNode.prototype.my_page_id = function () {
        return generic.public_shares_root_page_id; }
    ContentNode.prototype.show = function (chngpg_opts, mode_opts) {
        /* Trigger UI focus on our content layout.
           If mode_opts "passive" === true, don't do a changePage.
         */
        var $page = this.my_page$();
        if ($.mobile.activePage
            && ($.mobile.activePage[0].id !== this.my_page_id())
            && mode_opts
            && (!mode_opts.passive)) {
            // Use $page object so our handler defers to regular jQm traversal:
            $.mobile.changePage($page, chngpg_opts); }
        // Just in case, eg of refresh:
        $.mobile.loading('hide'); }

    PublicRootShareNode.prototype.do_presentation = function (chngpg_opts,
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

    PublicRootShareNode.prototype.layout = function (mode_opts) {
        /* Deploy content as markup on our page. */

        mode_opts.actions_menu_link_creator = this.actions_menu_link.bind(this);
        ContentNode.prototype.layout.call(this, mode_opts);

        var $content_items = this.my_page$().find('.page-content')
        if (this.subdirs.length === 0) {
            $content_items.hide(); }
        else {
            $content_items.show(); }}

    PublicRootShareNode.prototype.show = function (chngpg_opts, mode_opts) {
        /* Deploy content as markup on our page. */
        ContentNode.prototype.show.call(this, chngpg_opts, mode_opts);
        deploy_focus_oneshot('#my_share_id', "pageshow"); }

    RootContentNode.prototype.layout = function (chngpg_opts, mode_opts) {
        /* Do layout arrangements - different than other node types. */
        var $page = this.my_page$();

        this.layout_header(chngpg_opts, mode_opts);
        this.link_to_roots(chngpg_opts, mode_opts);
        // Storage content section:
        // We avoid doing layout of these when not authenticated so the
        // re-presentation of the hidden sections doesn't show through.
        var storage_subdirs = (my.storage_root_url
                               && node_manager.get(my.storage_root_url,
                                                   this).subdirs
                               || [])
        this.layout_content(mode_opts, storage_subdirs, false,
                            '.storage-list');

        // My share rooms section:
        var myshares_subdirs = (my.original_shares_root_url
                                && node_manager.get(my.original_shares_root_url,
                                                    this).subdirs
                                || [])
        this.layout_content(mode_opts, myshares_subdirs, false,
                            '.my-shares-list');

        // Public share rooms section:
        var public_share_urls = public_share_room_urls_list();
        var $public_shares_nonempty = $page.find('.other-content');
        var $public_shares_empty = $page.find('.other-no-content');
        // Show the section or the button depending on whether there's content:
        if (public_share_urls.length === 0) {
            $public_shares_nonempty.hide();
            $public_shares_empty.show(); }
        else {
            $public_shares_empty.hide();
            $public_shares_nonempty.show();
            this.layout_content(mode_opts, public_share_urls, false,
                                '.other-shares-list'); }

        this.layout_footer(mode_opts); }

    ContentNode.prototype.layout_header = function(mode_opts) {
        /* Do the essential, common header layout.  If mode_opts
           'alt_page_selector' is passed in, alter that one instead of the
           node's default page. */

        // Every node gets the depth path menu.
        var $page = ((mode_opts && mode_opts.alt_page_selector)
                     ? $(mode_opts.alt_page_selector)
                     : this.my_page$());
        var $title = $page.find('[data-role="header"] .header-title');
        bind_replace($title, 'click.SpiderOak',
                     this.depth_path_menu.bind(this));
        bind_replace($title, 'taphold.SpiderOak', go_to_entrance);

        var fields = {};
        fields.title = this.title();
        if (this.parent_url) {
            var container = node_manager.get(this.parent_url);
            fields.left_url = '#' + this.parent_url;
            fields.left_label = container.name; }
        this.layout_header_fields(fields); }

    ContentNode.prototype.layout_header_fields = function(fields) {
        /* Generalized header layout facility.

           Populate this node's page header with fields settings:

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
            var $icon = this.my_icon_image$("so-image-icon");
            var $title = $('<span/>').text(elide(fields.title, 25));
            $header.find('.header-title').empty().append($icon, $title); }

        var $right_slot = $header.find('.header-right-slot');
        if (fields.hasOwnProperty('right_url')) {
            $right_slot.attr('href', fields.right_url);
            if (fields.hasOwnProperty('right_label')) {
                if (! fields.right_label) {
                    $right_slot.hide(); }
                else {
                    replace_button_text($right_slot, elide(fields.right_label,
                                                           15));
                    $right_slot.show(); }}}
        else {
            $right_slot.hide(); }

        var $left_slot = $header.find('.header-left-slot');
        if (fields.hasOwnProperty('left_url')) {
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
                    $left_slot.show(); }}}
        else {
            $left_slot.hide(); }}

    RootContentNode.prototype.layout_header = function (mode_opts) {
        /* Do special RootContentNode header layout. */
        ContentNode.prototype.layout_header.call(this, mode_opts);
        // Give the info pages the combo root's depth path menu:
        generic.top_level_info_ids.map(function (id) {
            var alt_mode_opts = {alt_page_selector: '#' + id};
            ContentNode.prototype.layout_header.call(
                this, alt_mode_opts); }.bind(this));

        var $header = this.my_page$().find('[data-role="header"]');
        var $logout_button = $header.find('.logout-button');
        var $title = $header.find('.header-title');
        $logout_button.hide(); }

    StorageNode.prototype.layout_header = function(mode_opts) {
        /* Fill in typical values for header fields of .my_page$().
           Many storage node types will use these values as is, some will
           replace them.
         */
        ContentNode.prototype.layout_header.call(this, mode_opts); }

    RootStorageNode.prototype.layout_header = function(mode_opts) {
        StorageNode.prototype.layout_header.call(this, mode_opts);

        var $page = this.my_page$();
        $page.find('.original_shares_root_url')
            .attr('href', '#' + my.original_shares_root_url);
        $page.find('.public_shares_root_url')
            .attr('href', '#' + my.public_shares_root_url);
        var $emptiness_message = $page.find('.emptiness-message');
        (this.subdirs.length === 0
         ? $emptiness_message.show()
         : $emptiness_message.hide()); }
    PublicRootShareNode.prototype.layout_header = function(mode_opts) {
        ShareNode.prototype.layout_header.call(this, mode_opts);

        // Inject a brief description.
        var $page = this.my_page$();
        $page.find('.storage_root_url')
            .attr('href', '#' + my.storage_root_url);
        $page.find('.public_shares_root_url')
            .attr('href', '#' + my.public_shares_root_url);
        var $adjust_spiel = $page.find('.adjust-spiel');
        (this.subdirs.length === 0
         ? $adjust_spiel.hide()
         : $adjust_spiel.show()); }
    OriginalRootShareNode.prototype.layout_header = function(mode_opts) {
        ShareNode.prototype.layout_header.call(this, mode_opts);
        // Adjust the description.
        var $page = this.my_page$();
        var $emptiness_message = $page.find('.emptiness-message');
        $page.find('.storage_root_url').attr('href', '#' + my.storage_root_url);
        $page.find('.public_shares_root_url')
            .attr('href', '#' + my.public_shares_root_url);
        (this.subdirs.length === 0
         ? $emptiness_message.show()
         : $emptiness_message.hide()); }

    ShareNode.prototype.layout_header = function(mode_opts) {
        /* Fill in header fields of .my_page$(). */
        ContentNode.prototype.layout_header.call(this, mode_opts);

        var fields = {};
        if (this.parent_url) {
            var container = node_manager.get(this.parent_url);
            fields.left_url = '#' + this.parent_url;
            fields.left_label = container.name;
            fields.title = this.title(); }
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

    RootContentNode.prototype.link_to_roots = function (chngpg_opts, mode_opts){
        /* Link section headers to the variable root nodes, if the storage
           root is known. (The public root address is static, so hard-coded
           in the HTML.) */

        if (my.storage_root_url) {
            var $storage = $('#my-storage-leader');
            $storage.find('a').attr('href',
                                    '#' + my.storage_root_url);
            var $originals = $('#my-rooms-leader');
            $originals.find('a').attr('href',
                                      '#' + my.original_shares_root_url); }}

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
        var do_dividers = ((! (mode_opts && mode_opts.no_dividers))
                           && ((lensubdirs + lenfiles)
                               > generic.dividers_threshold));
        var do_filter = (lensubdirs + lenfiles) > generic.filter_threshold;

        function insert_item($item) {
            if ($cursor === $list) { $cursor.append($item); }
            else { $cursor.after($item); }
            $cursor = $item; }
        function conditionally_insert_divider(t) {
            if (do_dividers && t && (t[0].toUpperCase() !== curinitial)) {
                curinitial = t[0].toUpperCase();
                indicator = curinitial + divider_suffix;
                $item = $('<li data-role="list-divider" id="divider-'
                          + indicator + '">' + indicator + '</li>')
                insert_item($item); }}
        function insert_subnode(suburl) {
            var subnode = node_manager.get(suburl, this);
            conditionally_insert_divider(subnode.name);
            insert_item(subnode.layout_item$(mode_opts)); }

        if (lensubdirs + lenfiles === 0) {
            $list.append($('<li title="Empty" class="empty-placeholder"/>')
                         .html('<span class="empty-sign ui-btn-text">'
                               + '&empty;</span>')); }
        else {
            var $item;
            var curinitial, divider_suffix, indicator = "";
            var $cursor = $list;

            if (do_filter) { $list.attr('data-filter', 'true'); }
            if (lensubdirs) {
                divider_suffix = " /";
                for (var i=0; i < subdirs.length; i++) {
                    insert_subnode(subdirs[i]); }}
            if (lenfiles) {
                divider_suffix = "";
                for (var i=0; i < files.length; i++) {
                    insert_subnode(files[i]); }}}

        $page.page();
        $list.listview("refresh");
        return $page; }

    ContentNode.prototype.layout_item$ = function(mode_opts) {
        /* Return a jQuery object with the basic content item layout. */
        var $anchor = $('<a/>').attr('class', "crushed-vertical item-url");
        var href;
        if (mode_opts
            && mode_opts.hasOwnProperty('refresh')) {
            href = "#" + (add_query_param(this.url,
                                          'refresh', "true", true)); }
        else {
            href = "#" + this.url; }
        $anchor.attr('href', href);
        $anchor.append($('<h4 class="item-title"/>').html(this.name));
        var $icon = this.my_icon_image$("ui-li-icon");
        if ($icon) {
            $anchor.children().before($icon); }

        var $it = $('<li/>').append($anchor);
        $it.attr('data-icon',
                 (mode_opts && mode_opts.icon) || "so-carat-r");
        $it.attr('data-transition',
                 (mode_opts && mode_opts.transition) || "slide");

        if (mode_opts
            && mode_opts.hasOwnProperty('actions_menu_link_creator')) {
            $anchor = mode_opts.actions_menu_link_creator(this.url);
            $it.find('a').after($anchor); }

        $it.attr('data-filtertext', this.name);

        return $it; }
    FolderContentNode.prototype.layout_item$ = function(mode_opts) {
        /* Return a jQuery object representing a folder-like content item.

           If mode_opts has 'actions_menu_link_creator', apply it to our
           URL to get back a anchor to a context-specific actions menu for
           this item.
         */
        return ContentNode.prototype.layout_item$.call(this, mode_opts); }
    DeviceStorageNode.prototype.layout_item$ = function(mode_opts) {
        /* Return a storage device's description as a jQuery item. */
        return FolderStorageNode.prototype.layout_item$.call(this, mode_opts); }
    FolderStorageNode.prototype.layout_item$ = function(mode_opts) {
        /* Return a storage folder's description as a jQuery item. */
        return FolderContentNode.prototype.layout_item$.call(this, mode_opts); }
    FolderShareNode.prototype.layout_item$ = function(mode_opts) {
        /* Return a share room folder's description as a jQuery item. */
        return FolderContentNode.prototype.layout_item$.call(this, mode_opts); }
    RoomShareNode.prototype.layout_item$ = function(mode_opts) {
        /* Return a share room's description as a jQuery item. */
        var $it = FolderShareNode.prototype.layout_item$.call(this, mode_opts);
        var $title = $it.find('.item-title');
        $title.html($title.html()
                    + '<div> <small> <span class="subdued">Share ID:</span> '
                    + this.share_id
                    + ' </small> </div>');
        return $it; }
    FileContentNode.prototype.layout_item$ = function(mode_opts) {
        /* Return a file-like content node's description as a jQuery item. */
        var $it = ContentNode.prototype.layout_item$.call(this, mode_opts);

        var type = describe_file_by_name(this.name);
        var pretty_type = type ? (type + ", ") : "";
        var $details = $('<p>' + pretty_type + bytesToSize(this.size) +'</p>');

        var date = new Date(this.mtime*1000);
        var day_splat = date.toLocaleDateString().split(",");
        var $date = $('<p class="ul-li-aside">'
                      + day_splat[1] + "," + day_splat[2]
                      + " " + date.toLocaleTimeString()
                      +'</p>');
        var $table = $('<table width="100%"/>');
        var $icon = this.my_icon_image$("so-image-icon");
        var $name = $('<h4/>').html(this.name);
        var $legend = ($('<table/>')
                       .append($('<tr/>')
                               .append($('<td valign="center"/>').append($icon),
                                       $('<td/>').append($name))));
        var $td = $('<td colspan="2"/>').append($legend);
        $table.append($('<tr/>').append($td));
        var $tr = $('<tr/>');
        $tr.append($('<td/>').append($details).attr('wrap', "none"));
        $tr.append($('<td/>').append($date).attr('align', "right"));
        $table.append($tr);

        var $anchor = $it.find('a.item-url');
        $anchor.empty();
        $anchor.append($table);

        return $it; }

    FileStorageNode.prototype.layout_item$ = function(mode_opts) {
        /* Return a storage file's description as a jQuery item. */
        return FileContentNode.prototype.layout_item$.call(this, mode_opts); }
    FileShareNode.prototype.layout_item$ = function(mode_opts) {
        /* Return a storage file's description as a jQuery item. */
        return FileContentNode.prototype.layout_item$.call(this, mode_opts); }
    RootContentNode.prototype.layout_item$ = function(mode_opts) {
        /* Present the combo root as a jQm listview item.
           Include a logout split-button link. */

        function logout_link_button(url) {
            var logout_link = '#' + add_query_param(this.url,
                                                    'logout', "true");
            return $('<a href="' + logout_link + '" data-icon="delete"'
                     + ' data-role="button" class="logout-button"'
                     + ' data-iconpos="notext"> Logout </a>'); }

        // Duplicate, rather than pollute the circulating mode_opts:
        mode_opts = $.extend({}, mode_opts || {});
        if (this.loggedin_ish()
            && (! mode_opts.hasOwnProperty('actions_menu_link_creator'))) {
            mode_opts.actions_menu_link_creator
                = logout_link_button.bind(this); }
        return FolderContentNode.prototype.layout_item$.call(this, mode_opts); }

    ContentNode.prototype.layout_footer_by_spec = function(spec_array,
                                                           mode_opts) {
        /* Populate the nodes' footer according to a 'spec_array', so that
           the specific items in the produced footer can subsequently be
           adjusted by .change_footer_item() using selectors.

           The spec array is max 5-element sequence of specification objects:

               [spec-obj-1, spec-obj-2, ...]

           Each spec is an object that must have these properties:

               {title: <the legend for the action>,
                url: <an app-supported address, usually url>,
                selector: <class for the item, for later selection>,
                icon_name: <name of the action icon>}

           The items in the constructed footer will be addressable by the
           specified class-selector, and also by sequentially numbered
           selector strings of the form "footer-item-N", where N starts
           with 1. */

        var $ul = $('<ul/>');
        var element_count = 1;
        var $anchor;
        spec_array.map(function (spec) {
            var $li = $('<li/>');
            var classes = ("footer-item-" + element_count
                           + " " + spec.selector);
            $li.attr('class', classes);
            $anchor = $('<a data-role="button"/>');
            if (! is_compact_mode()) {
                $anchor.attr('data-icon', spec.icon_name);
                $anchor.attr('data-iconpos', "top"); }
            $anchor.attr('href', spec.url);
            // Enclose text in a labelled span so we can get at it surgically,
            // from within intervening stuff that jQuery injects:
            $anchor.append($('<span class="item-label"/>')
                           .text(spec.title));
            $li.append($anchor);
            $ul.append($li);
            element_count += 1; });
        var $footer = this.my_page$().find('[data-role="footer"]');
        var $navbar = $footer.find('[data-role="navbar"]');
        $navbar.replaceWith($('<div data-role="navbar"/>').append($ul));
        $navbar = $footer.find('[data-role="navbar"]');
        $navbar.navbar(); }

    ContentNode.prototype.change_footer_item = function(selector,
                                                        spec,
                                                        mode_opts) {
        /* Alter a footer item identified by 'selector', applying 'spec'.
           Fields missing from the spec will be left unaltered.
           A new selector will be appended (if not already present;
           the old selector class will be retained).
           See ContentNode.layout_footer_by_spec() for details. */
        var $footer = this.my_page$().find('[data-role="footer"]');
        var $navbar = $footer.find('[data-role="navbar"]');
        var $target_li = $navbar.find(selector);
        if ($target_li.length > 0) {
            if (spec.title) {
                $target_li.find('a span.item-label')
                    .text(spec.title); }
            if (spec.url) {
                $target_li.find('a').attr('href', spec.url); }
            if (spec.selector) {
                // NOTE: We don't remove the prior class
                var classes = $target_li.attr('class');
                if (classes.indexOf(spec.selector) === -1) {
                    $target_li.attr('class',
                                    classes.concat(" "
                                                   + spec.selector)); }}
            if (! is_compact_mode() && spec.icon_name) {
                $target_li.find('a').attr('data-icon', spec.icon_name) }
            $navbar.navbar(); }}

    ContentNode.prototype.layout_footer = function(mode_opts) {
        /* Populate the footer for this node. */
        this.layout_footer_by_spec([{title: "Dash",
                                     url: "#home",
                                     selector: "dashboard",
                                     icon_name: "so-dashboard-footer"},
                                    {title: "Recents",
                                     url: "#recents",
                                     selector: "recents",
                                     icon_name: "so-recents-footer"},
                                    ],
                                   mode_opts); }

    RootContentNode.prototype.layout_footer = function(mode_opts) {
        ContentNode.prototype.layout_footer.call(this, mode_opts);
        this.change_footer_item('.dashboard',
                                {title: "About " + brand.label,
                                 url: "#about-spideroak",
                                 selector: "about-spideroak",
                                 icon_name: "so-logo-footer"}); }

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
                            + generic.content_page_template_id
                            + " not present."); }
            this.$page = $template.clone();
            this.$page.attr('id', this.my_page_id());
            this.$page.attr('data-url', this.my_page_id());
            // Include our page in the DOM, after the storage page template:
            $template.after(this.my_page$()); }
        return this.$page; }
    RootContentNode.prototype.my_page$ = function () {
        /* Return the special case of the root content nodes actual page. */
        return (this.$page
                ? this.$page
                : (this.$page = $("#" + this.my_page_id()))); }
    PublicRootShareNode.prototype.my_page$ = function () {
        return RootContentNode.prototype.my_page$.call(this); }
    OriginalRootShareNode.prototype.my_page$ = function () {
        return RootContentNode.prototype.my_page$.call(this); }
    RootStorageNode.prototype.my_page$ = function () {
        return RootContentNode.prototype.my_page$.call(this); }

    ContentNode.prototype.my_content_items$ = function (selector) {
        /* Return this node's jQuery contents listview object.
           Optional 'selector' is used, otherwise '.content-items'. */
        return this.my_page$().find(selector || '.content-items'); }
    ContentNode.prototype.get_storage_page_template$ = function() {
        return $("#" + generic.content_page_template_id); }

    ContentNode.prototype.my_icon_image$ = function(image_class) {
        /* Return this item's icon image element, with 'image_class'.
           Return null if this item has no icon.

           The image has this.emblem as the alternate text.

           Typically, image class is one of "so-image-icon", for images
           situated in arbitrary places, or ui-li-icon for images in jQm
           icon image slots. */
        var icon = this.my_icon_path();
        if (! icon) { return null; }
        return ($('<img/>').attr('src', icon).attr('alt', this.emblem)
                .attr('class', image_class)); }

    FileContentNode.prototype.my_icon_path = function() {
        var icon = icon_name_by_file_name(this.name);
        return generic.icons_dir + "/" + (icon
                                          ?  icon + ".png"
                                          : "file.png"); }
    FileStorageNode.prototype.my_icon_path = function() {
        return FileContentNode.prototype.my_icon_path.call(this); }
    FileShareNode.prototype.my_icon_path = function() {
        return FileContentNode.prototype.my_icon_path.call(this); }
    ContentNode.prototype.my_icon_path = function() {
        return generic.icons_dir + "/folder.png"; }
    DeviceStorageNode.prototype.my_icon_path = function() {
        return generic.icons_dir + "/device.png"; }
    RoomShareNode.prototype.my_icon_path = function() {
        return generic.icons_dir + "/room_public.png"; }
    OriginalRootShareNode.prototype.my_icon_path = function() {
        return generic.icons_dir + "/room_original.png"; }
    PublicRootShareNode.prototype.my_icon_path = function() {
        return generic.icons_dir + "/room_public.png"; }
    RootContentNode.prototype.my_icon_path = function () {
        return generic.brand_images_dir + "/brand_logo.png"; }

    ContentNode.prototype.here = function () {
        /* Return the complete address of this content node, as part of the
           application code, not just its JSON url.  */
        return window.location.href.split('#')[0] + '#' + this.url; }

    ContentNode.prototype.title = function () {
        return this.name || this.emblem; }

    RootContentNode.prototype.title = function () {
        return (my.username
                ? this.emblem + ': ' + my.username
                : this.emblem); }


    /* ===== Popup Menus ===== */

    ContentNode.prototype.depth_path_menu = function(event) {
        /* Popup a menu showing from the containment navigation with more
           distant further down. Include a link to logout. */

        var $popup = $('#' + generic.depth_path_popup_id);
        var mode_opts = {};

        var $listview = $popup.find('[data-role="listview"]');
        $listview.empty();

        // refresh necessary so jQuery traversal stuff doesn't pass over:
        if (! this instanceof RecentContentsNode) {
            $listview.append(this.layout_item$($.extend({refresh: true,
                                                         icon: "refresh"},
                                                        mode_opts))); }
        var ancestor_url = this.parent_url;
        while (ancestor_url) {
            var ancestor = node_manager.get(ancestor_url);
            $listview.append(
                ancestor.layout_item$($.extend({transition: "slideup",
                                                icon: "so-carat-l"},
                                               mode_opts)));
            ancestor_url = ancestor.parent_url; }

        $popup.popup();
        $popup.parent().page();
        $listview.listview('refresh');
        $popup.popup('open', event.clientX, event.clientY);
        // Stop percolation:
        return false; }

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

        // "remember_me" field not in fields, so its setting is retained
        // when remembering is disabled:
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
                return persistence_manager.get("remember_me"); }
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

    var transit_manager = function () {
        /* Facilities to detect repeated traversals of the same URL.  To
           use, (1) when creating a url for traversal,
               url = tm.distinguish(url)
           handle_content_visit() will recognize repeats within recents_span
           traversals, and let them pass.
        */
        var tm_param_name = "so_transit";
        var recent_transits = [];
        var recents_span = 3;

        function new_distinction() {
            return ''.concat(new Date().getTime()
                             + Math.floor(Math.random() * 1e5)); }
        function is_repeat(distinction) {
            /* Check 'distinction', and register that we've seen it if not
               already registered. */
            if (! distinction) { return false; }
            else if (recent_transits.indexOf(distinction) != -1) {
                return true; }
            else {
                recent_transits.unshift(distinction);
                recent_transits.splice(recents_span);
                return false; }}

        return {
            distinguish_url: function(url) {
                /* Add a query parameter to a url to distinguish it, so it
                   can be recognized on redundant changePage. */
                var distinct = new_distinction();
                var delim = ((url.search('\\?') === -1) ? "?" : "&");
                return url.concat(delim + tm_param_name + "=" + distinct); },
            is_repeat_url: function(url) {
                return is_repeat(query_params(url)[tm_param_name]); },
        }}()
    var tmgr = transit_manager;


    var node_manager = function () {
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

        // Cached references, for frequent access with impunity:
        var combo_root = null;
        var recents = null;

        /* Public */
        return {
            get_combo_root: function () {
                if (! combo_root) {
                    combo_root = this.get(my.combo_root_url, null); }
                return combo_root; },

            get_recents: function () {
                if (! recents) {
                    recents = this.get(generic.recents_url,
                                       this.get_combo_root()); }
                return recents; },

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
                        else if (is_recents_url(url)) {
                            got = new RecentContentsNode(url, parent); }
                        else if (url === my.storage_root_url) {
                            got = new RootStorageNode(url, parent); }
                        else if (url === my.original_shares_root_url) {
                            got = new OriginalRootShareNode(url, parent); }
                        else if (url === my.public_shares_root_url) {
                            got = new PublicRootShareNode(url, parent); }
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
                if (combo_root && (node.url === combo_root.url)) {
                    combo_root = null; }
                else if (recents && node.url === recents.url) {
                    recents = null; }
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
    var nmgr = node_manager; // Compact name, for convenience.


    /* ==== Login / Logout ==== */

    function go_to_entrance() {
        /* Visit the entrance page. Depending on session state, it might
           present a login challenge or it might present the top-level
           contents associated with the logged-in account. */
        // Use a string url so our transit machinery registers a visit.
        $.mobile.changePage(my.combo_root_url); }

    function storage_login(login_info, url) {
        /* Login to storage account and commence browsing at devices.
           'login_info': An object with "username" and "password" attrs.
           'url': An optional url, else generic.storage_login_path is used.
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
            server_host_url = generic.base_host_url;
            login_url = (server_host_url + generic.storage_login_path); }

        $.ajax({
            url: login_url,
            type: 'POST',
            dataType: 'text',
            data: login_info,
            success: function (data) {
                var match = data.match(/^(login|location):(.+)$/m);
                if (!match) {
                    var combo_root = node_manager.get_combo_root();
                    combo_root.show_status_message(
                        error_alert_message(_t('Temporary server failure'),
                                            _t('Please try again later.'))); }
                else if (match[1] === 'login') {
                    if (match[2].charAt(0) === "/") {
                        login_url = server_host_url + match[2]; }
                    else if (generic.fx5_proxying) {
                        var ahr = generic.alt_host_replace;
                        if (match[2].slice(0, ahr.length) === ahr) {
                            // Use the proxy location:
                            login_url = (generic.alt_host_url
                                         + match[2].slice(ahr.length)); }}
                    else {
                        login_url = match[2]; }
                    storage_login(login_info, login_url); }
                else {
                    // Browser haz auth cookies, we haz relative location.
                    // Go there, and machinery will intervene to handle it.
                    $.mobile.changePage(
                        set_storage_account(login_info['username'],
                                            server_host_url,
                                            match[2])); }
            },

            error: function (xhr) {
                $.mobile.loading('hide');
                var username;
                if (remember_manager.active()
                    && (username = persistence_manager.get('username'))) {
                    $('#my_login_username').val(username); }
                    var combo_root = node_manager.get_combo_root();
                combo_root.show_status_message(
                    error_alert_message('Storage login', xhr.status));
                $(document).trigger("error"); }
        }); }

    function storage_logout() {
        /* Conclude storage login, clearing credentials and stored data.
           Wind up back on the main entry page. */

        // NOTE: For now we logout only via the combo root.  We're hitting
        // an incompabibility with the default jQm traversal machinery if
        // we try to logout directly from a content page or root, with the
        // machinery apparently expecting some data registered for the
        // fromPage that's not present.

        var combo_root = node_manager.get_combo_root();
        combo_root.logout(); }

    RootContentNode.prototype.logout = function () {
        function finish () {
            clear_storage_account();
            if (remember_manager.active()) {
                // The storage server doesn't remove cookies, so we inhibit
                // relogin by removing the persistent info about the
                // storage host. This leaves the username intact as a
                // "remember" convenience for the user.
                remember_manager.remove_storage_host(); }
            node_manager.get_combo_root().visit(); }

        this.veil(true);

        if (! this.loggedin_ish()) {
            // Can't reach logout location without server - just clear and bail.
            finish(); }
        else {
            $.ajax({url: my.storage_root_url + generic.storage_logout_suffix,
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
           Optional 'callback' - function to invoke as part of the un/veiling.
        */
        function do_conditional_focus() {
            var $username = $('#my_login_username');
            var $password = $('#my_login_password');
            if (! ($username.is(':focus') || $password.is(':focus'))) {
                if ($username.val() === "") {
                    $username.focus(); }
                else { $password.focus(); }}}
        function do_conditional_focus_and_callback() {
            do_conditional_focus();
            if (callback) { callback(); }}
        var selector = '#home [data-role="content"]';
        selector = selector.concat(', .error-status-message',
                                   ', .result-status-message');
        if (conceal) {
            $(selector).hide(0, callback);
            this.veiled = true; }
        else {
            this.veiled = false;
            // Surprisingly, doing focus before dispatching fadeIn doesn't work.
            // Also, username field focus doesn't *always* work before the
            // delay is done, hence the redundancy.  Sigh.
            $(selector).delay(1000).fadeIn(2500,
                                           do_conditional_focus_and_callback);
            do_conditional_focus(); }}

    function prep_credentials_form(content_selector, submit_handler, name_field,
                                   do_fade) {
        // XXX This needs to be significantly refactored, to be
        //     content-node (RootContentNode versus PublicRootShareNode)
        //     specific, with some share faculties.

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
        var page_id = $content.closest('[data-role="page"]').attr('id');

        var $password = $form.find('input[name=password]');
        var $name = $form.find('input[name=' + name_field + ']');

        var $submit = $form.find('[type="submit"]');
        var sentinel = new submit_button_sentinel([$name, $password], $submit)
        bind_replace($name, 'input.SpiderOak', sentinel);
        bind_replace($password, 'input.SpiderOak', sentinel);
        bind_replace($(document), 'pagebeforechange.SpiderOak',
                     function (e) {
                         if ($.mobile.activePage.attr('id') === page_id) {
                             $password.val(""); }});
        $submit.button()
        sentinel();

        var $remember_widget = $form.find('.remember');
        var remembering = remember_manager.active();
        if ($remember_widget.attr('id') === "remember-me") {
            if ((remembering || remembering === null)
                && ($remember_widget.val() !== "on")) {
                $remember_widget.val("on");
                // I believe why we need to also .change() is because the
                // presented slider is just tracking the actual select widget.
                $remember_widget.trigger('change'); }
            else if (!remember_manager.unset() && !remembering) {
                $remember_widget.val("off");
                $remember_widget.trigger('change'); }}
        else if ($remember_widget.attr('id') === "retain-visit") {
            var retaining = persistence_manager.get('retaining_visits');
            if ((retaining || (retaining === null))
                 && ($remember_widget.val() !== "on")) {
                $remember_widget.find('option[value="on"]').attr('selected',
                                                                 'selected');
                $remember_widget.val("on");
                $remember_widget.trigger('change'); }
            else if (!retaining && ($remember_widget.val() !== "off")) {
                $remember_widget.val("off");
                $remember_widget.trigger('change'); }}
        else {
            console.error("prep_credentials_form() - Unanticipated form"); }

        var name_field_val = pmgr.get(name_field);
        if (name_field_val
            && ($remember_widget.attr('id') === "remember-me")
            && ($remember_widget.val() === "on")) {
            $name.attr('value',name_field_val); }

        $form.submit(function () {
            $submit.button('disable');
            var $remember_widget = $form.find('.remember');
            var $name = $('input[name=' + name_field + ']', this);
            var $password = $('input[name=password]', this);
            var data = {};
            if (($name.val() === "") || ($password.val() === "")) {
                // Minimal - the submit button sentinel should prevent this.
                return false; }
            data[name_field] = $name.val();
            $name.val("");
            var remember_widget_on = $remember_widget.val() === "on"
            if ($remember_widget.attr('id') === "remember-me") {
                remember_manager.active(remember_widget_on); }
            else if ($remember_widget.attr('id') === "retain-visit") {
                persistence_manager.set('retaining_visits',
                                        remember_widget_on); }
            else {
                console.error("prep_credentials_form()"
                              + " - Unanticipated form"); }

            data['password'] = $password.val();
            if (do_fade) {
                var combo_root = node_manager.get_combo_root();
                combo_root.veil(true, function() { $password.val(""); });
                var unhide_form_oneshot = function(event, data) {
                    combo_root.veil(false);
                    $.mobile.loading('hide');
                    $(document).unbind("pagechange.SpiderOak",
                                       unhide_form_oneshot);
                    $(document).unbind("error.SpiderOak",
                                       unhide_form_oneshot); }
                bind_replace($(document), "pagechange.SpiderOak",
                             unhide_form_oneshot)
                bind_replace($(document), "error.SpiderOak",
                             unhide_form_oneshot); }
            else {
                $name.val("");
                $password.val(""); }
            $name.focus();
            submit_handler(data);
            return false; }); }

    function prep_html_branding() {
        /* Do brand substitutions in application HTML text. */
        $('.brand-title').text(brand.title);
        $('.brand-label').text(brand.label);
        $('.brand-service_support_link')
            .replaceWith(brand.service_support_link);
        $('.brand-service_home_link')
            .replaceWith(brand.service_home_link);
        }


    var spideroak_init = function () {
        /* Do preliminary setup and launch into the combo root. */

        if (window.location.hash) {
            // If we're initting with a hash fragment, discard the fragment
            // so we start from the root node:
            $.mobile.changePage(window.location.href.split('#')[0]); }

        // Setup traversal hook:
        establish_traversal_handler();

        my.combo_root_url = generic.combo_root_url;
        var combo_root = node_manager.get_combo_root();
        var recents = node_manager.get_recents();
        var public_shares = node_manager.get(my.public_shares_root_url,
                                             combo_root);

        // Do HTML code brand substitutions:
        prep_html_branding();

        // Properly furnish login form:
        prep_credentials_form('.nav-login-storage', storage_login,
                              'username', true);
        prep_credentials_form('.nav-visit-share',
                              public_shares.add_item_external.bind(
                                  public_shares),
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

        // ... and go, using the traversal hook:
        $.mobile.changePage(combo_root.url); }

    /* ==== Public interface ==== */

    // ("public_interface" because "public" is reserved in strict mode.)
    var public_interface = {
        init: function () {
            /* Do preliminary setup and launch into the combo root. */
            spideroak_init();
        },

    }


    /* ==== Boilerplate ==== */

    ContentNode.prototype.show_status_message = function (html, kind) {
        /* Inject 'html' into the page DOM as a status message. Optional
           'kind' is the status message kind - currently, 'result' and
           'error' have distinct color styles, the default is 'error'.
           Returns a produced $status_message object. */
        kind = kind || 'error';
        var selector = '.' + kind + '-status-message';

        var $page = this.my_page$();
        var $sm = $page.find(selector)
        if ($sm.length > 0) {
            $sm.html(html);
            $sm.listview(); }
        else {
            var $li = $('<li class="status-message crushed-vertical '
                        + kind + '-status-message">');
            $li.html(html);
            $sm = $('<ul data-role="listview" data-theme="c"/>');
            $sm.append($li);
            $page.find('[data-role="header"]').after($sm);
            $sm.listview();
            $sm.show(); }
        return $sm; }

    ContentNode.prototype.remove_status_message = function (kind) {
        /* Remove existing status message of specified 'kind' (default,
           all), if present. */
        var selector = (kind
                        ? '.' + kind + '-status-message'
                        : '.status-message');
        var $page = this.my_page$();
        var $sm = $page.find(selector);

        if ($sm.length !== 0) {
            $sm.remove(); }}

    ContentNode.prototype.toString = function () {
        return "<" + this.emblem + ": " + this.url + ">"; }


    function no_op () { console.log("no-op"); }

    var document_addrs = {
        /* Map specific document fragment addresses from the application
           document to internal functions/methods. */
        logout: storage_logout,
        noop: no_op,
    }

    function internalize_url(obj) {
        /* Return the "internal" version of the 'url'.

           - For non-string objects, returns the object
           - For fragments of the application code's url, returns the fragment
             (sans the '#'),
           - Translates page-ids for root content nodes to their urls,
           - Those last two, combined, transforms fragment references to root
             content pages to the urls of those pages.

           If none of the conditions holds, the original object is returned. */
        if (typeof obj !== "string") { return obj; }
        if (obj.split('#')[0] === window.location.href.split('#')[0]) {
            obj = obj.split('#')[1]; }
        switch (obj) {
        case (generic.combo_root_page_id):
            return generic.combo_root_url;
        case (generic.recents_page_id):
            return generic.recents_url;
        case (generic.storage_root_page_id):
            return my.storage_root_url;
        case (generic.original_shares_root_page_id):
            return my.original_shares_root_url;
        case (generic.public_shares_root_page_id):
            return my.public_shares_root_url;
        default: return obj; }}

    function content_nodes_by_url_sorter(prev, next) {
        var prev_str = prev, next_str = next;
        var prev_name = node_manager.get(prev).name;
        var next_name = node_manager.get(next).name;
        if (prev_name && next_name) {
            prev_str = prev_name, next_str = next_name; }
        if (prev_str < next_str) { return -1; }
        else if (prev_str > next_str) { return 1; }
        else { return 0; }}

    function is_compact_mode() {
        return $(document).height() < generic.compact_threshold; }

    if (SO_DEBUGGING) {
        // Expose the managers for access while debugging:
        public_interface.nmgr = nmgr;
        public_interface.pmgr = pmgr; }

    /* ==== Here we go: ==== */
    return public_interface;
}();

// Report that the app is ready:
so_init_manager.ready('app');
