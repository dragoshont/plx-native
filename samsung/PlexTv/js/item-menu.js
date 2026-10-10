(function (root, factory) {
    var api = factory();
    if (typeof module === "object" && module.exports) { module.exports = api; }
    else { root.PlexItemMenu = api; }
}(this, function () {
    "use strict";
    // Card context menu rows, in the LG client's order (rust-modules/screens/src/item_menu.rs):
    // play first, navigation, watched state, play from start, and Remove from Continue Watching
    // last and only on a Continue Watching card. Writes are never the first row.
    var leaves = ["movie", "episode", "clip"];
    var watchable = ["movie", "episode", "show", "season"];

    function rows(item, options) {
        options = options || {};
        if (!item || !item.ratingKey) { return []; }
        var type = item.type;
        var leaf = leaves.indexOf(type) !== -1;
        var list = [];
        if (leaf) { list.push({ id: "play", label: item.viewOffset ? "Resume" : "Play" }); }
        // OK on an ordinary card, or on a Continue Watching card in "details" mode, already opens
        // the page; the row is only useful when OK plays.
        if (options.deck && options.continueAction === "play") { list.push({ id: "details", label: "Go to details" }); }
        if (type === "episode" && item.grandparentRatingKey) { list.push({ id: "show", label: "Go to show" }); }
        if (type === "episode" && item.parentRatingKey) { list.push({ id: "season", label: "Go to season" }); }
        if (watchable.indexOf(type) !== -1) {
            var partial = !!item.viewOffset || (item.viewedLeafCount > 0 && item.viewedLeafCount < item.leafCount);
            var watched = !!item.viewCount || (item.leafCount > 0 && item.viewedLeafCount === item.leafCount);
            if (!watched || partial) { list.push({ id: "watched", label: "Mark watched" }); }
            if (watched || partial) { list.push({ id: "unwatched", label: "Mark unwatched" }); }
        }
        if (leaf && item.viewOffset) { list.push({ id: "start", label: "Play from beginning" }); }
        if (options.deck && (type === "movie" || type === "episode")) {
            list.push({ id: "remove", label: "Remove from Continue Watching" });
        }
        return list;
    }

    function isDeckHub(hub) {
        var id = String(hub && (hub.hubIdentifier || hub.context || "") || "").toLowerCase();
        return id.indexOf("continue") !== -1 || id.indexOf("ondeck") !== -1;
    }

    return { rows: rows, isDeckHub: isDeckHub };
}));
