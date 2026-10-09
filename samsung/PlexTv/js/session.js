(function (root, factory) {
    var api = factory();
    if (typeof module === "object" && module.exports) { module.exports = api; }
    else { root.PlexSession = api; }
}(this, function () {
    "use strict";
    var key = "plx-tizen-account";
    function valid(token) { return typeof token === "string" && /^[!-~]{8,512}$/.test(token); }
    return {
        load: function (storage) {
            var text = storage.getItem(key);
            if (!text) { return ""; }
            try {
                var saved = JSON.parse(text);
                if (saved.version !== 1 || saved.unencryptedAccepted !== true || !valid(saved.token)) {
                    throw new Error("Invalid session");
                }
                return saved.token;
            } catch (error) {
                throw new Error("The saved Plex session is invalid. Sign out to delete it and link again.");
            }
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
