/** General application user settings.
 *
 * Each entry specifies the variable name, default value, and optional
 * third element indicates that the value should be retained in secure
 * storage.
 *
 * Entry fields: ["name", "getsetter-id" "default-value"]
 *
 * See the SpiderOak.js settings_manager for details.
 */
user_settings =
    [["folder-layout", "literal", "list"],
     ["logout-on-exit", "literal", "off"],
     ["account", "secure", ""],
     ["PIN-mode", "secure", "off"],
     ["PIN", "secure", "0000"],
    ]
