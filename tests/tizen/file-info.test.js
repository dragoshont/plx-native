"use strict";
var assert = require("assert");
var fileInfo = require("../../samsung/Vemm/js/file-info");

var rows = fileInfo.rows({
    Media: [
        {
            videoCodec: "hevc", videoProfile: "main 10", videoResolution: "4k",
            width: 3840, height: 2160, aspectRatio: 1.78, container: "mkv", bitrate: 25000,
            Part: [{
                container: "mkv", size: "5368709120", Stream: [
                    { streamType: 1, codec: "hevc", profile: "main 10", frameRate: "23.976",
                        width: 3840, height: 2160, bitDepth: 10, chromaSubsampling: "4:2:0",
                        DOVIPresent: true, DOVIProfile: 8 },
                    { streamType: 2, codec: "eac3", profile: "dolby digital plus + dolby atmos",
                        channels: 6, audioChannelLayout: "5.1(side)", bitrate: 768 },
                    { streamType: 3, codec: "srt", language: "English", forced: 0 }
                ]
            }]
        }
    ]
}).map(function (row) {
    return row.version + "/" + (row.trackType ? row.trackType + " " + row.track + "/" : "") +
        row.label + ": " + row.value;
});

assert(rows.some(function (row) { return row.indexOf("1/Resolution: 4k") === 0; }));
assert(rows.some(function (row) { return row.indexOf("1/File bitrate: 25.0 Mbps") === 0; }));
assert(rows.some(function (row) { return row.indexOf("1/Video 1/DOVIProfile: 8") !== -1; }));
assert(rows.some(function (row) { return row.indexOf("1/Audio 1/Profile: dolby digital plus + dolby atmos") !== -1; }));
assert(rows.some(function (row) { return row.indexOf("1/Subtitle 1/Language: English") !== -1; }));
assert(rows.some(function (row) { return row.indexOf("1/Subtitle 1/Forced: 0") !== -1; }));
assert(!rows.some(function (row) { return row.indexOf("Not reported") !== -1; }),
    "Unreported server facts must not be presented as known negatives");
assert.deepStrictEqual(fileInfo.rows({ Media: [] }), []);
assert.deepStrictEqual(fileInfo.rows({}), []);
console.log("Tizen read-only file information tests: passed");
