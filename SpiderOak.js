/* SpiderOak html5 client Main app.

 * Works with:
 * - jquery.mobile-1.0.1.css
 * - jquery-1.6.4.js
 * - jquery.mobile-1.0.1.js
 * - misc.js - b32encode_trim(), blather(), error_alert()
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
        // XXX host_url may need variability according to brand package.
        host_url: "https://spideroak.com",
        storage_login_path: "/browse/login",
        storage_path: "/storage/",
        share_path: "/share/",
        storage_root_page_id: "storage-root",
        devices_query_string: '?device_info=yes',
    }
    var my = {
        host_url: null,
        storage_path: null,
        username: null,
        storage_web_url: null,  // Likely irrelevant - user's storage web UI.
    }

    function set_account(username, host_url, storage_path, storage_web_url) {
        /* Register user-specific storage details. */
        my.username = username;
        my.host_url = host_url;
        my.storage_path = storage_path;
        my.storage_root_url = (my.host_url
                               + my.storage_path
                               + b32encode_trim(username));
        my.storage_web_url = storage_web_url;
    }

    /* Various storage node types - the root, devices, directories, and
       files - are implemented based on a generic StorageNode object.
       Departures from the basic functionality are implemented as distinct
       prototype functions defined immediately after the generic ones.

       The generic functions are for container-style nodes, since that is
       the prevailing type.
    */

    function StorageNode(path, parent) {
        /* Represent a storage device, directory, or file.
           - 'path' is relative to the storage root, must start with '/'.
           - 'parent' is containing StorageNode, unspecified (undefined) parent.
           See below for 'Device storage node example json data'.
        */
        if ( !(this instanceof StorageNode) )
            throw new Error("Constructor called as a function");
        if (path) {             // Skip if we're in prototype assignment.
            this.generic_setup(path, parent);
        }
    }
    StorageNode.prototype.generic_setup = function (path, parent) {
        /* Setup likely to be used by all derivative objects. */
        this.path = path;
        this.parent_path = parent ? parent.path : null;
        this.device_path = parent ? parent.device_path : null;
        this.is_container = true;
        this.sub = []; // Paths of contained devices, directories.
        this.files = [];         // Paths of contained files.
        this.set_page_id();
        this.lastfetched = false;
    }

    // All of the derived objects use StorageNode's constructor.
    function RootStorageNode(path, parent) { this.generic_setup(path, parent);
                                             this.stats = null;
                                             delete this.files; }
    RootStorageNode.prototype = new StorageNode();
    function DeviceStorageNode(path, parent) { this.generic_setup(path,
                                                                  parent);
                                               // For offspring:
                                               this.device_path = path; }
    DeviceStorageNode.prototype = new StorageNode();
    function DirectoryStorageNode(path, parent) { this.generic_setup(path,
                                                                     parent); }
    DirectoryStorageNode.prototype = new StorageNode();
    function FileStorageNode(path, parent) { this.generic_setup(path, parent);
                                             this.is_container = false;
                                             delete this.sub;
                                             delete this.files; }
    FileStorageNode.prototype = new StorageNode();

    StorageNode.prototype.visit = function () {
        /* Get up-to-date with remote copy and show. */
        if (! this.up_to_date()) {
            // We use 'this_node' because 'this' gets overriden when
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
    StorageNode.prototype.handle_failed_visit = function (xhr) {
        /* Do error handling failed visit with 'xhr' XMLHttpResponse report. */
        // TODO: Proper error handling.
        error_alert("Failure reaching " + this.path, xhr.status);
    }
    StorageNode.prototype.provision = function (data, when) {
        /* Populate node with JSON 'data'. 'when' is the data's current-ness.
           'when' should be no more recent than the XMLHttpRequest.
        */
        this.provision_preliminaries(data, when);
        this.provision_populate(data, when);
    }
    StorageNode.prototype.provision_preliminaries = function (data, when) {
        /* Do provisioning stuff generally useful for derived types. */
        if (! when) {
            throw new Error("Node provisioning without reliable time stamp.");
        }
        this.up_to_date(when);
    }
    StorageNode.prototype.provision_populate = function (data, when) {
        /* Stub, must be overridden by type-specific provisionings. */
        throw new Error("Type-specific provisioning implementaiton missing.")
    }
    RootStorageNode.prototype.provision_populate = function (data, when) {
        /* Embody the root storage node with 'data'. */
        var mgr = storage_node_manager
        var dev, devdata;
        mgr.stats = data["stats"]; // We'll use this eventually.
        for (i in data.devices) {
            devdata = data.devices[i];
            path = "/" + devdata["encoded"]
            dev = mgr.get(path, this)
            dev.name = devdata["name"];
            dev.lastlogin = devdata["lastlogin"];
            dev.lastcommit = devdata["lastcommit"];
            dev.lastfetched = when;
            if (! ($.inArray(path, this.sub) >= 0)) {
                this.sub.push(path);
            }
        }
    }

    StorageNode.prototype.show = function () {
        /* Present self in the UI. */
        var page_id = this.get_page_id();
        var page = $("#" + page_id);
        // >>>
        blather(this + ".show() " + this + " on page " + page_id);
    }
    StorageNode.prototype.is_root = function () {
        /* True if the node is a storage device entry. */
        return (this.path === "/");
    }
    StorageNode.prototype.set_page_id = function () {
        /* Set the UI page id, acording to stored characteristics. */
        // TODO: Allocate and manage pages - probably per node.
        this.page_id = (this.parent
                        ? this.parent.get_page_id()
                        : defaults.storage_root_page_id);
    }
    StorageNode.prototype.get_page_id = function () {
        /* Return the UI page id. */
        return this.page_id;
    }
    StorageNode.prototype.up_to_date = function (when) {
        /* True if provisioned data is current.
           Optional 'when' specifies (new) time we were fetched. */
        if (when) {this.lastfetched = when;}
        if (! this.lastfetched) { return false; }
        // XXX: Currently, never up to date! Must actually test against the
        //      device lastcommit time.
        else { return (this.lastfetched >= new Date().getTime()); }
    }
    StorageNode.prototype.fetch_and_dispatch = function (success_callback,
                                                         failure_callback) {
        /* Retrieve this node's data and conduct specified actions accordingly.
           - On success, 'success_callback' gets retrived data and Date() just
             prior to the retrieval.
           - Otherwise, 'failure_callback' invoked with XMLHttpResponse object.
        */

        var storage_url = my.storage_root_url + this.path;
        var when = new Date();
        if (this.is_root()) {storage_url += defaults.devices_query_string; }
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
    StorageNode.prototype.toString = function () {
        return "<Storage node " + this.path + ">";
    }

    var storage_node_manager = function () {
        /* A singleton utility for getting and removing storage node objects.
           "Getting" means finding existing ones or else allocating new ones.
        */
        // New node types are determined according to criteria specified in
        // the get funtion.

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
                    if (path === "/") {
                        got = new RootContentNode(path, parent);
                        root = got; }
                    else if (!root) {
                        // Shouldn't happen.
                        throw new Error("content_node_manager.get:"
                                        + " Content visit before root"
                                        + " established"); }
                    else if (parent === root) {
                        got = new DeviceContentNode(path, parent); }
                    else if (path[path.length-1] !== "/") {
                        got = new FileContentNode(path, parent); }
                    else {
                        got = new DirectoryContentNode(path, parent);
                    }
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

    function handle_content_visit(e, data) {
        /* Handler to intervene in visit:path UI clicks. */
        if ( typeof data.toPage === "string" ) {
	    var parsed = $.mobile.path.parseUrl(data.toPage);
            if (parsed.protocol === "visit:") {
                e.preventDefault();
                blather("handle_content_visit visit detected: "
                                + parsed.pathname);
                spideroak.visit(parsed.pathname);
            }
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
            var storage = (my.storage.length ? my.storage : "-");
            var shares = (my.shares.length ? my.shares : "-");
            return ("SpiderOak instance (user "
                    +user+ ", storage " +storage+ ", shares " +shares+ ")");
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
                server_host_url = defaults.host_url;
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
                        set_account(login_info['username'],
                                              server_host_url,
                                              defaults.storage_path,
                                              match[2]);
                        spideroak.visit("/");
                    }
                },
                error: function (xhr) {
                    error_alert("SpiderOak Login", xhr.status);
                }
            });
        },

        /* Browse storage. */
        visit: function (path) {
            /* Retrieve detailed data for users's devices and present them. */
            var node = storage_node_manager.get(path);
            node.visit(path);
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
