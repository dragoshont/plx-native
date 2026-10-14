"use strict";

var assert = require("assert");
var createClient = require("../../samsung/Vemm/js/plex-api.js").createClient;

function response(status, payload) {
    return {
        status: status,
        ok: status >= 200 && status < 300,
        json: function () {
            return Promise.resolve(payload);
        }
    };
}

function run() {
    var calls = [];
    var client = createClient({
        baseUrl: "http://localhost:32400/",
        token: "synthetic-test-token",
        fetch: function (url, options) {
            calls.push({ url: url, options: options });
            if (url === "http://localhost:32400/library/sections") {
                return Promise.resolve(response(200, {
                    MediaContainer: {
                        size: 1,
                        Directory: [{ key: "1", title: "Movies", type: "movie" }]
                    }
                }));
            }
            if (url.indexOf("/hubs/promoted") !== -1) {
                return Promise.resolve(response(200, {
                    MediaContainer: {
                        size: 1,
                        Hub: [{ title: "Continue Watching", Metadata: [] }]
                    }
                }));
            }
            return Promise.resolve(response(200, {
                MediaContainer: {
                    offset: 0,
                    totalSize: 51,
                    Metadata: [{ ratingKey: "10", title: "Movie" }]
                }
            }));
        }
    });

    return client.getSections().then(function (sections) {
        assert.strictEqual(sections.length, 1);
        assert.strictEqual(sections[0].key, "1");
        assert.strictEqual(calls[0].options.headers["X-Plex-Token"], "synthetic-test-token");
        assert.strictEqual(calls[0].options.headers.Accept, "application/json");
        assert.strictEqual(calls[0].url.indexOf("synthetic-test-token"), -1);
        return client.getHomeHubs();
    }).then(function (hubs) {
        assert.strictEqual(hubs[0].title, "Continue Watching");
        return client.getSectionItems("1", 0, 50);
    }).then(function (page) {
        assert.strictEqual(page.items[0].ratingKey, "10");
        assert.strictEqual(page.totalSize, 51);
        assert.strictEqual(calls[calls.length - 1].url,
            "http://localhost:32400/library/sections/1/all?X-Plex-Container-Start=0&X-Plex-Container-Size=50");
        return client.getMetadata("10").then(function () {
            assert(new URL(calls[calls.length - 1].url).searchParams.get("includeOnDeck") === "1",
                "Show detail must request the server-selected episode");
        }).then(function () {
            return client.getSectionItems("../identity", 0, 50);
        }).then(function () {
            assert.fail("invalid section key should reject");
        }, function (error) {
            assert.match(error.message, /section key is invalid/);
        });
    }).then(function () {
        var failingClient = createClient({
            baseUrl: "https://pms.example.invalid",
            token: "synthetic-test-token",
            fetch: function () {
                return Promise.resolve(response(401, { error: "Unauthorized" }));
            }
        });
        return failingClient.getSections().then(function () {
            assert.fail("HTTP failure should reject");
        }, function (error) {
            assert.match(error.message, /HTTP 401/);
            assert.strictEqual(error.message.indexOf("synthetic-test-token"), -1);
        });
    }).then(function () {
        assert.throws(function () {
            createClient({
                baseUrl: "https://user:password@pms.example.invalid",
                fetch: function () {}
            });
        }, /PMS origin/);
        console.log("Tizen Plex API tests: passed");
    });
}

run().catch(function (error) {
    console.error(error.stack || error.message);
    process.exitCode = 1;
});
