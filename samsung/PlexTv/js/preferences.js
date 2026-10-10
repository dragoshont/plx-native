(function (root, factory) {
    var api = factory();
    if (typeof module === "object" && module.exports) { module.exports = api; }
    else { root.PlexPreferences = api; }
}(this, function () {
    "use strict";
    var key = "plx-tizen-preferences";
    function validate(value) {
        if (!value || ["720", "1080"].indexOf(value.quality) === -1 ||
                ["en", "es", "be"].indexOf(value.language) === -1 || typeof value.autoNext !== "boolean" ||
                (value.continueAction !== undefined && ["details", "play"].indexOf(value.continueAction) === -1)) {
            throw new Error("Saved preferences are invalid. Reset app preferences in Settings.");
        }
        // Preferences saved before continueAction existed load with the safe default.
        return { quality: value.quality, language: value.language, autoNext: value.autoNext,
            continueAction: value.continueAction || "details" };
    }
    return {
        load: function (storage) {
            var value = storage.getItem(key);
            if (!value) { return { quality: "1080", language: "en", autoNext: false, continueAction: "details" }; }
            try { return validate(JSON.parse(value)); }
            catch (error) { throw new Error("Saved preferences are invalid. Reset app preferences in Settings."); }
        },
        save: function (storage, value) { storage.setItem(key, JSON.stringify(validate(value))); },
        reset: function (storage) { storage.removeItem(key); }
    };
}));
