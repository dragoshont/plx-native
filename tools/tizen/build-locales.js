"use strict";
var fs = require("fs");
var path = require("path");
var root = path.resolve(__dirname, "../..");
var catalogs = { es: {}, be: {} };
["core", "settings", "widgets", "browse"].forEach(function (name) {
    var english = JSON.parse(fs.readFileSync(path.join(root, "samsung/locales/en", name + ".json"), "utf8"));
    Object.keys(catalogs).forEach(function (language) {
        var translated = JSON.parse(fs.readFileSync(path.join(root, "samsung/locales", language, name + ".json"), "utf8"));
        Object.keys(english).forEach(function (key) {
            var source = english[key].value;
            var legacy = /PlxNative|plxnative\.com/i;
            if (typeof source === "string" && typeof translated[key] === "string" &&
                    source.indexOf("{") === -1 && !legacy.test(source) && !legacy.test(translated[key])) {
                catalogs[language][source] = translated[key];
            }
        });
    });
});
var additions = JSON.parse(fs.readFileSync(path.join(root, "samsung/strings.json"), "utf8"));
Object.keys(additions).forEach(function (source) {
    Object.keys(catalogs).forEach(function (language) {
        if (typeof additions[source][language] !== "string") { throw new Error("Missing translation: " + source); }
        catalogs[language][source] = additions[source][language];
    });
});
var output = "(function (root) {\n    \"use strict\";\n    var catalogs = " + JSON.stringify(catalogs) +
    ";\n    var language = \"en\";\n    root.VemmI18n = {\n" +
    "        setLanguage: function (value) { language = value === \"es\" || value === \"be\" ? value : \"en\"; },\n" +
    "        has: function (value) { return language === \"en\" || Object.prototype.hasOwnProperty.call(catalogs[language], value); },\n" +
    "        error: function (error) {\n" +
    "            var message = String(error && error.message || error || \"Playback failed. Stop and retry.\");\n" +
    "            var http = /(?:HTTP )(\\d{3})/.exec(message);\n" +
    "            if (http) { return this.text(\"Request failed (HTTP {status}). Retry when the service is reachable.\", { status: http[1] }); }\n" +
    "            if (this.has(message)) { return this.text(message); }\n" +
    "            return this.text(\"Something went wrong. Check the connection and retry.\");\n" +
    "        },\n" +
    "        text: function (value, values) {\n" +
    "            var text = catalogs[language] && catalogs[language][value] || value;\n" +
    "            return text.replace(/\\{([A-Za-z0-9]+)\\}/g, function (match, key) {\n" +
    "                return values && Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match;\n" +
    "            });\n" +
    "        }\n" +
    "    };\n}(this));\n";
var target = path.join(root, "samsung/Vemm/js/i18n.js");
if (process.argv[2] === "--write") { fs.writeFileSync(target, output); }
else if (!fs.existsSync(target) || fs.readFileSync(target, "utf8") !== output) {
    throw new Error("Tizen translations are stale. Run node tools/tizen/build-locales.js --write.");
}
