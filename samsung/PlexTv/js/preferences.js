(function (root, factory) {
    var api = factory();
    if (typeof module === "object" && module.exports) { module.exports = api; }
    else { root.PlexPreferences = api; }
}(this, function () {
    "use strict";
    var key = "plx-tizen-preferences";
    var skipIntervals = [5, 10, 15, 30, 60];
    var subtitleSizes = ["small", "medium", "large"];
    var subtitlePositions = ["low", "middle", "high"];
    var subtitleColors = ["white", "yellow"];
    var subtitleDelays = [-2000, -1000, -500, 0, 500, 1000, 2000];
    function validate(value) {
        var skipInterval = value && value.skipInterval !== undefined ? value.skipInterval : 10;
        var subtitleSize = value && value.subtitleSize !== undefined ? value.subtitleSize : "medium";
        var subtitlePosition = value && value.subtitlePosition !== undefined ? value.subtitlePosition : "low";
        var subtitleColor = value && value.subtitleColor !== undefined ? value.subtitleColor : "white";
        var subtitleDelayMs = value && value.subtitleDelayMs !== undefined ? value.subtitleDelayMs : 0;
        var directPlay = value && value.directPlay !== undefined ? value.directPlay : "auto";
        if (!value || ["720", "1080"].indexOf(value.quality) === -1 ||
                ["en", "es", "be"].indexOf(value.language) === -1 || typeof value.autoNext !== "boolean" ||
                (value.continueAction !== undefined && ["details", "play"].indexOf(value.continueAction) === -1) ||
                skipIntervals.indexOf(skipInterval) === -1 || subtitleSizes.indexOf(subtitleSize) === -1 ||
                subtitlePositions.indexOf(subtitlePosition) === -1 || subtitleColors.indexOf(subtitleColor) === -1 ||
                subtitleDelays.indexOf(subtitleDelayMs) === -1 || ["auto", "off"].indexOf(directPlay) === -1) {
            throw new Error("Saved preferences are invalid. Reset app preferences in Settings.");
        }
        // Preferences saved before continueAction existed load with the safe default.
        return { quality: value.quality, language: value.language, autoNext: value.autoNext,
            continueAction: value.continueAction || "details", skipInterval: skipInterval,
            subtitleSize: subtitleSize, subtitlePosition: subtitlePosition, subtitleColor: subtitleColor,
            subtitleDelayMs: subtitleDelayMs, directPlay: directPlay };
    }
    return {
        load: function (storage) {
            var value = storage.getItem(key);
            if (!value) { return validate({ quality: "1080", language: "en", autoNext: false }); }
            try { return validate(JSON.parse(value)); }
            catch (error) { throw new Error("Saved preferences are invalid. Reset app preferences in Settings."); }
        },
        save: function (storage, value) { storage.setItem(key, JSON.stringify(validate(value))); },
        reset: function (storage) { storage.removeItem(key); }
    };
}));
