(function (root, factory) {
    var api = factory();
    if (typeof module === "object" && module.exports) { module.exports = api; }
    else { root.PlexSession = api; }
}(this, function () {
    "use strict";
    var key = "plx-tizen-account";
    var preferenceKey = "plx-tizen-save-sign-in";
    function valid(token) { return typeof token === "string" && /^[!-~]{8,512}$/.test(token); }
    return {
        enabled: function (storage) {
            var value = storage.getItem(preferenceKey);
            if (value !== null && value !== "on" && value !== "off") {
                throw new Error("The saved sign-in preference is invalid.");
            }
            return value !== "off";
        },
        setEnabled: function (storage, enabled) {
            if (typeof enabled !== "boolean") { throw new Error("Invalid sign-in preference."); }
            storage.setItem(preferenceKey, enabled ? "on" : "off");
        },
        load: function (storage) {
            var text = storage.getItem(key);
            if (!text) { return ""; }
            try {
                var saved = JSON.parse(text);
                var supported = saved.version === 1 && saved.unencryptedAccepted === true ||
                    saved.version === 2 && saved.storage === "unencrypted";
                if (!supported || !valid(saved.token)) {
                    throw new Error("Invalid session");
                }
                return saved.token;
            } catch (error) {
                throw new Error("The saved Plex session is invalid. Sign out to delete it and link again.");
            }
        },
        save: function (storage, token) {
            if (!valid(token)) { throw new Error("Invalid Plex session token."); }
            storage.setItem(key, JSON.stringify({ version: 2, storage: "unencrypted", token: token }));
        },
        remember: function (storage, token, accepted) {
            if (accepted !== true || !valid(token)) {
                throw new Error("Remembering Plex requires explicit consent to unencrypted app storage.");
            }
            storage.setItem(key, JSON.stringify({ version: 1, unencryptedAccepted: true, token: token }));
        },
        forget: function (storage) { storage.removeItem(key); }
    };
}));
