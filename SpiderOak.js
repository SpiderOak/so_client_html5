/* SpiderOak html5 client Main app.

 * Uses:
 * - jquery.mobile-1.0.1.min.css
 * - jquery-1.6.4.min.js
 * - jquery.mobile-1.0.1.min.js
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
    /* "?callback=" is automatically included if $.ajax(dataType: 'jsonp') */
    var server_host_url = "https://spideroak.com";
    var storage_login_path = "/storage/%s/login";
    var storage_root_path;
    /* XXX storage_node_page will likely branch to _root_ / _folder_ versions */
    var storage_root_page = "storage-root";
    var storage_folder_page = "storage-folder";

    /* public: */
    return {
        init: function () {
            /* Nothing, yet. */
            },
        remote_login: function (login_info, url) {
            var url = url || (server_host_url + storage_login_path)
            var login_url = url.replace(/%s/,
                                        b32encode_trim(login_info['username']));
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
                    } else if (match[1] == 'login') {
                        /* XXX Must confirm pong case. */
                        // Relay to other server - pong.
                        remote_login(login_info, match[2]);
                    } else {
                        // Browser haz auth cookies, we haz relative location.
                        storage_root_path = match[2];
                        spideroak.visit_storage_node(server_host_url,
                                                storage_root_path);
                    }
                },
                error: function (xhr) {
                    if (xhr.status == 403) {
                        alert(translate('Incorrect username or password.'));
                    } else if (xhr.status == 404) {
                        alert(translate('Incorrect ShareID or RoomKey.'));
                    } else {
                        alert(translate('Temporary server failure. Please'
                                        + ' try again in a few minutes.'));
                    }
                }
            });
        },
        visit_storage_node: function (storage_host_url, storage_path) {
            alert("visit_storage_node:\n   host: "
                  + storage_host_url + "\n   path: " + storage_path);
            $.ajax({
                url: storage_host_url + storage_path,
                type: 'POST',
                dataType: 'text',
                success: function (data) {
                    alert(storage_host_url + storage_path + " data:\n"
                          + data);
                    },
                error: function (xhr) {
                    if (xhr.status == 403) {
                        /* XXX Elaborate. */
                        alert(translate('403'));
                    } else if (xhr.status == 404) {
                        /* XXX Elaborate. */
                        alert(translate('404'));
                    } else {
                        alert(translate('Temporary server failure. Please'
                                        + ' try again in a few minutes.'));
                    }
                }
            });
        }
    }
}();
