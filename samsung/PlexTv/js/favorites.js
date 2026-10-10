(function (root, factory) {
    var api = factory();
    if (typeof module === "object" && module.exports) { module.exports = api; }
    else { root.PlexFavorites = api; }
}(this, function () {
    "use strict";
    // Favorite libraries, per server machine identifier. A server with no entry has never been
    // answered (first-run page); an entry is the explicit list of section keys the viewer kept.
    var key = "plx-tizen-favorite-libraries";
    var serverPattern = /^[0-9A-Za-z_-]{1,80}$/;
    var sectionPattern = /^[0-9]{1,10}$/;

    function readAll(storage) {
        var raw = storage.getItem(key);
        if (!raw) { return {}; }
        var value;
        try { value = JSON.parse(raw); } catch (error) { value = null; }
        if (!value || typeof value !== "object" || Array.isArray(value)) {
            throw new Error("Saved favorite libraries are invalid. Reset app preferences in Settings.");
        }
        var clean = {};
        Object.keys(value).forEach(function (server) {
            var keys = value[server];
            if (!serverPattern.test(server) || !Array.isArray(keys) || !keys.length || keys.length > 200 ||
                    keys.some(function (entry) { return typeof entry !== "string" || !sectionPattern.test(entry); })) {
                throw new Error("Saved favorite libraries are invalid. Reset app preferences in Settings.");
            }
            clean[server] = keys.slice();
        });
        return clean;
    }

    return {
        load: function (storage, server) {
            if (!serverPattern.test(String(server || ""))) { return null; }
            var all = readAll(storage);
            return Object.prototype.hasOwnProperty.call(all, server) ? all[server] : null;
        },
        save: function (storage, server, keys) {
            if (!serverPattern.test(String(server || ""))) { throw new Error("The server identity is invalid."); }
            if (!Array.isArray(keys) || !keys.length) { throw new Error("Keep at least one library."); }
            var unique = [];
            keys.forEach(function (entry) {
                var text = String(entry);
                if (!sectionPattern.test(text)) { throw new Error("The library section key is invalid."); }
                if (unique.indexOf(text) === -1) { unique.push(text); }
            });
            var all = readAll(storage);
            all[server] = unique.slice(0, 200);
            var servers = Object.keys(all);
            if (servers.length > 50) { delete all[servers[0] === server ? servers[1] : servers[0]]; }
            storage.setItem(key, JSON.stringify(all));
            return all[server];
        },
        // Sections the viewer kept; an unanswered server (null) shows everything. A kept key the
        // server no longer returns is ignored, and if none survive every library is shown rather
        // than an empty Home.
        filter: function (sections, keys) {
            if (!keys) { return sections.slice(); }
            var kept = sections.filter(function (section) { return keys.indexOf(String(section.key)) !== -1; });
            return kept.length ? kept : sections.slice();
        },
        reset: function (storage) { storage.removeItem(key); }
    };
}));
