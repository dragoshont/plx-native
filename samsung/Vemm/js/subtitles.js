(function (root, factory) {
    var api = factory();
    if (typeof module === "object" && module.exports) { module.exports = api; }
    else { root.VemmSubtitles = api; }
}(this, function () {
    "use strict";
    function timestamp(value) {
        var match = /^(?:(\d{1,3}):)?(\d{2}):(\d{2})[.,](\d{3})$/.exec(value);
        if (!match || Number(match[2]) > 59 || Number(match[3]) > 59) {
            throw new Error("The subtitle contains an invalid timestamp.");
        }
        return ((Number(match[1] || 0) * 60 + Number(match[2])) * 60 + Number(match[3])) * 1000 + Number(match[4]);
    }
    var ENTITIES = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " " };
    // Cue markup (SRT/WebVTT HTML-ish tags, ASS override blocks, AVPlay's embedded text) becomes
    // plain text for textContent: line-break tags and ASS \N are newlines, every other tag goes.
    function clean(text) {
        if (typeof text !== "string") { return ""; }
        return text.replace(/\r\n?/g, "\n")
            .replace(/<\s*\/?\s*br\s*\/?\s*>/gi, "\n")
            .replace(/\\[Nn]/g, "\n").replace(/\\h/g, " ")
            .replace(/<[^>]*>/g, "").replace(/\{[^}]*\}/g, "")
            .replace(/&(#\d{1,6}|#x[0-9a-f]{1,6}|[a-z]+);/gi, function (whole, name) {
                if (name.charAt(0) === "#") {
                    var code = name.charAt(1).toLowerCase() === "x" ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
                    return code > 0 && code < 0x110000 ? String.fromCharCode(code) : whole;
                }
                return Object.prototype.hasOwnProperty.call(ENTITIES, name.toLowerCase()) ? ENTITIES[name.toLowerCase()] : whole;
            })
            .split("\n").map(function (line) { return line.trim(); })
            .filter(function (line) { return line !== ""; }).join("\n");
    }
    function parse(text) {
        if (typeof text !== "string" || text.length > 2 * 1024 * 1024) {
            throw new Error("The subtitle exceeds the text size limit.");
        }
        var blocks = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").split(/\n\s*\n/);
        var cues = [];
        blocks.forEach(function (block) {
            var lines = block.split("\n");
            var index = lines[0].indexOf("-->") !== -1 ? 0 : 1;
            if (/^(WEBVTT|NOTE|STYLE|REGION)/.test(lines[0])) { return; }
            if (!lines[index] || lines[index].indexOf("-->") === -1) { return; }
            var times = lines[index].split(/\s+-->\s+/);
            if (times.length !== 2) { throw new Error("The subtitle contains an invalid cue."); }
            var start = timestamp(times[0].trim());
            var end = timestamp(times[1].split(/\s+/)[0]);
            if (end <= start) { throw new Error("The subtitle contains an invalid cue range."); }
            cues.push({ start: start, end: end, text: clean(lines.slice(index + 1).join("\n")) });
            if (cues.length > 20000) { throw new Error("The subtitle exceeds the cue limit."); }
        });
        if (!cues.length) { throw new Error("No SRT or WebVTT cues were found. Use server-rendered subtitles instead."); }
        cues.sort(function (a, b) { return a.start - b.start; });
        return cues;
    }
    function at(cues, position) {
        var low = 0;
        var high = cues.length - 1;
        while (low <= high) {
            var mid = Math.floor((low + high) / 2);
            if (cues[mid].start <= position) { low = mid + 1; } else { high = mid - 1; }
        }
        var text = [];
        for (var i = high; i >= Math.max(0, high - 10); i -= 1) {
            if (cues[i].start <= position && position < cues[i].end) { text.unshift(cues[i].text); }
        }
        return text.join("\n");
    }
    return { parse: parse, at: at, clean: clean };
}));
