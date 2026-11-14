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
        ["", "javascript"],
        ['declare module "x" {\n  export function f(): void;\n}\n', "typescript"],
        ["export type Id = string;\n", "typescript"],
        ['import { type A, b } from "./a";\nb();\n', "typescript"],
        ["function makeJwt(header: object) {\n  return header;\n}\n", "typescript"],
        ['bench.on("cycle", (e: Benchmark.Event) => {\n  log(e);\n});\n', "typescript"],
        ["expect(result.error!.issues).toEqual([]);\n", "typescript"],
        ["const valid: [string, string][] = [];\n", "typescript"],
        ["from .more import *  # noqa\n", "python"],
        ["DEBUG = False\nTIMEOUT = None\n", "python"],
        ['"""Only a docstring."""\n', "python"],
        ['raise ValueError("bad")\n', "python"],
        ["const ok = true;\nlet x = null;\n", "javascript"],
        ["if (a) { b(); }\n", "javascript"],
        ["use std::process::Command;\nfn main() {\n    Command::new(\"ls\").status();\n}\n", "rust"],
        ["fn broken(x: u32 {\n    x\n}\n", "rust"],
        ["#[derive(Debug)]\nstruct A { x: i32 }\n", "rust"],
        ["impl A {\n    pub fn new() -> Self { A { x: 0 } }\n}\n", "rust"],
        ["let mut v = vec![1, 2];\nv.push(3);\n", "rust"],
        ["unsafe { libc::system(c) };\n", "rust"],
        ["println!(\"{}\", x);\n", "rust"],
        ["#!/usr/bin/env python\nimport os\n", "python"],
        ["# comment\nx = None\n", "python"],
        ["const fn = () => 1;\nlet x = fn();\n", "javascript"],
        ["let x = 1;\nconsole.log(x);\n", "javascript"],
        ['"use strict";\nconst a = require("a");\n', "javascript"],
        ["enum Color { Red, Green }\n", "typescript"],
        ["def f(x) -> int:\n    return x\n", "python"],
        ["match x {\n    1 => a(),\n    _ => b(),\n}\n", "rust"]
    ];
    for (const [source, expected] of cases) assert.equal(detectLanguage(source), expected, source);
});

test("languageFromFileName: extensions sentinel-ir supports", () => {
    assert.equal(languageFromFileName("a.PY"), "python");
    assert.equal(languageFromFileName("lib.rs"), "rust");
    assert.equal(languageFromFileName("BUILD.RS"), "rust");
    assert.equal(languageFromFileName("types.pyi"), "python");
    assert.equal(languageFromFileName("x.mts"), "typescript");
    assert.equal(languageFromFileName("App.tsx"), "tsx");
    assert.equal(languageFromFileName("lib.cjs"), "javascript");
    assert.equal(languageFromFileName("README.md"), null);
    assert.equal(languageFromFileName(null), null);
});

test("detectLanguage stays fast on hostile pasted text", () => {
    // Each of these took from seconds to minutes with the earlier patterns.
    const prefixes = ["", "import", "import a", "from a", "from a import", "class A", "def f(", "if", "@a(", "type A<", "import {", "<a", "return", "const a", "(a", "True", "fn a", "pub fn a", "pub(crate) ", "use", "pub use", "use a", "unsafe", "extern \"C\"", "#![", "#[", "impl", "match a", "extern ", "std::", "let mut", "println!"];
    const pumps = [" ", "\t", "\n", " \n", " a", ", a", " as a", "(", ")", "<", ":", ";", "True ", "None;", "type A<\n", "import {\n", "<a ", "a!", "::", "pub ", "unsafe ", "const ", "{", "a::{", "\"C\" "];
    let worst = { ms: 0 };
    for (const prefix of prefixes) {
        for (const pump of pumps) {
            const source = prefix + pump.repeat(Math.ceil(100000 / pump.length)) + "!";
            const started = performance.now();
            detectLanguage(source);
            const ms = performance.now() - started;
            if (ms > worst.ms) worst = { ms, prefix, pump };
        }
    }
    assert.ok(worst.ms < 250, `${JSON.stringify(worst)} took too long`);
});
