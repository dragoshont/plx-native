"use strict";

var assert = require("assert");
var createAuthClient = require("../../samsung/Vemm/js/plex-api.js").createAuthClient;

function response(status, payload) {
    return {
        status: status,
        ok: status >= 200 && status < 300,
        json: function () { return Promise.resolve(payload); }
    };
}

function run() {
    var now = Date.parse("2026-10-10T00:00:00Z");
    var calls = [];
    var auth = createAuthClient({
        now: function () { return now; },
        clientIdentifier: "test-client-identifier",
        fetch: function (url, options) {
            calls.push({ url: url, options: options });
            if (options.method === "POST") {
                return Promise.resolve(response(201, {
                    id: 42,
                    code: "ABCD1234",
                    qr: "https://plex.tv/api/v2/pins/42/qr",
                    expiresAt: "2026-10-10T00:05:00Z"
                }));
            }
            return Promise.resolve(response(200, { authToken: "synthetic-account-secret" }));
        }
    });

    return auth.startAuthorization().then(function (pin) {
        assert.strictEqual(pin.code, "ABCD1234");
        assert.strictEqual(pin.linkUrl, "https://plex.tv/link");
        assert.strictEqual(calls[0].url, "https://plex.tv/api/v2/pins?strong=false");
        assert.strictEqual(pin.qr, "https://plex.tv/api/v2/pins/42/qr");
        assert.strictEqual(calls[0].options.method, "POST");
        assert.strictEqual(calls[0].options.credentials, "omit");
        assert.strictEqual(calls[0].url.indexOf("synthetic-account-secret"), -1);
        return auth.pollAuthorization(pin).then(function (result) {
            assert.deepStrictEqual(result, { status: "linked", token: "synthetic-account-secret" });
            assert(calls[1].url.indexOf("?code=ABCD1234") !== -1);
            assert.strictEqual(calls[1].url.indexOf("synthetic-account-secret"), -1);
            assert.strictEqual(calls[1].options.headers["X-Plex-Client-Identifier"], "test-client-identifier");
        });
    }).then(function () {
        var noQr = createAuthClient({
            now: function () { return now; },
            fetch: function () {
                return Promise.resolve(response(201, { id: 44, code: "WXYZ", expiresIn: 900 }));
            }
        });
        return noQr.startAuthorization().then(function (pin) {
            assert.strictEqual(pin.qr, "https://plex.tv/api/v2/pins/qr/WXYZ",
                "A pin without a qr field must still show the public plex.tv QR, as LG does");
        });
    }).then(function () {
        var pin = { id: "43", code: "PEND1234", expiresAt: now + 30000 };
        var answers = [{}, { status: "denied" }, { status: "expired" }];
        var index = 0;
        var client = createAuthClient({
            now: function () { return now; },
            fetch: function () { return Promise.resolve(response(200, answers[index++])); }
        });
        return client.pollAuthorization(pin).then(function (pending) {
            assert.deepStrictEqual(pending, { status: "pending" });
            return client.pollAuthorization(pin);
        }).then(function (denied) {
            assert.deepStrictEqual(denied, { status: "denied" });
            return client.pollAuthorization(pin);
        }).then(function (expired) {
            assert.deepStrictEqual(expired, { status: "expired" });
            now += 31000;
            return client.pollAuthorization(pin).then(function (localExpired) {
                assert.deepStrictEqual(localExpired, { status: "expired" });
                assert.strictEqual(index, 3);
            });
        });
    }).then(function () {
        var client = createAuthClient({ fetch: function () { return Promise.reject(new Error("secret in transport message")); } });
        var pin = { id: "44", code: "ERRR1234", expiresAt: Date.now() + 30000 };
        return client.pollAuthorization(pin).then(function () {
            assert.fail("transport failure should reject");
        }, function (error) {
            assert.strictEqual(error.message, "Could not reach Plex. Check the network and try again.");
            assert.strictEqual(error.message.indexOf("secret"), -1);
        });
    }).then(function () {
        console.log("Tizen Plex auth tests: passed");
    });
}

run().catch(function (error) {
    console.error(error.stack || error.message);
    process.exitCode = 1;
});
