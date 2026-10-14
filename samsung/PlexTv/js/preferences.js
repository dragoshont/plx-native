(function (root, factory) {
    var api = factory();
    if (typeof module === "object" && module.exports) { module.exports = api; }
    else { root.PlexPreferences = api; }
}(this, function () {
    "use strict";
    var key = "plx-tizen-preferences";
    var skipIntervals = [5, 10, 15, 30, 60];
    // The LG client's ladders (rust-modules/plex/src/plex/session.rs): quality rungs with its
    // bitrate ceilings, Direct Play Auto/Force/Off, Next episode Countdown/After credits/Off,
    // subtitle sizes up to extra large and its grey tones (plus the yellow earlier builds saved).
    var qualities = ["original", "1080h", "1080", "720", "720l", "480"];
    var directPlayModes = ["auto", "force", "off"];
    var nextEpisodeModes = ["countdown", "after_credits", "off"];
    var subtitleSizes = ["small", "medium", "large", "extra_large"];
    var subtitlePositions = ["low", "middle", "high"];
    var subtitleColors = ["white", "grey_85", "grey_70", "grey_55", "grey_40", "grey_28", "yellow"];
    // Off is the LG look (outlined text); On adds a dark box behind the line.
    var subtitleBackgrounds = ["off", "on"];
    var subtitleDelayMinMs = -60000;
    var subtitleDelayMaxMs = 60000;
    function validate(value) {
        var skipInterval = value && value.skipInterval !== undefined ? value.skipInterval : 10;
        var subtitleSize = value && value.subtitleSize !== undefined ? value.subtitleSize : "medium";
        var subtitlePosition = value && value.subtitlePosition !== undefined ? value.subtitlePosition : "low";
        var subtitleColor = value && value.subtitleColor !== undefined ? value.subtitleColor : "white";
        var subtitleBackground = value && value.subtitleBackground !== undefined ? value.subtitleBackground : "off";
        var subtitleDelayMs = value && value.subtitleDelayMs !== undefined ? value.subtitleDelayMs : 0;
        var directPlay = value && value.directPlay !== undefined ? value.directPlay : "auto";
        var enhancedGraphics = value && value.enhancedGraphics !== undefined ? value.enhancedGraphics : false;
        // Builds before the Next episode choice saved only an on/off auto-play flag.
        var nextEpisode = value && value.nextEpisode !== undefined ? value.nextEpisode :
            (value && value.autoNext === false ? "off" : "countdown");
        if (!value || qualities.indexOf(value.quality) === -1 ||
                ["en", "es", "be"].indexOf(value.language) === -1 ||
                (value.autoNext !== undefined && typeof value.autoNext !== "boolean") ||
                nextEpisodeModes.indexOf(nextEpisode) === -1 ||
                (value.continueAction !== undefined && ["details", "play"].indexOf(value.continueAction) === -1) ||
                skipIntervals.indexOf(skipInterval) === -1 || subtitleSizes.indexOf(subtitleSize) === -1 ||
                subtitlePositions.indexOf(subtitlePosition) === -1 || subtitleColors.indexOf(subtitleColor) === -1 ||
                subtitleBackgrounds.indexOf(subtitleBackground) === -1 ||
                typeof subtitleDelayMs !== "number" || !isFinite(subtitleDelayMs) ||
                Math.floor(subtitleDelayMs) !== subtitleDelayMs || subtitleDelayMs % 100 !== 0 ||
                subtitleDelayMs < subtitleDelayMinMs || subtitleDelayMs > subtitleDelayMaxMs ||
                directPlayModes.indexOf(directPlay) === -1 || typeof enhancedGraphics !== "boolean") {
            throw new Error("Saved preferences are invalid. Reset app preferences in Settings.");
        }
        // Preferences saved before continueAction existed load with the safe default.
        return { quality: value.quality, language: value.language, nextEpisode: nextEpisode,
            continueAction: value.continueAction || "details", skipInterval: skipInterval,
            subtitleSize: subtitleSize, subtitlePosition: subtitlePosition, subtitleColor: subtitleColor,
            subtitleBackground: subtitleBackground, subtitleDelayMs: subtitleDelayMs, directPlay: directPlay,
            enhancedGraphics: enhancedGraphics };
    }
    return {
        load: function (storage) {
            var value = storage.getItem(key);
            if (!value) { return validate({ quality: "original", language: "en", nextEpisode: "countdown" }); }
            try { return validate(JSON.parse(value)); }
            catch (error) { throw new Error("Saved preferences are invalid. Reset app preferences in Settings."); }
        },
        save: function (storage, value) { storage.setItem(key, JSON.stringify(validate(value))); },
        reset: function (storage) { storage.removeItem(key); },
        qualities: qualities.slice(), directPlayModes: directPlayModes.slice(),
        nextEpisodeModes: nextEpisodeModes.slice(), subtitleSizes: subtitleSizes.slice(),
        subtitleColors: subtitleColors.slice(), subtitleBackgrounds: subtitleBackgrounds.slice()
    };
}));
