"use strict";

// Best-effort guess for pasted code without a file name. The user can always
// override it, and a file's extension always wins over this guess.
const PYTHON_LINE = [
    /^\s*(async\s+)?def\s+\w+\s*\(.*\)\s*(->\s*[^:]+)?:\s*(#.*)?$/,
    /^\s*class\s+\w+\s*(\([^)]*\))?\s*:\s*(#.*)?$/,
    /^\s*from\s+[\w.]+\s+import\s+[\w*, ()]+$/,
    /^\s*import\s+[\w.]+(\s+as\s+\w+)?(\s*,\s*[\w.]+(\s+as\s+\w+)?)*\s*(#.*)?$/,
    /^\s*(if|elif|else|for|while|with|try|except|finally)\b.*:\s*(#.*)?$/,
    /^\s*@[\w.]+(\(.*\))?\s*$/,
    /^\s*#/
];

const JS_LINE = [
    /[;{}]\s*$/,
    /^\s*(const|let|var|function|export|async\s+function)\b/,
    /=>/,
    /\brequire\s*\(/,
    /^\s*import\s+.*\s+from\s+["']/,
    /^\s*import\s+["']/,
    /^\s*\/\//
];

const TS_HINTS = [
    /\b(interface|type)\s+\w+(\s*<[^>]*>)?\s*[={]/,
    /\benum\s+\w+\s*\{/,
    /[\w)\]]\s*:\s*(string|number|boolean|any|unknown|void|never|Record<|Promise<|Array<)/,
    /\bas\s+(string|number|boolean|any|unknown|const)\b/,
    /\b(implements|readonly|private|public|protected)\s+\w/,
    /^\s*import\s+type\s/m
];

const JSX_HINT = /<\/[A-Za-z][\w.]*>|<[A-Za-z][\w.]*(\s+[^<>]*)?\/>|(return|=>)\s*\(?\s*<[A-Za-z]/;

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
    ".py": "python", ".pyi": "python"
});

function languageFromFileName(name) {
    const match = /\.[^./\\]+$/.exec(String(name || "").toLowerCase());
    return (match && EXTENSIONS[match[0]]) || null;
}

module.exports = { detectLanguage, languageFromFileName, EXTENSIONS };
