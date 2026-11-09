import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { detectLanguage, languageFromFileName } = require("../src/detect.js");
const { EXAMPLES } = require("../src/examples.js");

test("every example is detected as its file's language without the file name", () => {
    for (const example of EXAMPLES) {
        if (example.id === "broken") continue;
        assert.equal(detectLanguage(example.source), languageFromFileName(example.fileName), example.id);
    }
});

test("detectLanguage: typical snippets", () => {
    const cases = [
        ["import os\nos.system('ls')\n", "python"],
        ["def f(x):\n    return eval(x)\n", "python"],
        ["def broken(x:\n    return x\n", "python"],
        ["async def f(a,\n    b):\n    pass\n", "python"],
        ["from flask import Flask\napp = Flask(__name__)\n", "python"],
        ["const cp = require('child_process');\ncp.exec('ls');\n", "javascript"],
        ["import fs from 'fs';\nfs.rmSync('/x');\n", "javascript"],
        ["eval(input)", "javascript"],
        ["const n: number = 1;\n", "typescript"],
        ["interface User { id: string }\n", "typescript"],
        ["export const A = () => <div>hi</div>;\n", "javascript"],
        ["const A = (p: { x: string }) => <b>{p.x}</b>;\n", "tsx"],
        ["", "javascript"]
    ];
    for (const [source, expected] of cases) assert.equal(detectLanguage(source), expected, source);
});

test("languageFromFileName: extensions sentinel-ir supports", () => {
    assert.equal(languageFromFileName("a.PY"), "python");
    assert.equal(languageFromFileName("types.pyi"), "python");
    assert.equal(languageFromFileName("x.mts"), "typescript");
    assert.equal(languageFromFileName("App.tsx"), "tsx");
    assert.equal(languageFromFileName("lib.cjs"), "javascript");
    assert.equal(languageFromFileName("README.md"), null);
    assert.equal(languageFromFileName(null), null);
});
