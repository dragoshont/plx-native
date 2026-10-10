"use strict";
// Favorite libraries, card context menu and video PlayQueue: the LG parity features of the Samsung
// client. Every server is synthetic; nothing here can reach a real account.
var assert = require("assert");
var favorites = require("../../samsung/PlexTv/js/favorites");
var menu = require("../../samsung/PlexTv/js/item-menu");
var api = require("../../samsung/PlexTv/js/plex-api");

function memoryStorage() {
    var data = {};
    return {
        writes: 0,
        getItem: function (key) { return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null; },
        setItem: function (key, value) { this.writes += 1; data[key] = String(value); },
        removeItem: function (key) { delete data[key]; }
    };
}

function ids(list) { return list.map(function (row) { return row.id; }); }

async function run() {
    var storage = memoryStorage();
    assert.strictEqual(favorites.load(storage, "machine-a"), null, "An unanswered server is first-run");
    assert.strictEqual(favorites.load(storage, "../bad"), null);
    assert.throws(function () { favorites.save(storage, "machine-a", []); }, /at least one/);
    assert.throws(function () { favorites.save(storage, "machine-a", ["x"]); }, /invalid/);
    assert.strictEqual(storage.writes, 0, "Rejected saves must not write");
    assert.deepStrictEqual(favorites.save(storage, "machine-a", ["2", 1, "2"]), ["2", "1"]);
    assert.deepStrictEqual(favorites.load(storage, "machine-a"), ["2", "1"]);
    assert.strictEqual(favorites.load(storage, "machine-b"), null, "Favorites are per server");
    var sections = [{ key: "1" }, { key: "2" }, { key: "3" }];
    assert.deepStrictEqual(favorites.filter(sections, null), sections);
    assert.deepStrictEqual(favorites.filter(sections, ["3"]), [{ key: "3" }]);
    assert.deepStrictEqual(favorites.filter(sections, ["9"]), sections, "A stale selection never empties Home");
    storage.setItem("plx-tizen-favorite-libraries", "{\"machine-a\":[\"x\"]}");
    assert.throws(function () { favorites.load(storage, "machine-a"); }, /invalid/);
    favorites.reset(storage);
    assert.strictEqual(favorites.load(storage, "machine-a"), null);

    assert.deepStrictEqual(menu.rows({ type: "movie" }), [], "No row without a rating key");
    assert.deepStrictEqual(ids(menu.rows({ ratingKey: "1", type: "movie" })), ["play", "watched"]);
    assert.deepStrictEqual(ids(menu.rows({ ratingKey: "1", type: "movie", viewCount: 1 })), ["play", "unwatched"]);
    var resumed = { ratingKey: "5", type: "episode", viewOffset: 9000, grandparentRatingKey: "3", parentRatingKey: "4" };
    assert.deepStrictEqual(ids(menu.rows(resumed, { deck: true, continueAction: "details" })),
        ["play", "show", "season", "watched", "unwatched", "start", "remove"]);
    assert.deepStrictEqual(ids(menu.rows(resumed, { deck: true, continueAction: "play" })),
        ["play", "details", "show", "season", "watched", "unwatched", "start", "remove"]);
    assert.strictEqual(menu.rows(resumed)[0].label, "Resume");
    var firstIds = ids(menu.rows(resumed, { deck: true }));
    assert(["watched", "unwatched", "remove"].indexOf(firstIds[0]) === -1, "A write is never the default row");
    assert.deepStrictEqual(ids(menu.rows({ ratingKey: "7", type: "show", leafCount: 4, viewedLeafCount: 2 })),
        ["watched", "unwatched"]);
    assert.deepStrictEqual(ids(menu.rows({ ratingKey: "8", type: "track" })), []);
    assert(menu.isDeckHub({ hubIdentifier: "home.continue" }));
    assert(menu.isDeckHub({ context: "hub.home.ondeck" }));
    assert(!menu.isDeckHub({ hubIdentifier: "home.movies.recent" }));

    var calls = [];
    var client = api.createClient({
        baseUrl: "https://pms.synthetic.invalid",
        token: "synthetic-server-token",
        fetch: function (url, options) {
            calls.push({ url: new URL(url), options: options });
            if (new URL(url).pathname === "/playQueues") {
                return Promise.resolve({ ok: true, status: 200, json: function () {
                    return Promise.resolve({ MediaContainer: { playQueueID: 77, playQueueSelectedItemID: 501,
                        Metadata: [{ ratingKey: "5", playQueueItemID: 501 }, { ratingKey: "6", playQueueItemID: 502 }] } });
                } });
            }
            return Promise.resolve({ ok: true, status: 200 });
        }
    });
    await assert.rejects(client.createVideoPlayQueue("bad machine", "5"), /identity/);
    assert.strictEqual(calls.length, 0);
    var queue = await client.createVideoPlayQueue("machine-a", "5");
    assert.strictEqual(calls[0].options.method, "POST");
    assert.strictEqual(calls[0].url.searchParams.get("type"), "video");
    assert.strictEqual(calls[0].url.searchParams.get("continuous"), "1");
    assert.strictEqual(calls[0].url.searchParams.get("uri"),
        "server://machine-a/com.plexapp.plugins.library/library/metadata/5");
    assert.strictEqual(queue.id, "77");
    assert.strictEqual(queue.itemId, "501");
    assert.strictEqual(queue.items.length, 2);
    var item = { ratingKey: "5", duration: 1000 };
    await client.timeline(item, 10, "playing", "session-1", queue);
    assert.strictEqual(calls[1].url.searchParams.get("playQueueID"), "77");
    assert.strictEqual(calls[1].url.searchParams.get("playQueueItemID"), "501");
    await client.timeline(item, 10, "playing", "session-1", { id: "0", itemId: "x" });
    assert.strictEqual(calls[2].url.searchParams.get("playQueueID"), null, "An invalid queue is never reported");
    await client.timeline(item, 10, "playing", "session-1");
    assert.strictEqual(calls[3].url.searchParams.get("playQueueItemID"), null);
    console.log("Tizen favorite libraries, card menu and video PlayQueue contracts: passed");
}
run().catch(function (error) { console.error(error); process.exitCode = 1; });
