/** General application user settings.
 *
 * Each entry specifies the variable name, default value, and optional
 * third element indicates that the value should be retained in secure
 * storage.
 *
 * Entry fields:
 *
 *   ["name", "getsetter-id", "default-val", "pretty-default-val"]
 *
 * See the SpiderOak.js settings_manager for details.
 */
user_settings =
    [[null, "literal", "", ""],                 // Default, for ad-hoc settings.
     ["folder-layout", "literal", "list", "List"],
     ["logout-on-exit", "literal", "off", "Off"],
     ["account", "secure", ""],
     ["PIN-mode", "literal", "off", "Off"],
     ["PIN", "secure", "", "None"],
    ]
