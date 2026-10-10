"use strict";
var assert = require("assert");
var fs = require("fs");
var os = require("os");
var path = require("path");
var childProcess = require("child_process");
var root = path.resolve(__dirname, "../..");
var temporary = fs.mkdtempSync(path.join(os.tmpdir(), "plx-package-test-"));
try {
    var app = path.join(temporary, "SyntheticApp");
    fs.mkdirSync(app);
    fs.writeFileSync(path.join(app, "config.xml"), "<widget/>");
    fs.writeFileSync(path.join(app, "index.html"), "<html></html>");
    fs.writeFileSync(path.join(app, "main.js"), "\"use strict\";");
    var sdk = path.join(temporary, "tizen");
    fs.writeFileSync(sdk, "#!" + process.execPath + "\n" +
        "var fs=require('fs'),path=require('path'),args=process.argv.slice(2);\n" +
        "var source=args[args.length-1];\n" +
        "if(args[0]==='build-web'){fs.mkdirSync(path.join(source,'.buildResult'));process.exit(0);}\n" +
        "if(args[0]==='package'){\n" +
        " if(path.basename(source)!=='.buildResult'){process.stderr.write('Package the SDK output, not the source tree with nested build output');process.exit(1);}\n" +
        " fs.writeFileSync(path.join(args[args.indexOf('-o')+1],'Synthetic.wgt'),'synthetic package');process.exit(0);\n" +
        "}\nprocess.exit(1);\n", { mode: 448 });
    var result = childProcess.spawnSync("bash", [path.join(root, "tools/tizen/build-web.sh"), app, "synthetic"], {
        env: Object.assign({}, process.env, { TIZEN_CLI: sdk }), encoding: "utf8"
    });
    assert.strictEqual(result.status, 0, result.stdout + result.stderr);
    assert(fs.existsSync(path.join(temporary, "dist/SyntheticApp.wgt")));
    console.log("Tizen signing packages SDK output without nested source/build duplicates: passed");
} finally {
    fs.rmSync(temporary, { recursive: true, force: true });
}
