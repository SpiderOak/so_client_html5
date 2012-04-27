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
        devices_query: '?device_info=yes',
    };
    var my = {
        host_url: null,
        storage_path: null,
        username: null,
        storage_web_url: null,  // Likely irrelevant - user's storage web UI.
        storage: [],
        shares: [],
    };
    var devices = [];

    function StorageNode(path, parent, device) {
        /* Represent a storage directory.
           - Device StorageNodes path is '/' and they have no specified parent
             or device (undefined).
           - The data structure includes cycles, so we need to deliberately
             release obsolete or excessive nodes to avoid memory leaks.
           See below for 'Device storage node example json data'.
        */
        if ( !(this instanceof arguments.callee) )
            throw new Error("Constructor called as a function");
        this.path = path;
        this.parent = parent;
        this.device = device;
        this.set_page_id();
        this.contents = [];
    };
    StorageNode.prototype.release = function() {
        /* Extricate node from potential reference cycles, for eventual GC. */
        // We extricate by deleting reference links...
        delete this.device;
        delete this.parent;
        delete this.contents;
    };
    StorageNode.prototype.set_page_id = function() {
        // Currently, every StorageNode has the same page_id.
        this.page_id = (this.parent
                        ? this.parent.get_page_id()
                        : SpiderOak.storage_root_page_id); };
    StorageNode.prototype.get_page_id = function() {
        return this.page_id;};
    StorageNode.prototype.present = function() {
        /* Display this node on the page. */
        var page = $("#" + this.get_page_id()); };
    StorageNode.prototype.set_contents = function(data) {
        /* Populate the node with retrieved json data. */
        alert("Storage node <" + this.path);
    };

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
            if (url && (url.slice(0,4) === "http")) {
                server_host_url = url.split('/').slice(0,3).join('/');
                login_url = url
            } else {
                server_host_url = defaults.host_url;
                login_url = (server_host_url
                             + defaults.storage_login_path);
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
                        spideroak.set_storage_specifics(
                            login_info['username'],
                            server_host_url,
                            defaults.storage_path,
                            match[2]);
                        spideroak.visit_storage_devices();
                    }
                },
                error: function (xhr) {
                    error_alert("SpiderOak Login", xhr.status);
                }
            });
        },
        set_storage_specifics: function (username, host_url,
                                         storage_path, storage_web_url) {
            /* Register user-specific storage details. */
            my.username = username;
            my.host_url = host_url;
            my.storage_path = storage_path;
            my.storage_root_url = (my.host_url
                                   + my.storage_path
                                   + b32encode_trim(username));
            my.storage_web_url = storage_web_url;
        },

        /* Browse storage. */

        retrieve_storage_data: function (storage_path, query_string,
                                         success_callback, failure_callback) {
            /* Retrieve data for storage_path within user's storage root URL.
               - Retrived data is passed to the success_callback.
               - If retrieval fails, the XMLHttpResponse object is passed to
                 the failure_callback.
               - storage_path must begin with '/'.
               - query_string, if present, is appended, for e.g. device_info.
            */
            var storage_url = my.storage_root_url + storage_path;
            if (typeof query_string !== 'undefined') {
                storage_url += query_string; }
            $.ajax({
                url: storage_url,
                type: 'GET',
                dataType: 'json',
                success: function (data) {
                    success_callback(data);
                },
                error: function (xhr) {
                    failure_callback(xhr);
                },
            });
        },
        visit_storage_devices: function () {
            /* Retrieve detailed data for users's devices and present them. */
            return spideroak.visit_storage_node("/", defaults.devices_query);
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
