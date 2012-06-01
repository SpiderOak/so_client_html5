/* SpiderOak html5 client Main app.

 * Works with:
 * - jquery.mobile-1.0.1.css
 * - jquery-1.6.4.js
 * - jquery.mobile-1.0.1.js
 * - js_aux/misc.js - b32encode_trim(), blather(), fragment_quote(),
 *                    error_alert()
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
    URLs it receives that reside within the ones on my.content_root_urls,
    to which the root URLs are registered by the root visiting routines.

  - My routines which return jQuery objects end in '$', and - following common
    practice - my variables intended to contain jQuery objects start with '$'.
*/

SO_DEBUGGING = true;            // for misc.js:blather()

$(document).ready(function () {
    spideroak.init();
    // Darn page loading message hiding happens too soon on login, inihibit:
    $.ajaxSetup({complete: null});
    $('#my_login_username').focus();
    var $content = $('.nav_login_storage');
    spideroak.prep_login_form('.nav_login_storage', spideroak.storage_login,
                              'username');
    spideroak.prep_login_form('.nav_login_share', spideroak.visit_share_room,
                              'shareid');

    // Development convenience: On full document reload, all application
    // state (besides cookies) is gone - resume from top-level entry point:
    if (window.location.hash) {
        window.location.hash = "";
        $.mobile.changePage(window.location.href.split('#')[0]);
        window.location.reload(); }
});

/* Modular singleton pattern: */
var spideroak = function () {
                              /* private: */

    /* Object-wide settings: */

    var defaults = {
        /* Settings not specific to a particular login session: */
        // API v1.
        // XXX starting_host_url may vary according to brand package.
        starting_host_url: "https://spideroak.com",
        share_host_url: "https://spideroak.com",
        storage_login_path: "/browse/login",
        storage_path_prefix: "/storage/",
        share_path_prefix: "/share/",
        content_page_template_id: "content-page-template",
        devices_query_expression: 'device_info=yes',
        versions_query_expression: 'format=version_info',
        home_page_id: 'home',
        root_storage_node_label: "Devices",
        preview_sizes: [25, 48, 228, 800],
        dividers_threshold: 10,
        filter_threshold: 20,
    }
    var my = {
        /* Login session settings: */
        starting_host_url: null,
        username: null,
        storage_web_url: null,  // Location of storage web UI for user.
        // content_roots_urls are for discerning URLs of contained items.
        // They're accumulated on access to storage repo root and share rooms.
        content_root_urls: {},
        storage_root_url: "",
        share_rooms_root_url: "",
        share_rooms_urls: {},
    }

    /* Navigation handlers: */

    function handle_content_visit(e, data) {
        /* Intercept URL visits and intervene for repository content. */
        if ((typeof data.toPage === "string")
            && is_content_url(data.toPage)) {
            e.preventDefault();
            var node_opts = query_params(data.toPage);
            content_node_manager.get(data.toPage).visit(data.options,
                                                        node_opts); }}
    function bind_traversal_handler() {
        /* Establish page change event handler. */
        // Gets registered on: $(document).data('events').pagebeforechange
        $(document).bind("pagebeforechange.SpiderOak", handle_content_visit);
    }

    /* Register navigation roots: */
    function set_storage_account(username, host, storage_web_url) {
        /* Register user-specific storage details, returning storage root URL.
             'username': the account name
             'host': the server for the account
             'storage_path_prefix': the leading part of the storage path
             'storage_web_url': the account's web UI entry address.
        */
        my.username = username;
        my.storage_host = host;
        var url = register_storage_root_url(host + defaults.storage_path_prefix
                                            + b32encode_trim(username) + "/");
        if (! is_content_root_url(url)) {
            register_content_root_url(url); }
        my.storage_web_url = storage_web_url;
        return url; }
    function add_share_room(shareid, password, host) {
        /* Register a share room in the share root, returning its URL.
             'username': the account name
             'host': the server for the account
             'storage_path_prefix': the leading part of the storage path
        */

        if (! my.share_rooms_root_url) {
            // Establish the share rooms root.
            register_share_rooms_root_url(host + defaults.share_path_prefix); }

        var root = content_node_manager.get(my.share_rooms_root_url);
        var url = (root.url + b32encode_trim(shareid) + "/" + password + "/");
        register_share_room_url(url);
        content_node_manager.get(url, root);
        return url;
    }

    /* Node-independent URL identification - used for node assignment: */

    // Managed content is organized within two content roots:
    //
    // - the storage root, my.storage_root_url, determined by the user's account
    // - the share root, which is the same across all accounts
    //
    // Content urls are recognized by virtue of beginning with one of the
    // registered content roots. The storage root is registered when the user
    // logs in. The share rooms root is registered upon the registration of
    // any share room.

    function register_storage_root_url(url) {
        /* Identify url as the storage root.  Returns the url. */
        return my.storage_root_url = url; }
    function register_share_rooms_root_url(url) {
        /* Identify url as the share rooms root.  Returns the url. */
        return my.share_rooms_root_url = url; }
    function register_share_room_url(url) {
        /* Include url among the registered content roots.  Returns the url. */
        my.share_rooms_urls[url] = true;
        return url; }
    function is_content_root_url(url) {
        /* True if the 'url' is for one of the root content items.
           Doesn't depend on the url having an established node. */
        return ((url === my.storage_root_url)
                || (url === my.share_rooms_root_url)); }
    function is_share_room_url(url) {
        /* True if the 'url' is for one of the share rooms.
           Doesn't depend on the url having an established node. */
        return url in my.share_rooms_urls; }
    function is_storage_url(url) {
        /* True if the URL is for a content item in the user's storage area.
           Doesn't depend on the url having an established node. */
        return (my.storage_root_url
                && (url.slice(0, my.storage_root_url.length)
                    === my.storage_root_url)); }
    function is_share_url(url) {
        /* True if the URL is for a content item in the user's storage area.
           Doesn't depend on the url having an established node. */
        return (my.share_rooms_root_url
                && (url.slice(0, my.share_rooms_root_url.length)
                    === my.share_rooms_root_url)); }
    function is_content_url(url) {
        /* True if url within registered content roots. */
        return is_storage_url(url) || is_share_url(url); }

    /* Content representation: */

    /* Various content node types - the roots, devices, folders, and files
       - are implemented based on a generic ContentNode object.  Departures
       from the basic functionality are implemented as distinct prototype
       functions, defined immediately after the generic ones.
    */

    function ContentNode(url, parent) {
        /* Constructor for items representing stored content.
           - 'url' is absolute URL for the collection's root (top) node.
           - 'parent' is containing node. The root's parent is null.
           See JSON data examples towards the bottom of this script.
        */
        if ( !(this instanceof ContentNode) ) // Coding failsafe.
            throw new Error("Constructor called as a function");
        if (url) {             // Skip if we're in prototype assignment.
            this.url = url;
            this.root_url = parent ? parent.root_url : url;
            this.query_qualifier = "";
            this.parent_url = parent ? parent.url : null;
            this.is_container = true; // Typically.
            this.subdirs = [];  // Urls of contained devices, directories.
            this.files = [];    // Urls of contained files.
            // ??? Store DOM elements if jQuery objects are expensive.
            this.$page;         // jQuery-contained DOM page for this node.
            this.lastfetched = false;
            this.emblem;        // At least for debugging/.toString()
            this.icon_path;
        }}

    function StorageNode(url, parent) {
        ContentNode.call(this, url, parent);
        // All but the root storage nodes are contained within a device.
        // The DeviceStorageNode sets the device url, which will trickle
        // down to all its contents.
        this.device_url = parent ? parent.device_url : null; }
    StorageNode.prototype = new ContentNode();
    function ShareRoomNode(url, parent) {
        ContentNode.call(this, url, parent);
        if (! parent) {
            // This is the share room root.
            this.root_url = url;
            this.room_url = null; }
        else {
            this.root_url = parent.root_url;
            this.room_url = parent.room_url; }}
    ShareRoomNode.prototype = new ContentNode();

    function FolderContentNode(url, parent) {
        /* Stub, for situating intermediary methods. */ }
    function FileContentNode(url, parent) {
        /* Stub, for situating intermediary methods. */ }

    function RootStorageNode(url, parent) {
        StorageNode.call(this, url, parent);
        this.query_qualifier = "?" + defaults.devices_query_expression;
        this.emblem = "Root Storage";
        this.stats = null;
        delete this.files; }
    RootStorageNode.prototype = new StorageNode();
    function RootShareRoomNode(url, parent) {
        this.emblem = "Root Share Room";
        ShareRoomNode.call(this, url, parent); }
    RootShareRoomNode.prototype = new ShareRoomNode();

    function DeviceStorageNode(url, parent) {
        StorageNode.call(this, url, parent);
        this.emblem = "Storage Device";
        this.device_url = url; }
    DeviceStorageNode.prototype = new StorageNode();
    function RoomShareRoomNode(url, parent) {
        ShareRoomNode.call(this, url, parent);
        this.emblem = "Share Room";
        this.room_url = url; }
    RoomShareRoomNode.prototype = new ShareRoomNode();

    function FolderStorageNode(url, parent) {
        this.emblem = "Storage Folder";
        StorageNode.call(this, url, parent); }
    FolderStorageNode.prototype = new StorageNode();
    function FolderShareRoomNode(url, parent) {
        this.emblem = "Share Room Folder";
        ShareRoomNode.call(this, url, parent); }
    FolderShareRoomNode.prototype = new ShareRoomNode();

    function FileStorageNode(url, parent) {
        this.emblem = "Storage File";
        StorageNode.call(this, url, parent);
        this.is_container = false;
        delete this.subdirs;
        delete this.files; }
    FileStorageNode.prototype = new StorageNode();
    function FileShareRoomNode(url, parent) {
        this.emblem = "Share Room File";
        ShareRoomNode.call(this, url, parent);
        this.is_container = false;
        delete this.subdirs;
        delete this.files; }
    FileShareRoomNode.prototype = new ShareRoomNode();

    ContentNode.prototype.is_root = function () {
        /* True if the node is a collections top-level item. */
        return (this.url === this.root_url);
    }

    /* Remote data access: */

    ContentNode.prototype.visit = function (chngpg_opts, node_opts) {
        /* Get up-to-date with remote copy and show.
           Options is the $.mobile.changePage() options object. */
        if (! this.up_to_date()) {
            // We use 'this_node' because 'this' gets overridden when
            // success_handler is actually running, so we need a distinct
            // lexically scoped var.
            var this_node = this;
            this.fetch_and_dispatch(function (data, when)
                                    { this_node.provision(data, when,
                                                          node_opts);
                                      this_node.layout(node_opts);
                                      this_node.show(chngpg_opts, node_opts); },
                                    function (xhr)
                                    { this_node.handle_failed_visit(xhr); })
        } else {
            this.show(options, node_opts);
        }
    }
    ContentNode.prototype.handle_failed_visit = function (xhr) {
        /* Do error handling failed visit with 'xhr' XMLHttpResponse report. */
        // TODO: Proper error handling.
        $.mobile.hidePageLoadingMsg();
        if (xhr.status === 401) {
            // Probably expired cookies - return to the entry page:
            $.mobile.changePage(window.location.href.split('#')[0]); }
        else { error_alert("Failure reaching " + this.url, xhr.status); }
    }
    ContentNode.prototype.provision = function (data, when, node_opts) {
        /* Populate node with JSON 'data'. 'when' is the data's current-ness.
           'when' should be no more recent than the XMLHttpRequest.
        */
        this.provision_preliminaries(data, when, node_opts);
        this.provision_populate(data, when, node_opts);
    }
    ContentNode.prototype.provision_preliminaries = function (data, when,
                                                              node_opts) {
        /* Do provisioning stuff generally useful for derived types. */
        if (! when) {
            throw new Error("Node provisioning without reliable time stamp.");
        }
        this.up_to_date(when);
    }
    ContentNode.prototype.provision_populate = function (data, when,
                                                         node_opts) {
        /* Stub, must be overridden by type-specific provisionings. */
        error_alert("Not yet implemented",
                    this.emblem + " type-specific provisioning implementation")
    }
    RootStorageNode.prototype.provision_populate = function (data, when,
                                                             node_opts) {
        /* Embody the root storage node with 'data'.
           'when' is time soon before data was fetched. */
        var mgr = content_node_manager;
        var url, dev, devdata;
        this.name = my.username;
        mgr.stats = data["stats"]; // TODO: We'll cook stats when UI is ready.
        this.subdirs = [];
        for (var i in data.devices) {
            devdata = data.devices[i];
            url = my.storage_root_url + devdata["encoded"]
            dev = mgr.get(url, this)
            dev.name = devdata["name"];
            dev.lastlogin = devdata["lastlogin"];
            dev.lastcommit = devdata["lastcommit"];
            if (! ($.inArray(url, this.subdirs) >= 0)) {
                this.subdirs.push(url);
            }
        }
        this.lastfetched = when;
    }
    FolderContentNode.prototype.provision_populate = function (data, when) {
        /* Embody folder content items with 'data'.
           'when' is time soon before data was fetched. */
        var mgr = content_node_manager;
        var url, dir, dirdata, file, filedata;
        this.subdirs = [];
        for (var i in data.dirs) {
            dirdata = data.dirs[i];
            url = this.url + dirdata[1];
            // Get a node for the subdir:
            dir = mgr.get(url, this)
            dir.name = dirdata[0];
            // Include, if not already present:
            if (! ($.inArray(url, this.subdirs) >= 0)) {
                this.subdirs.push(url); }}
        this.files = [];
        for (var i in data.files) {
            filedata = data.files[i];
            url = this.url + filedata['url'];
            // Get a node for the file:
            file = mgr.get(url, this);
            var fields = ['name', 'size', 'ctime', 'mtime', 'versions'];
            for (var nmi in fields) {
                var name = fields[nmi];
                if (name in filedata) { file[name] = filedata[name]; }}
            for (var szi in defaults.preview_sizes) {
                var sz = "preview_" + defaults.preview_sizes[szi];
                if (sz in filedata) {
                    file[sz] = filedata[sz]; }}
            // Include, if not already present:
            if (! ($.inArray(url, this.files) >= 0)) {
                this.files.push(url); }}
        this.lastfetched = when;
    }
    RootShareRoomNode.prototype.provision_populate = function (data, when) {
        /* Embody the root share room with 'data'.
           'when' is time soon before data was fetched. */
        var mgr = content_node_manager;
        var url, dev, devdata;
        this.name = data.stats.room_name;
        this.description = data.stats.description;
        this.number_of_files = data.stats.number_of_files;
        this.number_of_folders = data.stats.number_of_folders;
        this.firstname = data.stats.firstname;
        this.lastname = data.stats.lastname;
        this.lastfetched = when;
        FolderContentNode.prototype.provision_populate.call(this, data, when);
    }
    DeviceStorageNode.prototype.provision_populate = function (data, when) {
        /* Embody storage folder items with 'data'.
           'when' is time soon before data was fetched. */
        FolderStorageNode.prototype.provision_populate.call(this, data, when); }
    RoomShareRoomNode.prototype.provision_populate = function (data, when) {
        /* Embody storage folder items with 'data'.
           'when' is time soon before data was fetched. */
        FolderShareRoomNode.prototype.provision_populate.call(this, data,
                                                              when); }
    FolderStorageNode.prototype.provision_populate = function (data, when) {
        /* Embody storage folder items with 'data'.
           'when' is time soon before data was fetched. */
        FolderContentNode.prototype.provision_populate.call(this, data, when); }
    FolderShareRoomNode.prototype.provision_populate = function (data, when){
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
        return false;           // No smarts.
    }

    ContentNode.prototype.fetch_and_dispatch = function (success_callback,
                                                         failure_callback) {
        /* Retrieve this node's data and conduct specified actions accordingly.
           - On success, 'success_callback' gets retrieved data and Date() just
             prior to the retrieval.
           - Otherwise, 'failure_callback' invoked with XMLHttpResponse object.
        */

        var when = new Date();
        var url = this.url + this.query_qualifier;
        var node_opts = query_params(url);
        var cache = node_opts["refresh"] === "true";
        $.ajax({url: url,
                type: 'GET',
                dataType: 'json',
                cache: cache,
                success: function (data) {
                    success_callback(data, when);
                },
                error: function (xhr) {
                    failure_callback(xhr)
                },
               })
    };

    /* Content node page presentation */

    ContentNode.prototype.my_page_id = function () {
        /* Set the UI page id, escaping special characters as necessary. */
        return this.url; }
    ContentNode.prototype.show = function (chngpg_opts, node_opts) {
        /* Trigger UI focus on our content layout. */
        // We use whatever layout is already done.
        var $page = this.my_page$();
        if ($.mobile.activePage[0].id !== this.my_page_id()) {
            $.mobile.changePage($page, chngpg_opts); }
        else if (("refresh" in node_opts) && (node_opts.refresh == "true")) {
            $.mobile.hidePageLoadingMsg(); }}

    ContentNode.prototype.layout = function (settings) {
        /* Deploy content as markup on our page. */
        this.my_page$();
        this.layout_header(settings);
        this.layout_content(settings);
        this.layout_footer(settings);
    }

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

        if ('title' in fields) {
            $header.find('.header-title').html(fields.title); }

        if ('right_url' in fields) {
            var $right_slot = $header.find('.header-right-slot');
            $right_slot.attr('href', fields.right_url);
            if ('right_label' in fields) {
                if (! fields.right_label) {
                    $right_slot.hide(); }
                else {
                    replace_button_text($right_slot, fields.right_label);
                    $right_slot.show(); }}}

        if ('left_url' in fields) {
            var $left_slot = $header.find('.header-left-slot');
            if (fields.left_url === "-") {
                var parsed = $.mobile.path.parseUrl(window.location.href);
                fields.left_url = parsed.hrefNoHash; }
            $left_slot.attr('href', fields.left_url);
            if ('left_label' in fields) {
                if (! fields.left_label) {
                    $left_slot.hide(); }
                else {
                    replace_button_text($left_slot, fields.left_label);
                    $left_slot.show(); }}}}

    StorageNode.prototype.layout_header = function(settings) {
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
            fields.left_label = (container.is_root()
                                 ? "Storage Devices" : container.name) };
        this.layout_header_fields(fields); }
    RootStorageNode.prototype.layout_header = function(settings) {
        /* Fill in typical values for header fields of .my_page$(). */
        StorageNode.prototype.layout_header.call(this, settings);
        this.layout_header_fields({'title': "Storage Devices",
                                   'left_label': "Login", 'left_url': "-"}); }

    ShareRoomNode.prototype.layout_header = function(settings) {
        /* Fill in header fields of .my_page$(). */
        var fields = {};
        if (this.parent_url) {
            var container = content_node_manager.get(this.parent_url);
            fields.right_url = '#' + add_query_param(this.url,"refresh","true");
            fields.right_label = "Refresh"
            fields.left_url = '#' + this.parent_url;
            fields.left_label = (container.is_root()
                                 ? "ShareRoom" : container.name);
            fields.title = this.name; }
        else {
            fields.right_url = '#' + add_query_param(this.url, "mode", "edit");
            fields.right_label = "Edit";
            fields.left_url = '#' + add_query_param(this.url, 'mode', "add");
            fields.left_label = "+";
            fields.title = "ShareRooms"; }
        this.layout_header_fields(fields); }

    RootShareRoomNode.prototype.layout_header = function(settings) {
        /* Fill in header fields of .my_page$(). */
        ShareRoomNode.prototype.layout_header.call(this, settings);
        var fields = {'right_url': '#' + add_query_param(this.url,
                                                         "mode", "edit"),
                      'right_label': "Edit"};
        this.layout_header_fields(fields); }

    ContentNode.prototype.layout_content = function (settings) {
        /* Present this content node by adjusting its DOM data-role="page" */
        var $page = this.my_page$();
	var $content = $page.find('[data-role="content"]');
	var $list = $content.find('[data-role="listview"]');
        if ($list.children().length) {
            $list.empty(); }

        var lensubdirs = this.subdirs ? this.subdirs.length : 0;
        var lenfiles = this.files ? this.files.length : 0;
        var do_dividers = (lensubdirs + lenfiles) > defaults.dividers_threshold;
        var do_filter = (lensubdirs + lenfiles) > defaults.filter_threshold;

        if (lensubdirs + lenfiles === 0) {
            // XXX Need to convey that the container is empty more nicely.
            $content.after('<p class="empty-sign" data-role="empty-sign">'
                           + 'Empty. </p>'); }
        else {
            var $item;
            var curinitial, divider_prefix, indicator = "";
            var $cursor = $list;

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
                insert_item(subnode.layout_item$(settings)); }

            if (do_filter) { $list.attr('data-filter', 'true'); }
            if (lensubdirs) {
                divider_prefix = "/";
                for (var i in this.subdirs) {
                    insert_subnode(this.subdirs[i]); }}
            if (lenfiles) {
                divider_prefix = "";
                for (var i in this.files) {
                    insert_subnode(this.files[i]); }}
        }
        // NOTE As of jQm 1.1.0, .listview("refresh") isn't properly rounding
        //      list item corners, but our list items aren't inset, so it's ok.
        $page.page();
        $list.listview("refresh");
        return $page;
    }
    FolderContentNode.prototype.layout_item$ = function(settings) {
        /* Return a folder-like content item's description as jQuery item. */
        var $href = $('<a/>').attr('class', "compact-vertical");
        $href.attr('href', "#" + this.url);
        $href.html($('<h4/>').html(this.name));
        var $it = $('<li/>').append($href);
        $it.attr('data-filtertext', this.name);
        return $it; }
    DeviceStorageNode.prototype.layout_item$ = function(settings) {
        /* Return a storage device's description as a jQuery item. */
        return FolderStorageNode.prototype.layout_item$.call(this); }
    FolderStorageNode.prototype.layout_item$ = function(settings) {
        /* Return a storage folder's description as a jQuery item. */
        return FolderContentNode.prototype.layout_item$.call(this, settings); }
    FolderShareRoomNode.prototype.layout_item$ = function(settings) {
        /* Return a share room folder's description as a jQuery item. */
        return FolderContentNode.prototype.layout_item$.call(this, settings); }
    RoomShareRoomNode.prototype.layout_item$ = function(settings) {
        /* Return a share room's description as a jQuery item. */
        return FolderShareRoomNode.prototype.layout_item$.call(this,
                                                               settings); }
    FileContentNode.prototype.layout_item$ = function(settings) {
        /* Return a file-like content node's description as a jQuery item. */
        var $it = $('<li data-mini="true"/>');
        $it.attr('data-filtertext', this.name);

        var type = classify_file_by_name(this.name);
        var pretty_type = type ? (type + ", ") : "";
        var $details = $('<p>' + pretty_type + bytesToSize(this.size) +'</p>');

        var date = new Date(this.mtime*1000);
        var day_splat = date.toLocaleDateString().split(",");
        $date = $('<p class="ul-li-aside">'
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

    FileStorageNode.prototype.layout_item$ = function(settings) {
        /* Return a storage file's description as a jQuery item. */
        return FileContentNode.prototype.layout_item$.call(this, settings); }
    FileShareRoomNode.prototype.layout_item$ = function(settings) {
        /* Return a storage file's description as a jQuery item. */
        return FileContentNode.prototype.layout_item$.call(this, settings); }

    ContentNode.prototype.layout_footer = function(settings) {
        /* Return markup with general and specific legend fields and urls. */
    }

    ContentNode.prototype.is_device = function() {
        return false; }
    DeviceStorageNode.prototype.is_device = function() {
        return true; }
    ContentNode.prototype.my_page_from_dom$ = function () {
        /* Find my page in the DOM, if it's there. */
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
    ContentNode.prototype.get_storage_page_template$ = function() {
        return $("#" + defaults.content_page_template_id); }

    /* Convenience: */
    ContentNode.prototype.toString = function () {
        return "<" + this.emblem + ": " + this.url + ">";
    }

    /* Content node collection management: */

    var content_node_manager = function () {
        /* A singleton utility for getting and removing content node objects.
           "Getting" means finding existing ones or else allocating new ones.
        */
        // Type of newly minted nodes are according to get parameters.

        // TODO: Cleanup? Remove nodes when ascending above them?
        // TODO Probably:
        // - prefetch offspring layer and defer release til 2 layers above.
        // - make fetch of multiple items contingent to device lastcommit time.

        /* Private */
        var by_url = {};

        /* Public */
        return {
            get: function (url, parent) {
                /* Retrieve a node according to 'url'.
                   'parent' is required for production of new nodes,
                   which are produced on first reference.
                   Provisioning nodes with remote data is done elsewhere,
                   not here.
                 */
                url = url.split('?')[0];             // ... sans query string.
                got = by_url[url];
                if (! got) {
                    if (is_content_root_url(url)) {
                        if (is_storage_url(url)) {
                            got = new RootStorageNode(url, parent); }
                        else { got = new RootShareRoomNode(url, parent); }}
                    else if (parent && (parent.url === my.storage_root_url)) {
                        got = new DeviceStorageNode(url, parent); }
                    else if (is_share_room_url(url)) {
                        got = new RoomShareRoomNode(url, parent); }
                    else if (url.charAt(url.length-1) !== "/") {
                        // No trailing slash.
                        if (is_storage_url(url)) {
                            got = new FileStorageNode(url, parent); }
                        else {
                            got = new FileShareRoomNode(url, parent); }}
                    else {
                        if (is_storage_url(url)) {
                            got = new FolderStorageNode(url, parent); }
                        else {
                            got = new FolderShareRoomNode(url, parent); }
                    }
                    by_url[url] = got;
                }
                return got;
            },
            delete: function (node) {
                /* Remove a content node object, eliminating references
                   that could be circular and prevent GC. */
                delete by_url[node.url];
                delete node;
            },
            // Expose the by_url registry when debugging:
            bu: (SO_DEBUGGING ? by_url : null),
        }
    }()

    /* public: */
    return {
        init: function () {
            /* Do preliminary setup - event handlers, etc. */
            bind_traversal_handler();
        },
        toString: function () {
            var user = (my.username ? my.username : "-");
            var fetched = (Object.keys(content_node_manager).length || "-");
            return ("SpiderOak instance for "
                    + user + ", " + fetched + " items fetched");
        },

        /* Login and account/identity. */

        prep_login_form: function (content_selector,
                                   submit_handler, name_field) {
            /* Instrument form within 'content_selector' to submit with
               'submit_handler'. 'name_field' is the id of the form field
               with the login name, "password" is assumed to be the
               password field id.

               The submit action fades the content and clears the password
               value, so it can't be reused.
            */
            var $content = $(content_selector);
            var $form = $(content_selector + " form");
            $form.submit(function () {
                var $password = $('input[name=password]', this);
                var $name = $('input[name=' + name_field + ']', this);
                var data = {};
                data[name_field] = $name.val();
                data['password'] = $password.val();
                $content.fadeOut(1000, function() { $password.val("");});
                var unhide_form_oneshot = function(event, data) {
                    $content.show('fast');
                    $.mobile.hidePageLoadingMsg();
                    $(document).unbind("pagechange", unhide_form_oneshot);
                    $(document).unbind("error", unhide_form_oneshot); }
                $(document).bind("pagechange", unhide_form_oneshot)
                $(document).bind("error", unhide_form_oneshot)
                submit_handler(data);
                return false;
            })
        },

        visit_share_room: function (credentials) {
            /* Visit a specified share room.
               'credentials': Object including "shareid" and "password" attrs.
            */
            $.mobile.changePage(
                add_share_room(credentials.shareid, credentials.password,
                               defaults.share_host_url));
        },
        storage_login: function (login_info, url) {
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
                && $.inArray(parsed.protocol, ["http:", "https:"])) {
                server_host_url = parsed.domain;
                login_url = url;
            } else {
                server_host_url = defaults.starting_host_url;
                login_url = (server_host_url + defaults.storage_login_path);
            }
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
                        spideroak.storage_login(login_info, login_url);
                    } else {
                        // Browser haz auth cookies, we haz relative location.
                        // Go there, and machinery will intervene to handle it.
                        $.mobile.changePage(
                            set_storage_account(login_info['username'],
                                                server_host_url,
                                                match[2]));
                    }
                },
                error: function (xhr) {
                    $.mobile.hidePageLoadingMsg();
                    error_alert("Storage login", xhr.status);
                },
            });
        },
        // Expose the content node manager for debugging:
        cnm: (SO_DEBUGGING ? content_node_manager : null),
    }
}();
