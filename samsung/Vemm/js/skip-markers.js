(function (root, factory) {
    var api = factory();
    if (typeof module === "object" && module.exports) { module.exports = api; }
    else { root.VemmSkipMarkers = api; }
}(this, function () {
    "use strict";
    // The on-screen Skip Intro / Skip Credits prompt, with the LG client's rules
    // (rust-modules/data/src/metadata.rs `marker_at`, rust-modules/appkit/src/skip_pill.rs):
    // only intro and credits markers count; the playhead is inside a marker from its start up to
    // (not including) its end, except that a `final` credits marker runs to the end of the item;
    // skipping an ordinary marker seeks to its end, skipping a `final` credits marker finishes
    // the item; and a marker the viewer already skipped does not come back, because the seek
    // lands on a keyframe that is usually still inside it.
    function isFinal(marker) {
        var value = marker && marker["final"];
        return value === true || value === 1 || value === "1" || value === "true";
    }

    function key(marker) { return marker.type + ":" + Number(marker.startTimeOffset); }

    function markerAt(markers, positionMs, skipped) {
        var list = markers || [];
        for (var index = 0; index < list.length; index += 1) {
            var marker = list[index];
            if (!marker || (marker.type !== "intro" && marker.type !== "credits")) { continue; }
            var start = Number(marker.startTimeOffset);
            var end = Number(marker.endTimeOffset);
            if (!isFinite(start)) { continue; }
            var finalCredits = marker.type === "credits" && isFinal(marker);
            if (!finalCredits && !(isFinite(end) && end > start)) { continue; }
            if (positionMs >= start && (finalCredits || positionMs < end) &&
                    !(skipped && skipped[key(marker)])) {
                return marker;
            }
        }
        return null;
    }

    function prompt(marker) {
        if (!marker) { return null; }
        return {
            key: key(marker),
            label: marker.type === "intro" ? "Skip Intro" : "Skip Credits",
            action: marker.type === "credits" && isFinal(marker) ? "finish" : "seek",
            target: Number(marker.endTimeOffset)
        };
    }

    return { markerAt: markerAt, prompt: prompt, key: key };
}));
