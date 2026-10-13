(function () {
    "use strict";
    var capture = window.graphicsBenchmarkCapture;
    var art = window.graphicsBenchmarkArtwork;
    if (!Array.isArray(art) || art.length !== 4) { throw new Error("Synthetic artwork must be staged first."); }
    function blob(index, encoded) {
        var raw = atob(encoded || art[index % art.length]), bytes = new Uint8Array(raw.length);
        for (var i = 0; i < raw.length; i += 1) { bytes[i] = raw.charCodeAt(i); }
        return new Blob([bytes], { type: "image/png" });
    }
    var blobs = art.map(function (value, index) { return blob(index); });
    var cardBlob = blob(0, window.graphicsBenchmarkCardArtwork);
    var items = [];
    for (var i = 0; i < 12; i += 1) {
        items.push({ ratingKey: String(i + 1), type: "movie", title: "Synthetic title " + (i + 1),
            art: "/synthetic/art/" + (i % 4), thumb: "/synthetic/art/" + (i % 4),
            summary: "Original synthetic artwork and metadata. No household server or playback.",
            year: 2026, duration: 600000, contentRating: "Synthetic" });
    }
    function lookup(id) {
        var found = items.filter(function (item) { return item.ratingKey === String(id); })[0];
        if (!found) { throw new Error("Unknown synthetic metadata key."); }
        return found;
    }
    var client = {
        cancelRequests: function () {},
        getSections: function () { return Promise.resolve([]); },
        getHomeHubs: function () { return Promise.resolve([
            { title: "Recently Added Movies", Metadata: items },
            { title: "Recently Added Movies 2", Metadata: items.slice().reverse() }
        ]); },
        getMetadata: function (id) { return Promise.resolve(lookup(id)); },
        image: function (path, size) {
            var match = /^\/synthetic\/art\/([0-3])$/.exec(path);
            if (!match) { throw new Error("Unexpected synthetic image request."); }
            return Promise.resolve(size && size.width < 1280 ? cardBlob : blobs[Number(match[1])]);
        }
    };
    function noPlayback() {
        capture.playbackAttempts += 1;
        throw new Error("Account-free benchmark refuses playback and account mutations.");
    }
    window.PlexApi = {
        createClient: function (options) {
            if (options.baseUrl !== "https://benchmark.synthetic.invalid" || options.token) {
                throw new Error("Only the inert synthetic manual connection is permitted.");
            }
            return client;
        },
        createAuthClient: function () { throw new Error("Account sign-in is disabled in this synthetic benchmark."); },
        createAccountClient: noPlayback,
        selectServer: noPlayback
    };
    window.PlexPlayback = { create: noPlayback };
    window.PlexAvplay = { create: noPlayback };
    var graphics = window.PlexGraphics.create;
    window.PlexGraphics.create = function (options) {
        var api = graphics(options);
        ["present", "clear", "setEnabled", "dispose"].forEach(function (method) {
            var original = api[method];
            api[method] = function () {
                var start = performance.now();
                try { return original.apply(api, arguments); }
                finally {
                    capture.calls.push({ operation: capture.operation, method: method,
                        durationMs: performance.now() - start, status: api.status() });
                }
            };
        });
        return api;
    };
}());
