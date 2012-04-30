/* SpiderOak html5 client Main app.

 * Works with:
 * - jquery.mobile-1.0.1.css
 * - jquery-1.6.4.js
 * - jquery.mobile-1.0.1.js
 * - misc.js - b32encode_trim(), blather(), error_alert(), Object.beget()
 */

SO_DEBUGGING = true;            // for misc.js:blather()

$(document).ready(function() {
    spideroak.init();
    $('.nav_login_storage form').submit(function () {
        var username = $('input[name=username]', this).val();
        var password = $('input[name=password]', this).val();
        spideroak.remote_login({username: username, password: password});
        return false;
    });
});

/* Modular singleton pattern: */
var spideroak = function() {
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
        storage: [],
        shares: [],
    }
    var devices = [];

    function set_account(username, host_url,
                                   storage_path, storage_web_url) {
        /* Register user-specific storage details. */
        my.username = username;
        my.host_url = host_url;
        my.storage_path = storage_path;
        my.storage_root_url = (my.host_url
                               + my.storage_path
                               + b32encode_trim(username));
        my.storage_web_url = storage_web_url;
    }
    // 'storage_node_by_path' registry initially always accumulates.
    // TODO soon: release and delete a node when ascending above it.
    // Eventually, if useful:
    // - prefetch offspring layer and defer release til 2 layers above.
    // - make fetch of multiple items contingent to device lastcommit time.
    storage_node_by_path = {};   // A registry of StorageNodes.
    function get_storage_node(path, parent) {
        /* Return a StorageNode for specified 'path'.
           Second arg 'parent' is optional.
         */
        return storage_node_by_path[path] || (storage_node_by_path[url] =
                                              StorageNode(path, parent));
    }
    function StorageNode(path, parent) {
        /* Represent a storage device, directory, or file.
           - 'path' is relative to the storage root, must start with '/'.
           - 'parent' is containing StorageNode, unspecified (undefined) parent.
           - Data structure includes cycles, must be broken to release storage.
           See below for 'Device storage node example json data'.
        */
        if ( !(this instanceof arguments.callee) )
            throw new Error("Constructor called as a function");

        /* Instance: */
        this.path = path;
        this.parent = parent;
        this.set_page_id();
        this.contents = [];     // Immediate contents of an individual node.
        this.lastfetched = false;
    }
    StorageNode.prototype.set_page_id = function() {
        /* Set the UI page id, acording to stored characteristics. */
        // TODO: Use separate pages for separate nodes.
        this.page_id = (this.parent
                        ? this.parent.get_page_id()
                        : SpiderOak.storage_root_page_id); };
    StorageNode.prototype.get_page_id = function() {
        /* Return the UI page id. */
        return this.page_id;}
    StorageNode.prototype.present = function() {
        /* Display on my UI page. */
        var page = $("#" + this.get_page_id()); }
    StorageNode.prototype.set_contents = function(data) {
        /* Populate the node with retrieved json data. */
        alert("Set contents <Storage node " + this.path + ">");
    }
    StorageNode.prototype.up_to_date = function() {
        /* True if StorageNode instance is populated with . */
        // Eventually, this can be tested against the device lastcommit time.
        return ! this.lastfetched || (this.lastfetched >= new Date().getTime());
    }
    StorageNode.prototype.release = function() {
        /* Remove potential reference cycles, for GC. */
        delete this.parent;
        delete this.contents;
    }
    StorageNode.prototype.present_self = function(data) {
        /* Receive root data and present it in the UI. */
    }

    StorageNode.prototype.fetch_data_and_dispatch = function(
        path, do_root, success_callback, failure_callback) {
        /* Retrieve data for 'path' within user's storage root URL.
           - 'path' must begin with '/'.
           - True-ish 'do_root' means get data for root storage node.
           - 'success_callback' gets retrived data if retrieval succeeds.
           - 'failure_callback' called with XMLHttpResponse object if retrieval
             fails.
        */
        var storage_url = my.storage_root_url + storage_path;
        if (do_root) {
            storage_url += defaults.devices_query_string; }
        $.ajax({url: storage_url,
                type: 'GET',
                dataType: 'json',
                success: function (data) {
                    // Relaying here is handy for debugging breakpoint.
                    success_callback(data);
                },
                error: function (xhr) {
                    failure_callback(xhr);
            },
        });
    }

    /* public: */
    return {
        init: function () {/* No init business yet. */},
        toString: function () {
            var user = (my.username ? "user " + my.username : "no user");
            var storage = (my.storage.length
                           ? "storage " + my.storage : "no storage");
            var shares = (my.shares.length
                          ? ("shares " + my.shares) : "no shares");
            return ("SpiderOak instance for "
                    + user + ", " + storage + ", " + shares);
        },

        /* Login and account/identity. */

        remote_login: function (login_info, url) {
            /* Login to storage account and commence browsing at the devices.
               We provide for redirection to specific alternative servers
               by recursive calls. See:
               https://spideroak.com/apis/partners/web_storage_api#Loggingin
             */
            var login_url;
            var server_host_url;
            if (url && url.match("https?:")) {
                server_host_url = split_url(url)[0];
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
                        spideroak.set_account(login_info['username'],
                                              server_host_url,
                                              defaults.storage_path,
                                              match[2]);
                        spideroak.visit_storage_root();
                    }
                },
                error: function (xhr) {
                    error_alert("SpiderOak Login", xhr.status);
                }
            });
        },

        /* Browse storage. */
        visit_storage_root: function () {
            /* Retrieve detailed data for users's devices and present them. */
            StorageNode.retrieve_and_handle_data(
                "/", true,
                StorageNode.present_root,
                StorageNode.handle_root_visit_failure);
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
