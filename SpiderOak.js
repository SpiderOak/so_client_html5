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
    var default_server_host_url = "https://spideroak.com";
    var server_host_url;
    var storage_login_path = "/browse/login";
    var storage_path;
    // API v1 (per https://spideroak.com/apis/partners/web_storage_api)
    var storage_root = "https://spideroak.com/storage/";
    var share_root = "https://spideroak.com/share/";
    // Proposed API v2 (per https://spideroak.com/pandora/wiki/NewJsonObjectApi)
    //var storage_root = "https://spideroak.com/webapi2/storage/";
    //var share_root = "https://spideroak.com/webapi2/share/";
    //var mobile_root = "https://spideroak.com/webapi2/mobile/";
    var storage_root_user;
    var share_root_user;
    var storage_root_page_type = "storage-root";
    var storage_folder_page_type = "storage-folder";
    var device_info_query = '?device_info=yes';

    /* public: */
    return {
        init: function () {
            /* No init business yet. */
            },
        remote_login: function (login_info, url) {
            var login_url;
            if (url && (url.slice(0,4) === "http")) {
                server_host_url = url.split('/').slice(0,3).join('/');
                login_url = url
            } else {
                server_host_url = default_server_host_url;
                login_url = server_host_url + storage_login_path;
            }
            $.ajax({
                url: login_url,
                type: 'POST',
                dataType: 'text',
                data: login_info,
                success: function (data) {
                    var match = data.match(/^(login|location):(.+)$/m);
                    if (!match) {
                        alert(translate('Temporary server failure. Please'
                                        + ' try again in a few minutes.'));
                    } else if (match[1] === 'login') {
                        if (match[2].charAt(0) === "/") {
                            login_url = server_host_url + match[2];
                        } else {
                            login_url = match[2];
                        }
                        spideroak.remote_login(login_info, login_url);
                    } else {
                        // Browser haz auth cookies, we haz relative location.
                        storage_path = match[2];
                        spideroak.set_storage_user(login_info['username']);
                        spideroak.visit_storage_devices();
                    }
                },
                error: function (xhr) {
                    error_alert("SpiderOak Login", xhr);
                }
            });
        },
        set_storage_user: function (username) {
            /* Associate the username with the SpiderOak instance. */
            storage_root_user = storage_root + b32encode_trim(username) + "/";
        },
        visit_storage_devices: function () {
            /* Visit the device directory, asking for detailed device info. */
            spideroak.visit_storage_node("", device_info_query);
        },
        visit_storage_node: function (storage_path, query) {
            var storage_url = storage_root_user + storage_path
            if (typeof query !== 'undefined') { storage_url += query; }
            alert("visit_storage_node: " + storage_url + "\n");
            $.ajax({
                url: storage_url,
                type: 'GET',
                dataType: 'json',
                success: function (data) {
                    alert("visit_storage_node " + storage_url + " got:\n"
                          + JSON.stringify(data));
                    },
                error: function (xhr) {
                    error_alert("SpiderOak Storage Visit", xhr);
                },
            });
        },
    }
}();

function error_alert(purpose, xhr) {
    var msg = purpose + ": ";
    if (xhr.status === 401) {
        msg += 'Unauthorized.';
    } else if (xhr.status === 403) {
        msg += 'Incorrect username or password.';
    } else if (xhr.status === 404) {
        msg += 'Incorrect ShareID or RoomKey.';
    } else {
        msg += ('Temporary server failure. Please'
                + ' try again in a few minutes.');
    }
    alert(translate(msg));
}
