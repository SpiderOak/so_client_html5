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
    var storage_root_path;
    var storage_root_page = "storage-root";
    var storage_folder_page = "storage-folder";

    /* public: */
    return {
        init: function () {
            /* No init business yet. */
            },
        remote_login: function (login_info, url) {
            var login_url;
            if (url && (url.slice(0,4) == "http")) {
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
                    } else if (match[1] == 'login') {
                        spideroak.remote_login(login_info, match[2]);
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
                type: 'GET',
                dataType: 'json',
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
                    } else if (xhr.status == 405) {
                        /* XXX Elaborate. */
                        alert(translate('Whoops - method not allowed.'));
                    } else {
                        alert(translate('Temporary server failure. Please'
                                        + ' try again in a few minutes.'));
                    }
                }
            });
        }
    }
}();
