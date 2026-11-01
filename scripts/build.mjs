// Bundles the playground into public/ (the GitLab Pages artifact).
import { build } from "esbuild";
import { cp, mkdir, rm, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const out = path.join(root, "public");
const irDir = path.dirname(require.resolve("sentinel-ir/package.json"));
// web-tree-sitter's "exports" hides package.json; its CJS entry sits in the package root.
const wtsDir = path.dirname(require.resolve("web-tree-sitter", { paths: [irDir] }));
const irVersion = require("sentinel-ir/package.json").version;
const empty = path.join(root, "scripts", "shims", "empty.js");

await rm(out, { recursive: true, force: true });
await mkdir(path.join(out, "wasm"), { recursive: true });
await mkdir(path.join(out, "licenses"), { recursive: true });

await build({
    entryPoints: [path.join(root, "src", "app.js")],
    outfile: path.join(out, "app.js"),
    bundle: true,
    minify: true,
    platform: "browser",
    format: "iife",
    target: ["es2020"],
    logLevel: "warning",
    // Node-only code paths in sentinel-ir / web-tree-sitter are never reached
    // in the browser: native tree-sitter is only used by the sync analyze()
    // fallback, and fs/module only when web-tree-sitter runs under Node.
    alias: {
        path: path.join(root, "scripts", "shims", "path.js"),
        "tree-sitter": empty,
        "tree-sitter-javascript": empty,
        fs: empty,
        "fs/promises": empty,
        module: empty
    },
    // sentinel-ir loads grammars from path.join(__dirname, "..", "wasm", f);
    // "." makes that the page-relative "wasm/f", so any Pages subpath works.
    define: {
        __dirname: JSON.stringify("."),
        SENTINEL_IR_VERSION: JSON.stringify(irVersion)
    }
});

for (const file of ["index.html", "style.css"]) {
    await cp(path.join(root, "src", file), path.join(out, file));
}
await cp(path.join(wtsDir, "tree-sitter.wasm"), path.join(out, "tree-sitter.wasm"));
for (const file of ["tree-sitter-javascript.wasm", "tree-sitter-typescript.wasm", "tree-sitter-tsx.wasm", "tree-sitter-python.wasm"]) {
    await cp(path.join(irDir, "wasm", file), path.join(out, "wasm", file));
}
const licenses = {
    "sentinel-ir-LICENSE.txt": path.join(irDir, "LICENSE"),
    "sentinel-ir-NOTICE.txt": path.join(irDir, "NOTICE"),
    "tree-sitter-typescript-LICENSE.txt": path.join(irDir, "wasm", "LICENSE-tree-sitter-typescript"),
    "tree-sitter-python-LICENSE.txt": path.join(irDir, "wasm", "LICENSE-tree-sitter-python"),
    "web-tree-sitter-LICENSE.txt": path.join(wtsDir, "LICENSE"),
    "playground-LICENSE.txt": path.join(root, "LICENSE"),
    "playground-NOTICE.txt": path.join(root, "NOTICE")
};
for (const [name, from] of Object.entries(licenses)) {
    await cp(from, path.join(out, "licenses", name));
}
const html = await readFile(path.join(out, "index.html"), "utf8");
await writeFile(path.join(out, "index.html"), html.replaceAll("{{SENTINEL_IR_VERSION}}", irVersion));
console.log(`built public/ with sentinel-ir ${irVersion}`);
