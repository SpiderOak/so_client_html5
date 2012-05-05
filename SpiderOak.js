/* SpiderOak html5 client Main app.

 * Works with:
 * - jquery.mobile-1.0.1.css
 * - jquery-1.6.4.js
 * - jquery.mobile-1.0.1.js
 * - misc.js - b32encode_trim(), blather(), error_alert()
 */

/*
  This machinery intercepts navigation to content repository URLs and
  it intervenes by means of binding handle_content_visit to jQuery mobile
  "pagebeforechange" event.
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
    var defaults = {
        // API v1.
        // XXX starting_host_url may vary according to brand package.
        starting_host_url: "https://spideroak.com",
        storage_login_path: "/browse/login",
        storage_path: "/storage/",
        share_path: "/share/",
        storage_root_page_id: "storage-root",
        devices_query_string: '?device_info=yes',
    }
    var my = {
        starting_host_url: null,
        storage_path: null,
        username: null,
        storage_web_url: null,  // Location of storage web UI for user.
        // Accumulate content_url_roots on access to various content repos
        // - the storage repo root, various share rooms.
        content_url_roots: [],  // Observed prefixes for user's content URLs.
    }

    function set_account(username, domain, storage_path, storage_web_url) {
        /* Register user-specific storage details, returning storage root URL.
        */
        my.username = username;
        my.storage_domain = domain;
        my.storage_root_path = storage_path + b32encode_trim(username) + "/";
        my.storage_root_url = domain + my.storage_root_path;

        // content_url_roots are for discerning URLs of contained items.
        my.content_url_roots.push(my.storage_root_url);
        my.storage_web_url = storage_web_url;
        return my.storage_root_url;
    }

    /* Various content node types - the root, devices, directories, and
       files - are implemented based on a generic ContentNode object.
       Departures from the basic functionality are implemented as distinct
       prototype functions defined immediately after the generic ones.

       The generic functions are for the more prevalent container-style nodes.
    */

    function ContentNode(path, parent) {
        /* Basis for representing collections of remote content items.
           - 'path' is relative to the collection's root (top) node.
             All paths should start with '/'.
           - 'parent' is containing node. The root's parent is null.
           See 'Device storage node example json data' below for example JSON.
        */
        if ( !(this instanceof ContentNode) ) // Coding failsafe.
            throw new Error("Constructor called as a function");
        if (path) {             // Skip if we're in prototype assignment.
            this.path = path;
            this.root_path = parent ? parent.root_path : path;
            this.parent_path = parent ? parent.path : null;
            this.is_container = true;
            this.subdirs = []; // Paths of contained devices, directories.
            this.files = [];         // Paths of contained files.
            this.set_page_id();
            this.lastfetched = false;
        }
    }
    function StorageNode(path, parent) {
        ContentNode.call(this, path, parent);
        // All but the root storage nodes are contained within a device.
        // The DeviceStorageNode sets the device path, which will trickle
        // down to all its contents.
        this.device_path = parent ? parent.device_path : null;
    }
    StorageNode.prototype = new ContentNode();
    function ShareNode(path, parent) {
        ContentNode.call(this, path, parent);
        if (! parent) {
            // This is a share room, which is the root of the collection.
            this.root_path = path; }
        else {
            this.root_path = parent.root_path; }
    }
    ShareNode.prototype = new ContentNode();

    function RootStorageNode(path, parent) {
        StorageNode.call(this, path, parent);
        this.stats = null;
        delete this.files; }
    RootStorageNode.prototype = new StorageNode();
    function RootShareNode(path, parent) {
        ShareNode.call(this, path, parent); }
    RootShareNode.prototype = new ShareNode();
    function DeviceStorageNode(path, parent) {
        StorageNode.call(this, path, parent);
        this.device_path = path; }
    DeviceStorageNode.prototype = new StorageNode();
    function DirectoryStorageNode(path, parent) {
        StorageNode.call(this, path, parent); }
    function DirectoryShareNode(path, parent) {
        ShareNode.call(this, path, parent); }
    DirectoryShareNode.prototype = new ShareNode();
    function FileStorageNode(path, parent) {
        StorageNode.call(this, path, parent);
        this.is_container = false;
        delete this.subdirs;
        delete this.files; }
    FileStorageNode.prototype = new StorageNode();
    function FileShareNode(path, parent) {
        ShareNode.call(this, path, parent);
        this.is_container = false;
        delete this.subdirs;
        delete this.files; }
    FileShareNode.prototype = new ShareNode();

    ContentNode.prototype.visit = function () {
        /* Get up-to-date with remote copy and show. */
        if (! this.up_to_date()) {
            // We use 'this_node' because 'this' gets overridden when
            // success_handler is actually running, so we another
            // lexically scoped var.
            var this_node = this;
            var success_handler = function (data, when) {
                this_node.provision(data, when);
                this_node.show();
            }
            this.fetch_and_dispatch(success_handler,
                                    this_node.handle_failed_visit);
        } else {
            this.show();
        }
    }
    ContentNode.prototype.handle_failed_visit = function (xhr) {
        /* Do error handling failed visit with 'xhr' XMLHttpResponse report. */
        // TODO: Proper error handling.
        error_alert("Failure reaching " + this.path, xhr.status);
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
        var dev, devdata;
        mgr.stats = data["stats"]; // TODO: We'll cook stats when UI is ready.
        for (var i in data.devices) {
            devdata = data.devices[i];
            path = my.storage_root_path + devdata["encoded"]
            dev = mgr.get(path, this)
            dev.name = devdata["name"];
            dev.lastlogin = devdata["lastlogin"];
            dev.lastcommit = devdata["lastcommit"];
            if (! ($.inArray(path, this.subdirs) >= 0)) {
                this.subdirs.push(path);
            }
        }
        this.lastfetched = when;
    }

    ContentNode.prototype.show = function () {
        /* Present self in the UI. */
        var page_id = this.get_page_id();
        var page = $("#" + page_id);
        // >>>
        blather(this + ".show() " + " on page " + page_id);
    }
    ContentNode.prototype.is_storage_root = function () {
        /* True if the node is a storage root item. */
        return (this.path === my.storage_root_path);
    }
    ContentNode.prototype.set_page_id = function () {
        /* Set the UI page id, acording to stored characteristics. */
        // TODO: Actually allocate and manage pages per node.
        this.page_id = (this.parent
                        ? this.parent.get_page_id()
                        : defaults.storage_root_page_id);
    }
    ContentNode.prototype.get_page_id = function () {
        /* Return the UI page id. */
        return this.page_id;
    }
    ContentNode.prototype.up_to_date = function (when) {
        /* True if provisioned data is current.
           Optional 'when' specifies (new) time we were fetched. */
        if (when) {this.lastfetched = when;}
        if (! this.lastfetched) { return false; }
        // XXX: Currently, never up to date! Must actually test against the
        //      device lastcommit time.
        else { return (this.lastfetched >= new Date().getTime()); }
    }
    ContentNode.prototype.fetch_and_dispatch = function (success_callback,
                                                         failure_callback) {
        /* Retrieve this node's data and conduct specified actions accordingly.
           - On success, 'success_callback' gets retrived data and Date() just
             prior to the retrieval.
           - Otherwise, 'failure_callback' invoked with XMLHttpResponse object.
        */

        var storage_url = my.storage_domain + this.path;
        var when = new Date();
        if (this.is_storage_root()) {
            storage_url += defaults.devices_query_string; }
        $.ajax({url: storage_url,
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
    ContentNode.prototype.toString = function () {
        return "<Content node " + this.path + ">";
    }

    var content_node_manager = function () {
        /* A singleton utility for getting and removing content node objects.
           "Getting" means finding existing ones or else allocating new ones.
        */
        // Type of newly minted nodes are according to get parameters.

        // TODO: Delete node when ascending above them.
        // TODO Probably:
        // - prefetch offspring layer and defer release til 2 layers above.
        // - make fetch of multiple items contingent to device lastcommit time.

        var by_path = {};
        var root;
        return {
            get: function (path, parent) {
                /* Retrieve a node, according to 'path' and 'parent'.
                   This is where nodes are minted, when first encountered.
                 */
                got = by_path[path];
                if (! got) {
                    if (path === my.storage_root_path) {
                        got = new RootStorageNode(path, parent);
                        root = got; }
                    else if (!root) {
                        // Shouldn't happen.
                        throw new Error("content_node_manager.get:"
                                        + " Content visit before root"
                                        + " established"); }
                    else if (parent === root) {
                        got = new DeviceStorageNode(path, parent); }
                    else if (path[path.length-1] !== "/") {
                        // No trailing slash.
                        got = new FileStorageNode(path, parent); }
                    else {
                        got = new DirectoryStorageNode(path, parent); }
                    by_path[path] = got;
                }
                return got;
            },
            delete: function (node) {
                /* Remove a content node object, eliminating references
                   that could be circular and prevent GC. */
                delete by_path[node.path];
                delete node;
            }
        }
    }()

    function is_content_visit(url) {
        /* True if url within content locations recognized in this session. */
        for (var i in my.content_url_roots) {
            var prospect = my.content_url_roots[i];
            if (url.slice(0, prospect.length) === prospect) { return true; }}
        return false; }
    function handle_content_visit(e, data) {
        /* Handler to intervene in visit:path UI clicks. */
        if (typeof data.toPage === "string" && is_content_visit(data.toPage)) {
            var parsed = $.mobile.path.parseUrl(data.toPage);
            e.preventDefault();
            blather("handle_content_visit visit detected: " + parsed.pathname);
            content_node_manager.get(parsed.pathname).visit();
        }
    }

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
                        $.mobile.changePage(set_account(login_info['username'],
                                                        server_host_url,
                                                        defaults.storage_path,
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
