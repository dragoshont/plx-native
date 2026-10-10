(function (root, factory) {
    var api = factory();
    if (typeof module === "object" && module.exports) { module.exports = api; }
    else { root.PlexRecents = api; }
}(this, function () {
    "use strict";
    // Recent Search terms per profile, newest first, matching the LG client's policy
    // (rust-modules/data/src/search/recents.rs): trimmed, case-insensitive de-duplication with the
    // newest spelling kept, and four terms. Storage failure degrades to no history, never an error.
    var key = "plx-tizen-recent-searches";
    var cap = 4;
    var profilePattern = /^[0-9A-Za-z_-]{1,80}$/;

    function usable(term) {
        return typeof term === "string" && term.length > 0 && term.length <= 200 && term.indexOf("\u0000") === -1;
    }
    function sanitize(raw) {
        var out = [];
        (Array.isArray(raw) ? raw : []).forEach(function (term) {
            if (typeof term !== "string" || out.length === cap) { return; }
            term = term.trim();
            if (!usable(term)) { return; }
            var lower = term.toLowerCase();
            if (out.some(function (seen) { return seen.toLowerCase() === lower; })) { return; }
            out.push(term);
        });
        return out;
    }
    function readAll(storage) {
        var value = null;
        try { value = JSON.parse(storage.getItem(key) || "{}"); } catch (error) { value = null; }
        if (!value || typeof value !== "object" || Array.isArray(value)) { return {}; }
        var clean = {};
        Object.keys(value).forEach(function (profile) {
            if (profilePattern.test(profile)) {
                var terms = sanitize(value[profile]);
                if (terms.length) { clean[profile] = terms; }
            }
        });
        return clean;
    }
    function writeAll(storage, all) {
        try {
            if (Object.keys(all).length) { storage.setItem(key, JSON.stringify(all)); }
            else { storage.removeItem(key); }
        } catch (error) { return false; }
        return true;
    }

    return {
        cap: cap,
        load: function (storage, profile) {
            if (!profilePattern.test(String(profile || ""))) { return []; }
            var all = readAll(storage);
            return Object.prototype.hasOwnProperty.call(all, profile) ? all[profile].slice() : [];
        },
        remember: function (storage, profile, term) {
            term = typeof term === "string" ? term.trim() : "";
            if (!profilePattern.test(String(profile || "")) || !usable(term)) { return false; }
            var all = readAll(storage);
            var lower = term.toLowerCase();
            all[profile] = [term].concat((all[profile] || []).filter(function (seen) {
                return seen.toLowerCase() !== lower;
            })).slice(0, cap);
            return writeAll(storage, all);
        },
        clear: function (storage, profile) {
            if (!profilePattern.test(String(profile || ""))) { return false; }
            var all = readAll(storage);
            delete all[profile];
            return writeAll(storage, all);
        },
        reset: function (storage) {
            try { storage.removeItem(key); } catch (error) { return false; }
            return true;
        }
    };
}));
