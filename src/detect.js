"use strict";

// Best-effort guess for pasted code without a file name. The user can always
// override it, and a file's extension always wins over this guess.
//
// Pasted text is untrusted: every pattern is written so that the regex engine
// never has two ways to match the same run of characters (no "\s*(...)?\s*" or
// "\s+.*\s+"). Such patterns take seconds to minutes on one long line.
const PYTHON_LINE = [
    // A def header, finished or not; no JavaScript line starts this way.
    /^\s*(?:async\s+)?def\s+\w+\s*\(/,
    /^\s*class\s+\w+\s*(?:\([^)]*\)\s*)?:\s*(?:#.*)?$/,
    /^\s*from\s+[\w.]+\s+import\s[\w*, ()]*(?:#.*)?$/,
    /^\s*import\s+[\w.]+(?:\s+as\s+\w+)?(?:\s*,\s*[\w.]+(?:\s+as\s+\w+)?)*\s*(?:#.*)?$/,
    /^\s*(?:if|elif|else|for|while|with|try|except|finally)\b.*:\s*(?:#.*)?$/,
    /^\s*@[\w.]+(?:\(.*\))?\s*$/,
    // A comment, but not a Rust attribute (#[...] or #![...]).
    /^\s*#(?!!?\[)/,
    /^\s*[rRbBuUfF]?(?:"""|''')/,
    /^\s*(?:pass|raise|elif|except|lambda|nonlocal|global|del)\b/,
    /^(?!.*;\s*$).*?(?<![\w.$])(?:True|False|None)\b/
];

// Rust-only syntax. Many Rust lines also end in ";" or "{" like JavaScript,
// so Rust wins when it has more of these lines than Python has its own and
// at least as many as JavaScript has JavaScript-only lines.
const RUST_LINE = [
    /^\s*(?:pub(?:\([\w ]+\))?\s+)?(?:(?:const|async|unsafe)\s+)*(?:extern\s+"\w+"\s+)?fn\s+\w+/,
    // A finished use or the first line of a multi-line one: `use std::{`.
    /^\s*(?:pub(?:\([\w ]+\))?\s+)?use\s+[\w{:][\w:{}, *]*(?:;|\{[ \t]*$)/,
    /^\s*#!?\[\w/,
    /^\s*(?:pub(?:\([\w ]+\))?\s+)?(?:struct|trait|mod)\s+\w+/,
    /^\s*pub(?:\([\w ]+\))?\s+(?:enum|type|const|static)\s+\w+/,
    /^\s*(?:unsafe\s+)?impl\b/,
    /^\s*extern\s+(?:crate\s+\w|"\w+")/,
    /^\s*match\s[^{\n]*\{\s*$/,
    /\blet\s+mut\s+\w/,
    /\bunsafe\s*\{/,
    /^(?!\s*\/\/).*?\b(?:std|core|alloc|crate|super)::\w/,
    /\b(?:println|eprintln|print|format|vec|panic|assert|assert_eq|assert_ne|write|writeln|macro_rules|include_str|include_bytes|matches|todo|unimplemented|unreachable)!\s*[([{]/
];

const JS_ONLY_LINE = [
    /^\s*(?:var|function|export|async\s+function)\b/,
    /^\s*const\s+[\w$]+\s*=(?!=)/,
    /^\s*(?:const|let)\s*[{[]/,
    /\brequire\s*\(/,
    /^\s*import\s.*\sfrom\s*["']/,
    /[!=]==/,
    /\b(?:console|this|document|window)\./
];

const JS_LINE = [
    /[;{}]\s*$/,
    /^\s*(?:const|let|var|function|export|async\s+function)\b/,
    /=>/,
    /\brequire\s*\(/,
    /^\s*import\s.*\sfrom\s*["']/,
    /^\s*import\s+["']/,
    /^\s*\/\//
];

const TS_HINTS = [
    /\b(?:interface|type)\s+\w+\s*(?:<[^>\n]*>\s*)?[={]/,
    /\benum\s+\w+\s*\{/,
    /[\w)\]]\s*:\s*(?:string|number|boolean|any|unknown|void|never|Record<|Promise<|Array<)/,
    /\bas\s+(?:string|number|boolean|any|unknown|const)\b/,
    /\b(?:implements|readonly|private|public|protected)\s+\w/,
    /^[ \t]*import\s+type\s/m,
    /^[ \t]*(?:export\s+)?declare\s+(?:const|let|var|function|class|abstract|module|namespace|global|enum|type|interface)\b/m,
    /^[ \t]*export\s+(?:type|interface)\s/m,
    /^[ \t]*(?:import|export)\s*\{[^}\n]*\btype\s+\w/m,
    // Annotated parameter or variable: function f(a: T, ...), (e: Type) => ..., const v: [string][] = ...
    /\bfunction\s*\w*\s*\(\s*\w+\??\s*:\s*\w/,
    /\(\s*\w+\??\s*:\s*[\w.]+\s*\)\s*=>/,
    /^[ \t]*(?:export\s+)?(?:const|let|var)\s+\w+\s*:\s*[\w[{(]/m,
    // Non-null assertion (x!.y): not valid JavaScript.
    /[\w)\]]!\./
];

const JSX_HINT = /<\/[A-Za-z][\w.]*>|<[A-Za-z][\w.]*(?:\s[^<>]*)?\/>|(?:return|=>)\s*(?:\(\s*)?<[A-Za-z]/;

function countLines(lines, patterns) {
    let count = 0;
    for (const line of lines) {
        if (line.trim() !== "" && patterns.some(re => re.test(line))) count++;
    }
    return count;
}

function detectLanguage(source) {
    const text = String(source || "");
    const lines = text.split(/\r?\n/);
    const python = countLines(lines, PYTHON_LINE);
    const js = countLines(lines, JS_LINE);
    const rust = countLines(lines, RUST_LINE);
    if (rust > python && rust >= countLines(lines, JS_ONLY_LINE)) return "rust";
    if (python > js) return "python";
    const ts = TS_HINTS.some(re => re.test(text));
    const jsx = JSX_HINT.test(text);
    if (ts && jsx) return "tsx";
    if (ts) return "typescript";
    return "javascript";
}

const EXTENSIONS = Object.freeze({
    ".js": "javascript", ".mjs": "javascript", ".cjs": "javascript", ".jsx": "javascript",
    ".ts": "typescript", ".mts": "typescript", ".cts": "typescript",
    ".tsx": "tsx",
    ".py": "python", ".pyi": "python",
    ".rs": "rust"
});

function languageFromFileName(name) {
    const match = /\.[^./\\]+$/.exec(String(name || "").toLowerCase());
    return (match && EXTENSIONS[match[0]]) || null;
}

module.exports = { detectLanguage, languageFromFileName, EXTENSIONS };
