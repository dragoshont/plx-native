"use strict";
var fs = require("fs");
var path = require("path");
var acorn;
try { acorn = require("../../tests/tizen/node_modules/acorn"); }
catch (error) {
    console.error("Install declared Tizen host-test dependencies: npm ci --prefix tests/tizen --ignore-scripts");
    process.exit(1);
}
var count = 0;
function check(directory) {
    fs.readdirSync(directory).sort().forEach(function (name) {
        if (name.charAt(0) === "." || name === "node_modules") { return; }
        var file = path.join(directory, name);
        if (fs.statSync(file).isDirectory()) { check(file); }
        else if (name.endsWith(".js")) {
            try { acorn.parse(fs.readFileSync(file, "utf8"), { ecmaVersion: 5, sourceType: "script" }); }
            catch (error) { console.error(file + ": " + error.message); process.exitCode = 1; }
            count += 1;
        }
    });
}
check(path.resolve(process.argv[2]));
if (!process.exitCode) { console.log("Tizen strict ES5 parse passed (" + count + " shipped files)."); }
