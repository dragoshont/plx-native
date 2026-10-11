"use strict";
var fs = require("fs");
var path = require("path");
var acorn;
try { acorn = require("../../tests/tizen/node_modules/acorn"); }
catch (error) {
    console.error("Install declared Tizen host-test dependencies: npm ci --prefix tests/tizen --ignore-scripts");
    process.exit(1);
}
// Samsung's engine table binds 2017/Tizen 3.0 to Chromium M47. Keep this
// conservative denylist alongside ES5 parsing: syntax alone cannot see API drift.
function runtimeIssues(source) {
    var issues = [], nodeLists = {};
    var tree = acorn.parse(source, { ecmaVersion: 5, sourceType: "script" });
    function isNodeList(node) {
        return node && (node.type === "Identifier" && nodeLists[node.name] ||
            node.type === "CallExpression" && node.callee.type === "MemberExpression" &&
            ["querySelectorAll", "getElementsByTagName", "getElementsByClassName"].indexOf(node.callee.property.name) !== -1);
    }
    function walk(node, ancestors) {
        if (!node || typeof node !== "object") { return; }
        var outerScope = nodeLists;
        var newScope = /^(?:FunctionDeclaration|FunctionExpression)$/.test(node.type);
        if (newScope) { nodeLists = {}; }
        if (node.type === "VariableDeclarator") { nodeLists[node.id.name] = !!isNodeList(node.init); }
        if (node.type === "MemberExpression") {
            var property = node.computed && node.property.type === "Literal" ? node.property.value : node.property.name;
            var object = node.object.name;
            if (["includes", "padStart", "padEnd", "closest", "finally", "flat", "flatMap", "replaceAll"].indexOf(property) !== -1 ||
                object === "Object" && ["entries", "values", "fromEntries"].indexOf(property) !== -1 ||
                property === "forEach" && isNodeList(node.object)) {
                issues.push("M47 unsupported API: " + (object || "value") + "." + property);
            }
        }
        if (node.type === "NewExpression" && ["URLSearchParams", "AbortController"].indexOf(node.callee.name) !== -1) {
            var optionalAbort = node.callee.name === "AbortController" && ancestors.some(function (parent) {
                if (parent.type !== "ConditionalExpression" || parent.consequent !== node) { return false; }
                var test = parent.test;
                return test.type === "BinaryExpression" && test.operator === "===" &&
                    test.left.type === "UnaryExpression" && test.left.operator === "typeof" && test.left.argument.name === "AbortController" &&
                    test.right.value === "function";
            });
            if (!optionalAbort) { issues.push("M47 unsupported constructor: " + node.callee.name); }
        }
        Object.keys(node).forEach(function (key) {
            if (Array.isArray(node[key])) { node[key].forEach(function (child) { walk(child, ancestors.concat(node)); }); }
            else if (node[key] && typeof node[key] === "object") { walk(node[key], ancestors.concat(node)); }
        });
        if (newScope) { nodeLists = outerScope; }
    }
    walk(tree, []);
    return issues;
}
function cssIssues(source) {
    source = source.replace(/\/\*[\s\S]*?\*\//g, "");
    var issues = [];
    if (/(?:^|[;{])\s*(?:gap|row-gap|column-gap)\s*:/m.test(source)) { issues.push("M47 unsupported layout gap"); }
    if (/var\s*\(|(?:^|[;{])\s*--[\w-]+\s*:/m.test(source)) { issues.push("M47 unsupported CSS custom property"); }
    return issues;
}
var count = 0;
function check(directory) {
    fs.readdirSync(directory).sort().forEach(function (name) {
        if (name.charAt(0) === "." || name === "node_modules") { return; }
        var file = path.join(directory, name);
        if (fs.statSync(file).isDirectory()) { check(file); }
        else if (/\.(?:js|css)$/.test(name)) {
            try {
                var source = fs.readFileSync(file, "utf8");
                var issues = name.endsWith(".js") ? runtimeIssues(source) : cssIssues(source);
                if (issues.length) { throw new Error(issues.join("; ")); }
            } catch (error) { console.error(file + ": " + error.message); process.exitCode = 1; }
            count += 1;
        }
    });
}
module.exports = { runtimeIssues: runtimeIssues, cssIssues: cssIssues };
if (require.main === module) {
    check(path.resolve(process.argv[2]));
    if (!process.exitCode) { console.log("Tizen strict ES5 + Chromium M47 API/CSS gate passed (" + count + " shipped files)."); }
}
