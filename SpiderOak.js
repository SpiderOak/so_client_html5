/* SpiderOak html5 client Main app.

 * Works with:
 * - jquery.mobile-1.0.1.css
 * - jquery-1.6.4.js
 * - jquery.mobile-1.0.1.js
 */


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
    // XXX server_host_url may vary, eg according to brand/package criteria.
    var default_locations = {
        host_url: "https://spideroak.com",
        storage_login_path: "/browse/login",
        // API v1 per https://spideroak.com/apis/partners/web_storage_api:
        //(Proposed API v2: https://spideroak.com/pandora/wiki/NewJsonObjectApi)
        storage_url: "https://spideroak.com",
        storage_path: "/storage/",
        share_root: "https://spideroak.com/share/",
        storage_page_div_type: "storage-root",
        storage_folder_div_type: "storage-folder",
    };
    var my = {
        host_url: null,
        storage_path: null,
        username: null,
        storage_web_url: null,  // Hardly relevant - web UI for  user's storage.
    };
    var device_info_query = '?device_info=yes';

    /* public: */
    return {
        init: function () {
            /* No init business yet. */
            },
        remote_login: function (login_info, url) {
            var login_url;
            var server_host_url;
            if (url && (url.slice(0,4) === "http")) {
                server_host_url = url.split('/').slice(0,3).join('/');
                login_url = url
            } else {
                server_host_url = default_locations.host_url;
                login_url = (server_host_url
                             + default_locations.storage_login_path);
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
                        spideroak.set_storage_parameters(
                            login_info['username'],
                            server_host_url,
                            default_locations.storage_path,
                            match[2]);
                        spideroak.visit_storage_devices();
                    }
                },
                error: function (xhr) {
                    error_alert("SpiderOak Login", xhr.status);
                }
            });
        },
        set_storage_parameters: function (username, host_url,
                                          storage_path, storage_web_url) {
            /* Register SpiderOak instance user-specific details. */
            my.username = username;
            my.host_url = host_url;
            my.storage_path = storage_path;
            my.storage_root_url = (my.host_url
                                   + my.storage_path
                                   + b32encode_trim(username));
            my.storage_web_url = storage_web_url;
        },
        visit_storage_devices: function () {
            /* Visit the device directory, asking for detailed device info. */
            spideroak.visit_storage_node("/", device_info_query);
        },
        visit_storage_node: function (storage_path, query_string) {
            /* Focus on storage_path relative to user's storage root URL.
               storage_path must be relative to root, and begin with '/'.
               query_string, if present, is appended, for e.g. device_info. */
            var storage_url = my.storage_root_url + storage_path;
            if (typeof query_string !== 'undefined') {
                storage_url += query_string; }
            blather("visit_storage_node: " + storage_url + "\n");
            $.ajax({
                url: storage_url,
                type: 'GET',
                dataType: 'json',
                success: function (data) {
                    blather("visit_storage_node " + storage_url + " got:\n"
                          + JSON.stringify(data));
                    },
                error: function (xhr) {
                    error_alert("SpiderOak Storage Visit", xhr.status);
                },
            });
        },
    }
}();

function error_alert(purpose, status_code) {
    var msg = purpose + ": ";
    if (status_code === 401) {
        msg += 'Unauthorized.';
    } else if (status_code === 403) {
        msg += 'Incorrect username or password.';
    } else if (status_code === 404) {
        msg += 'Incorrect ShareID or RoomKey.';
    } else {
        msg += ('Temporary server failure. Please'
                + ' try again in a few minutes.');
    }
    alert(translate(msg));
}
