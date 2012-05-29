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
    spideroak.prep_login_form('.nav_login_share', spideroak.share_root_visit,
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
        storage_page_template_id: "storage-page-template",
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
        content_root_urls: [],
        storage_root_url: "",
        share_root_urls: [],
    }

    /* Navigation handlers: */

    function handle_content_visit(e, data) {
        /* Intercept URL visits and intervene for repository content. */
        if (typeof data.toPage === "string" && is_content_url(data.toPage)) {
            e.preventDefault();
            content_node_manager.get(data.toPage).visit(data.options); }}
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
        var url = my.storage_root_url = (host + defaults.storage_path_prefix
                                         + b32encode_trim(username) + "/");
        if (! is_content_root_url(url)) {
            my.content_root_urls.push(url); }
        my.storage_web_url = storage_web_url;
        return my.storage_root_url; }
    function add_share_root(shareid, password, host) {
        /* Register a share room root, returning the share's root URL.
             'username': the account name
             'host': the server for the account
             'storage_path_prefix': the leading part of the storage path
        */
        var url = (host + defaults.share_path_prefix + b32encode_trim(shareid)
                   + "/" + password + "/");
        if (! is_content_root_url(url)) {
            my.share_root_urls.push(url);
            my.content_root_urls.push(url); }
        return url;
    }

    /* Node-independent URL classification: */
    function is_content_root_url(url) {
        /* True if the 'url' is for one of the root content items.
           Doesn't depend on an already established node for the url. */
        return ($.inArray(url, my.content_root_urls) >= 0); }
    function is_storage_url(url) {
        /* True if the URL is for a content item in the user's storage area.
           Doesn't depend on an already established node for the url. */
        return (my.storage_root_url.length
                && (url.slice(0, my.storage_root_url.length)
                    === my.storage_root_url)); }
    function is_share_root_url(url) {
        /* True if the 'url' is for one of the root share rooms.
           Doesn't depend on an already established node for the url. */
        return ($.inArray(url, my.share_root_urls) >= 0); }
    function is_share_url(url) {
        /* True if the URL is for a content item in the user's storage area.
           Doesn't depend on an already established node for the url. */
        return (is_content_url(url) && ! is_storage_url(url)); }
    function is_content_url(url) {
        /* True if url within established content roots. */
        for (var i in my.content_root_urls) {
            var prospect = my.content_root_urls[i];
            if (url.slice(0, prospect.length) === prospect) { return true; }}
        return false; }

    /* UI Controls */
    function unhide_login_forms(delay, fade) {
        /* Remove login form fadeout, after 'delay' msecs then 'fade' msecs. */
        $.ajaxSetup({complete: function() { $.mobile.hidePageLoadingMsg(); }});
        $('.login-form').each(function () {
            $(this).delay(delay).fadeIn(fade); }) }

    /* Content representation: */

    /* Various content node types - the roots, devices, directories, and
       files - are implemented based on a generic ContentNode object.
       Departures from the basic functionality are implemented as distinct
       prototype functions, defined immediately after the generic ones.
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
            // XXX ??? Store DOM elements if jQuery objects are expensive.
            this.$page;         // jQuery-contained DOM page for this node.
            this.lastfetched = false;
            this.emblem;        // TODO: Eventually, an icon, for now text.
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
            // This is a share room, which is the root of the collection.
            this.root_url = url; }
        else {
            this.root_url = parent.root_url; }}
    ShareRoomNode.prototype = new ContentNode();

    function DirectoryContentNode(url, parent) {
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

    function DirectoryStorageNode(url, parent) {
        this.emblem = "Storgae Directory";
        StorageNode.call(this, url, parent); }
    DirectoryStorageNode.prototype = new StorageNode();
    function DirectoryShareRoomNode(url, parent) {
        this.emblem = "Share Room Directory";
        ShareRoomNode.call(this, url, parent); }
    DirectoryShareRoomNode.prototype = new ShareRoomNode();

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

    ContentNode.prototype.visit = function (options) {
        /* Get up-to-date with remote copy and show.
           Options is the $.mobile.changePage() options object. */
        if (! this.up_to_date()) {
            // We use 'this_node' because 'this' gets overridden when
            // success_handler is actually running, so we need a distinct
            // lexically scoped var.
            var this_node = this;
            this.fetch_and_dispatch(function (data, when)
                                    { this_node.provision(data, when);
                                      this_node.layout();
                                      this_node.show(options); },
                                    function (xhr)
                                    { this_node.handle_failed_visit(xhr); })
        } else {
            this.show(options);
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
    ContentNode.prototype.provision = function (data, when) {
        /* Populate node with JSON 'data'. 'when' is the data's current-ness.
           'when' should be no more recent than the XMLHttpRequest.
        */
        this.provision_preliminaries(data, when);
        this.provision_populate(data, when);
    }
    ContentNode.prototype.provision_preliminaries = function (data, when) {
        /* Do provisioning stuff generally useful for derived types. */
        if (! when) {
            throw new Error("Node provisioning without reliable time stamp.");
        }
        this.up_to_date(when);
    }
    ContentNode.prototype.provision_populate = function (data, when) {
        /* Stub, must be overridden by type-specific provisionings. */
        error_alert("Not yet implemented",
                   "Type-specific provisioning implementation missing.")
    }
    RootStorageNode.prototype.provision_populate = function (data, when) {
        /* Embody the root content item with 'data'.
           'when' is time soon before data was fetched. */
        var mgr = content_node_manager;
        var url, dev, devdata;
        var possessive = (my.username.charAt(my.username.length-1) == "s"
                          ? "' " : "'s ")
        this.name = my.username;
        mgr.stats = data["stats"]; // TODO: We'll cook stats when UI is ready.
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
    DeviceStorageNode.prototype.provision_populate = function (data, when) {
        /* Embody directory content items with 'data'.
           'when' is time soon before data was fetched. */
        return DirectoryStorageNode.prototype.provision_populate.call(this,
                                                                      data,
                                                                      when); }
    DirectoryStorageNode.prototype.provision_populate = function (data, when) {
        /* Embody directory content items with 'data'.
           'when' is time soon before data was fetched. */
        var mgr = content_node_manager;
        var url, dir, dirdata, file, filedata;
        for (var i in data.dirs) {
            dirdata = data.dirs[i];
            url = this.url + dirdata[1];
            // Get a node for the subdir:
            dir = mgr.get(url, this)
            dir.name = dirdata[0];
            // Include, if not already present:
            if (! ($.inArray(url, this.subdirs) >= 0)) {
                this.subdirs.push(url); }}
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
        DirectoryStorageNode.prototype
                            .provision_populate.call(this, data, when);
    }
    DeviceStorageNode.prototype.provision_populate = function (data, when) {
        /* Embody storage directory items with 'data'.
           'when' is time soon before data was fetched. */
        DirectoryStorageNode.prototype
                            .provision_populate.call(this, data, when); }
    DirectoryStorageNode.prototype.provision_populate = function (data, when) {
        /* Embody storage directory items with 'data'.
           'when' is time soon before data was fetched. */
        DirectoryContentNode.prototype
                            .provision_populate.call(this, data, when); }
    DirectoryShareRoomNode.prototype.provision_populate = function (data, when){
        /* Embody share room directory items with 'data'.
           'when' is time soon before data was fetched. */
        DirectoryContentNode.prototype
                            .provision_populate.call(this, data, when); }
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
        $.ajax({url: this.url + this.query_qualifier,
                type: 'GET',
                dataType: 'json',
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
    ContentNode.prototype.show = function (options) {
        /* Trigger UI focus on our content layout. */
        // We use whatever layout is already done.
        var $page = this.my_page$();
        if ($.mobile.activePage[0].id !== this.my_page_id()) {
            options.dataUrl = '#' + this.my_page_id();
            $.mobile.changePage($page, options); } }

    ContentNode.prototype.layout = function (settings) {
        /* Deploy content as markup on our page. */
        // XXX We always clone a fresh copy, since some elements are getting
        //     mangled on reuse.  Specifically: proper formatting of the header
        //     back button; when lists are not inset, the corners don't round.
        this.my_page$(true);
        this.layout_header(settings);
        this.layout_content(settings);
        this.layout_footer(settings); }

    ContentNode.prototype.layout_header = function(settings) {
        /* Return markup with general and specific legend fields and urls. */
        var containment = this.containment_path();
        var container_url = this.parent_url;
        var container;
        var $page = this.my_page$();
        var $header = $page.find('[data-role="header"]');
        var $title = $header.find('.header-title');
        var $left_slot = $page.find(".header-left-slot");
        var $right_slot = $page.find('.header-right-slot');
        $right_slot.attr('href', '#' + add_query_parameter(this.url,
                                                           "refresh", "true"));
        $right_slot.html("Refresh");
        if (container_url) {
            var container = content_node_manager.get(container_url);
            $left_slot.attr('href', '#' + container_url);
            $title.html(this.name);
            if (container.is_root()) { $left_slot.text("Access"); }
            else { $left_slot.text(container.name); }}
        else {
            $left_slot.hide();
            $title.html("Access"); }
    }
    StorageNode.prototype.layout_header = function(settings) {
        return ContentNode.prototype.layout_header.call(this, settings); }
    RootShareRoomNode.prototype.layout_header = function(settings) {
        ContentNode.prototype.layout_header.call(this, settings);
        var $right_slot = $page.find('.header-right-slot');
        $right_slot.attr('href', '#' + add_query_parameter(this.url,
                                                           "edit", "true"));
        $right_slot.html("Edit"); }

    ContentNode.prototype.layout_content = function (settings) {
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
    DirectoryContentNode.prototype.layout_item$ = function(settings) {
        /* Return a directory-like content item's description as jQuery item. */
        var $href = $('<a/>').attr('class', "compact-vertical");
        $href.attr('href', "#" + this.url);
        $href.html($('<h4/>').html(this.name));
        var $it = $('<li/>').append($href);
        $it.attr('data-filtertext', this.name);
        return $it; }
    DeviceStorageNode.prototype.layout_item$ = function(settings) {
        /* Return a storage device's description as a jQuery item. */
        return DirectoryStorageNode.prototype.layout_item$.call(this); }
    DirectoryStorageNode.prototype.layout_item$ = function(settings) {
        /* Return a storage directory's description as a jQuery item. */
        return DirectoryContentNode.prototype.layout_item$.call(this,
                                                                settings); }
    DirectoryShareRoomNode.prototype.layout_item$ = function(settings) {
        /* Return a share room directory's description as a jQuery item. */
        return DirectoryContentNode.prototype.layout_item$.call(this,
                                                                settings); }
    RoomShareRoomNode.prototype.layout_item$ = function(settings) {
        /* Return a share room's description as a jQuery item. */
        return DirectoryShareRoomNode.prototype.layout_item$.call(this,
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
    ContentNode.prototype.containment_path = function() {
        /* Return '/' nested containing path, per content type. */
        return "SpiderOak"; }
    RootStorageNode.prototype.containment_path = function() {
        /* Return '/' nested containing path, per content type. */
        return my.username; }
    DeviceStorageNode.prototype.containment_path = function() {
        /* Return '/' nested containing path, per content type. */
        return my.username; }
    DirectoryStorageNode.prototype.containment_path = function() {
        /* Return '/' nested containing path, per content type. */
        var parent = content_node_manager.get(this.parent_url);
        if (parent.is_device()) {
            return parent.name + " /" + this.name; }
        else { return parent.containment_path() + "/" + this.name; }}
    FileStorageNode.prototype.containment_path = function() {
        /* Return '/' nested containing path, per content type. */
        return DirectoryStorageNode.containment_path.call(this); }
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
                            + defaults.storage_page_template_id
                            + " not present."); }
            this.$page = $template.clone();
            this.$page.attr('id', this.my_page_id());
            this.$page.attr('data-url', this.my_page_id());
            // Include our page in the DOM, after the storage page template:
            this.get_storage_page_template$().after(this.my_page$()); }
        return this.$page; }
    ContentNode.prototype.get_storage_page_template$ = function() {
        return $("#" + defaults.storage_page_template_id); }

    /* Convenience: */
    ContentNode.prototype.toString = function () {
        return "<Content node " + this.url + ">";
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
                   Identify 'parent' for production of new nodes.
                   New nodes produced on first reference, but not provisioning.
                 */
                got = by_url[url];
                if (! got) {
                    if (is_content_root_url(url)) {
                        if (is_storage_url(url)) {
                            got = new RootStorageNode(url, parent); }
                        else { got = new RootShareRoomNode(url, parent); }}
                    else if (is_content_root_url(parent.url)
                             && (parent.url === my.storage_root_url)) {
                        got = new DeviceStorageNode(url, parent); }
                    else if (url.charAt(url.length-1) !== "/") {
                        // No trailing slash.
                        if (is_storage_url(url)) {
                            got = new FileStorageNode(url, parent); }
                        else {
                            got = new FileShareRoomNode(url, parent); }}
                    else {
                        if (is_storage_url(url)) {
                            got = new DirectoryStorageNode(url, parent); }
                        else {
                            got = new DirectoryShareRoomNode(url, parent); }
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
                submit_handler(data);
                return false;
            })
        },

        share_root_visit: function (credentials) {
            /* Visit share room root.
               'credentials': Object including "shareid" and "password" attrs.
            */
            $.mobile.changePage(
                add_share_root(credentials['shareid'], credentials['password'],
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
                        unhide_login_forms(0, 500);
                        $.mobile.hidePageLoadingMsg();
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
                        unhide_login_forms(5000, 500);
                        // Browser haz auth cookies, we haz relative location.
                        // Go there, and machinery will intervene to handle it.
                        $.mobile.changePage(
                            set_storage_account(login_info['username'],
                                                server_host_url,
                                                match[2]));
                    }
                },
                error: function (xhr) {
                    unhide_login_forms(100, 100);
                    $.mobile.hidePageLoadingMsg();
                    error_alert("Storage login", xhr.status);
                },
            });
        },
        // Expose the content node manager for debugging:
        cnm: (SO_DEBUGGING ? content_node_manager : null),
    }
}();
