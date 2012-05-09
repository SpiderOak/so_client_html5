/* SpiderOak html5 client Main app.

 * Works with:
 * - jquery.mobile-1.0.1.css
 * - jquery-1.6.4.js
 * - jquery.mobile-1.0.1.js
 * - misc.js - b32encode_trim(), blather(), error_alert()
 */

/*
  NOTES

  - Content visits:
    We intercept navigation to content (eg, $.mobile.pageChange) repository
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
    $('.nav_login_storage form').submit(function () {
        var username = $('input[name=username]', this).val();
        var password = $('input[name=password]', this).val();
        spideroak.remote_login({username: username, password: password});
        return false;
    });
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
        storage_login_path: "/browse/login",
        storage_path_prefix: "/storage/",
        share_path_prefix: "/share/",
        storage_root_page_id: "storage-root",
        devices_query_expression: 'device_info=yes',
        versions_query_expression: 'format=version_info',
        home_page_id: 'home',
        root_storage_node_label: "Devices",
        preview_sizes: [25, 48, 228, 800],
        header_markup: '<div data-role="header">\
      <div class="ui-grid-c">\
        <div class="ui-block-a">\
          <img src="brand_images/named_logo.png" alt="Logo">\
        </div>\
        <div class="ui-block-b">\
          <h2> ~general~ </h2>\
        </div>\
        <div class="ui-block-c">\
          <h2> ~specific~ </h2>\
        </div>\
      </div>\
    </div>',

    }
    var my = {
        /* Login session settings: */
        starting_host_url: null,
        username: null,
        storage_web_url: null,  // Location of storage web UI for user.
        // content_roots_urls are for discerning URLs of contained items.
        // They're accumulated on access to storage repo root and share rooms.
        content_root_urls: [],
        storage_root_url: null,
        share_root_urls: [],
    }

    /* Navigation handlers: */

    function handle_content_visit(e, data) {
        /* Intercept URL visits and intervene for repository content. */
        if (typeof data.toPage === "string" && is_content_url(data.toPage)) {
            e.preventDefault();
            blather("handle_content_visit triggered: " + data.toPage);
            content_node_manager.get(data.toPage).visit(data.options); }}

    /* Node-independent URL classification: */

    function is_content_root_url(url) {
        /* True if the 'url' is for one of the root content items.
           Doesn't depend on an already established node for the url. */
        return ($.inArray(url, my.content_root_urls) >= 0); }
    function is_storage_url(url) {
        /* True if the URL is for a content item in the user's storage area.
           Doesn't depend on an already established node for the url. */
        return (url.slice(0, my.storage_root_url.length)
                === my.storage_root_url); }
    function is_content_url(url) {
        /* True if url within established content roots. */
        for (var i in my.content_root_urls) {
            var prospect = my.content_root_urls[i];
            if (url.slice(0, prospect.length) === prospect) { return true; }}
        return false; }

    /* Effect session state: */

    function set_storage_account(username, domain,
                         storage_path_prefix, storage_web_url) {
        /* Register user-specific storage details, returning storage root URL.
        */
        my.username = username;
        my.storage_domain = domain;
        var url = my.storage_root_url = (domain + storage_path_prefix
                                         + b32encode_trim(username) + "/");
        if (! is_content_root_url(url)) {
            my.content_root_urls.push(url); }
        my.storage_web_url = storage_web_url;
        return my.storage_root_url; }
    function set_share_room() {
        /* */
        // XXX Flesh this out, adding to my.content_root_urls in the process.
    }

    /* Content representation structures: */

    /* Various content node types - the root, devices, directories, and
       files - are implemented based on a generic ContentNode object.
       Departures from the basic functionality are implemented as distinct
       prototype functions defined immediately after the generic ones.

       The generic functions are for the more prevalent container-style nodes.
    */

    function ContentNode(url, parent) {
        /* Basis for representing collections of remote content items.
           - 'url' is absolute URL for the collection's root (top) node.
           - 'parent' is containing node. The root's parent is null.
           See 'Device storage node example json data' below for example JSON.
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
            this.constructed_page$;
            this.set_page_id();
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
    function ShareNode(url, parent) {
        ContentNode.call(this, url, parent);
        if (! parent) {
            // This is a share room, which is the root of the collection.
            this.root_url = url; }
        else {
            this.root_url = parent.root_url; }}
    ShareNode.prototype = new ContentNode();

    function RootStorageNode(url, parent) {
        StorageNode.call(this, url, parent);
        // TODO: Do we really want to always get the root with devices details?
        this.query_qualifier = "?" + defaults.devices_query_expression;
        this.emblem = "Root:";
        this.stats = null;
        delete this.files; }
    RootStorageNode.prototype = new StorageNode();
    function RootShareNode(url, parent) {
        this.emblem = "Room:";
        ShareNode.call(this, url, parent); }
    RootShareNode.prototype = new ShareNode();
    function DeviceStorageNode(url, parent) {
        StorageNode.call(this, url, parent);
        this.emblem = "Device:";
        this.device_url = url; }
    DeviceStorageNode.prototype = new StorageNode();
    function DirectoryStorageNode(url, parent) {
        this.emblem = "Directory:";
        StorageNode.call(this, url, parent); }
    DirectoryStorageNode.prototype = new StorageNode();
    function DirectoryShareNode(url, parent) {
        this.emblem = "Directory:";
        ShareNode.call(this, url, parent); }
    DirectoryShareNode.prototype = new ShareNode();
    function FileStorageNode(url, parent) {
        this.emblem = "File:";
        StorageNode.call(this, url, parent);
        this.is_container = false;
        delete this.subdirs;
        delete this.files; }
    FileStorageNode.prototype = new StorageNode();
    function FileShareNode(url, parent) {
        this.emblem = "File:";
        ShareNode.call(this, url, parent);
        this.is_container = false;
        delete this.subdirs;
        delete this.files; }
    FileShareNode.prototype = new ShareNode();

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
            // success_handler is actually running, so we another
            // lexically scoped var.
            var this_node = this;
            this.fetch_and_dispatch(function (data, when)
                                    { this_node.provision(data, when);
                                      this_node.layout();
                                      this_node.show(options); },
                                    this_node.handle_failed_visit);
        } else {
            this.show(options);
        }
    }
    ContentNode.prototype.handle_failed_visit = function (xhr) {
        /* Do error handling failed visit with 'xhr' XMLHttpResponse report. */
        // TODO: Proper error handling.
        error_alert("Failure reaching " + this.url, xhr.status);
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
        throw new Error("Type-specific provisioning implementation missing.")
    }
    RootStorageNode.prototype.provision_populate = function (data, when) {
        /* Embody the root content item with 'data'. */
        var mgr = content_node_manager
        var url, dev, devdata;
        var possessive = (my.username.charAt(my.username.length-1) == "s"
                          ? "' " : "'s ")
        this.name = my.username + possessive + defaults.root_storage_node_label;
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
            url = this.parent_url + dirdata[0] + "/";
            // Get a node for the subdir:
            dir = mgr.get(url, this)
            dir.name = dirdata[0];
            // Include, if not already present:
            if (! ($.inArray(url, this.subdirs) >= 0)) {
                this.subdirs.push(url); }}
        for (var i in data.files) {
            filedata = data.files[i];
            url = this.parent_url + filedata['url'];
            // Get a node for the file:
            file = mgr.get(url, this);
            var fields = ['name', 'size', 'ctime', 'mtime', 'versions'];
            for (var nmi in fields) {
                var name = fields[nmi];
                if (name in filedata) { this[name] = filedata[name]; }}
            for (var szi in defaults.preview_sizes) {
                var sz = "preview_" + defaults.preview_sizes[szi];
                if (sz in filedata) {
                    file[sz] = filedata[sz]; }}
            // Include, if not already present:
            if (! ($.inArray(url, this.files) >= 0)) {
                this.files.push(url); }}
        this.lastfetched = when;
    }
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

    ContentNode.prototype.set_page_id = function () {
        /* Set the UI page id, according to stored characteristics. */
        // TODO: Actually allocate and manage pages per node.
        this.page_id = (this.parent
                        ? this.parent.get_page_id()
                        : defaults.storage_root_page_id);
    }
    ContentNode.prototype.get_page_id = function () {
        /* Return the UI page id. */
        return this.page_id;
    }
    ContentNode.prototype.show = function (options) {
        /* Trigger UI focus on our content layout. */
        // We use whatever layout is already done.
        var $page = this.$get_my_page();
        blather(this + ".show() " + this.url + " on page " + this.page_id);
        options.dataUrl = this.page_id;
        $.mobile.changePage($page, options);
    }
    ContentNode.prototype.layout = function () {
        /* Deploy content as markup on our page. */
        var $page = this.$get_my_page();
        if ($page.length === 0) {
            // >>> Mint page:
            throw new Error(".layout new page not yet implemented"); }
        var my_url = this.url;
        var superior_url = this.parent_url || defaults.home_page_id;
        var $header = $page.children(":jqmData(role=header)");
	var $content = $page.children(":jqmData(role=listview)");
        var markup = "";
        var ul_open = "<ul data-role='listview' data-inset='true'>\n"
        var ul_close = "</ul>\n"
        var i, sub;

        if (! (this.subdirs || this.files)) {
            markup += "<p> No contents. </p>"; }
        else {
            if (this.subdirs) {
                markup += ul_open;
                for (i in this.subdirs) {
                    sub = content_node_manager.get(this.subdirs[i]);
                    // Leading '#' on url so pageChange handler is triggered:
                    markup += ('<li><a href="#' + sub.url + '">'
                               + sub.emblem + " "
                               + sub.name + '</a></li>'); };
                markup += ul_close; }
            if (this.files) {
                markup += ul_open;
                for (i in this.files) {
                    sub = mgr.get(this.subdirs[i]);
                    markup += ('<li><a href="#' + sub.url + '">'
                               + sub.emblem + " "
                               + sub.name + '</a></li>\n'); };
                markup += ul_close; }
        }
        $header.html(this.page_header_markup(this.containment_path(),
                                             this.name,
                                             3));
        $content.html(markup);
        $page.page();
        $content.find(":jqmData(role=listview)").listview();
        this.constructed_page$ = $page;
        return $page;
    }
    ContentNode.prototype.containment_path = function() {
        /* Return breadcrumbs-like containing path, per content type. */
        return "SpiderOak"; }
    RootStorageNode.prototype.containment_path = function() {
        /* Return breadcrumbs-like containing path, per content type. */
        return my.username; }
    DeviceStorageNode.prototype.containment_path = function() {
        /* Return breadcrumbs-like containing path, per content type. */
        return my.username; }
    DirectoryStorageNode.prototype.containment_path = function() {
        /* Return breadcrumbs-like containing path, per content type. */
        var parent = content_node_manager.get(this.parent_url);
        if (parent.is_device()) {
            return parent.name + " /" + this.name; }
        else { return parent.containment_path() + "/" + this.name; }}
    FileStorageNode.prototype.containment_path = function() {
        /* Return breadcrumbs-like containing path, per content type. */
        return DirectoryStorageNode.containment_path.call(this); }
    ContentNode.prototype.page_header_markup = function(general, specific,
                                                        level) {
        /* Return markup with general and specific legend fields filled in.
           Optional level is header level to use, instead of default. */
        var got = defaults.header_markup;
        got = got.replace(/~general~/, general).replace(/~specific~/, specific);
        if (level) { got = got.replace(/h2>/g, "h" + level + ">"); }
        return got;
    }
    ContentNode.prototype.$get_my_page = function () {
        /* Return this node's jQuery object; empty if page not established. */
        return this.constructed_page$ || $("#" + this.get_page_id());}

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

        // TODO: Delete node when ascending above them.
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
                        if (url === my.storage_root_url) {
                            got = new RootStorageNode(url, parent); }
                        else { got = new RootShareNode(url, parent); }}
                    else if (is_content_root_url(parent.url)
                             && (parent.url === my.storage_root_url)) {
                        got = new DeviceStorageNode(url, parent); }
                    else if (url.charAt(url.length-1) !== "/") {
                        // No trailing slash.
                        if (is_storage_url(url)) {
                            got = new FileStorageNode(url, parent); }
                        else {
                            got = new FileShareNode(url, parent); }}
                    else {
                        if (is_storage_url(url)) {
                            got = new DirectoryStorageNode(url, parent); }
                        else {
                            got = new DirectoryShareNode(url, parent); }
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
            }
        }
    }()

    /* public: */
    return {
        init: function () {
            /* Establish event handlers, etc. */
            blather("spideroak object init...");
            $(document).bind("pagebeforechange", handle_content_visit);
        },
        toString: function () {
            var user = (my.username ? my.username : "-");
            var fetched = (Object.keys(content_node_manager).length || "-");
            return ("SpiderOak instance for "
                    + user + ", " + fetched + " items fetched");
        },

        /* Login and account/identity. */

        remote_login: function (login_info, url) {
            /* Login to storage account and commence browsing at the devices.
               We provide for redirection to specific alternative servers
               by recursive calls. See:
               https://spideroak.com/apis/partners/web_storage_api#Loggingin
             */
            var parsed = $.mobile.path.parseUrl(url);
            var login_url;
            var server_host_url;
            if (url && $.inArray(parsed.protocol, ["http:", "https:"])) {
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
                        error_alert('Temporary server failure. Please'
                                    + ' try again in a few minutes.');
                    } else if (match[1] === 'login') {
                        if (match[2].charAt(0) === "/") {
                            login_url = server_host_url + match[2];
                        } else {
                            login_url = match[2];
                        }
                        spideroak.remote_login(login_info, login_url);
                    } else {
                        // Browser haz auth cookies, we haz relative location.
                        // Go there, and machinery will intervene to handle it.
                        $.mobile.changePage(
                            set_storage_account(login_info['username'],
                                                server_host_url,
                                                defaults.storage_path_prefix,
                                                match[2]));
                    }
                },
                error: function (xhr) {
                    error_alert("SpiderOak Login", xhr.status);
                }
            });
        },
    }
}();

/* Handy notes. */

/* API v1: per https://spideroak.com/apis/partners/web_storage_api */
/* Proposed API v2: https://spideroak.com/pandora/wiki/NewJsonObjectApi */

/* Device storage node example json data:

  {"stats": {"firstname": "ken", "lastname": "manheimer",
             "devices": 2, "backupsize": "1.784 GB",
             "billing_url": "https://spideroak.com/user/validate?hmac=69...",
             "size": 3},
   "devices": [{"encoded": "Some%20Laptop%20Computer/",
                "name": "Some Laptop Computer",
                "lastlogin": 1335452245, "lastcommit": 1335464711},
               {"encoded": "Server%20%2F%20Colorful/",
                "name": " Server / Colorful",
                "lastlogin": 1335464648, "lastcommit": 1335464699}]}
*/
