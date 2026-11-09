"use strict";

const { detectLanguage, languageFromFileName } = require("./detect");
const { EXAMPLES } = require("./examples");
const { describeParseError } = require("./parse-error");

const MAX_FILE_BYTES = 2 * 1024 * 1024;
const LABELS = { javascript: "JavaScript", typescript: "TypeScript", tsx: "TSX", python: "Python" };
const SIGNALS = {
    unsafe_deserialization: "Deserializes data in a way that can run code",
    process_spawn: "Starts a process",
    child_process_import: "Imports a process-spawning module",
    dynamic_code: "Runs dynamically built code",
    destructive_fs: "Deletes files",
    disk_write: "Writes files",
    outbound_http: "Network request",
    inbound_http: "Exposes an HTTP route",
    crypto_use: "Cryptography",
    secret_comparison: "Compares a secret",
    secret_access: "Reads a secret",
    process_exit: "Exits the process"
};

const $ = id => document.getElementById(id);
const state = { fileName: null, run: 0 };
const worker = { current: null, pending: null, nextId: 0 };
const SUPERSEDED = new Error("superseded by a newer analysis");

function el(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
}

function startWorker() {
    const w = new Worker("worker.js");
    w.onmessage = ({ data }) => {
        const pending = worker.pending;
        if (!pending || pending.id !== data.id) return;
        worker.pending = null;
        if (data.error) pending.reject(new Error(data.error));
        else pending.resolve(data);
    };
    w.onerror = event => {
        event.preventDefault();
        const pending = worker.pending;
        worker.pending = null;
        w.terminate();
        if (worker.current === w) worker.current = null;
        if (pending) pending.reject(new Error(event.message || "the analyzer stopped"));
    };
    worker.current = w;
}

// sentinel-ir runs in a worker so a large file never freezes the page. A newer
// request stops the running one: terminating the worker is the only way to
// cancel an analysis that is already under way.
function cancelAnalysis() {
    if (!worker.pending) return;
    worker.current.terminate();
    worker.current = null;
    worker.pending.reject(SUPERSEDED);
    worker.pending = null;
}

function analyzeInWorker(source, options) {
    cancelAnalysis();
    if (!worker.current) startWorker();
    const id = ++worker.nextId;
    return new Promise((resolve, reject) => {
        worker.pending = { id, resolve, reject };
        worker.current.postMessage({ id, source, options });
    });
}

function forgetFileIfReplacingAll() {
    const area = $("source");
    const replacesAll = area.value === "" || (area.selectionStart === 0 && area.selectionEnd === area.value.length);
    if (replacesAll) {
        setFileName(null);
        $("example").value = "";
    }
}

function chooseLanguage(source) {
    const chosen = $("language").value;
    if (chosen !== "auto") return { language: chosen, how: "chosen" };
    const fromFile = languageFromFileName(state.fileName);
    if (fromFile) return { language: fromFile, how: "from file name" };
    return { language: detectLanguage(source), how: "auto-detected" };
}

function setFileName(name) {
    state.fileName = name || null;
    $("file-name").hidden = !state.fileName;
    $("file-name").textContent = state.fileName ? `File: ${state.fileName}` : "";
}

function jumpToLine(line) {
    const area = $("source");
    const lines = area.value.split("\n");
    if (line < 1 || line > lines.length) return;
    let start = 0;
    for (let i = 0; i < line - 1; i++) start += lines[i].length + 1;
    area.focus();
    area.setSelectionRange(start, start + lines[line - 1].length);
    const lineHeight = parseFloat(getComputedStyle(area).lineHeight) || 20;
    area.scrollTop = Math.max(0, (line - 3) * lineHeight);
    area.scrollIntoView({ block: "center", behavior: "smooth" });
}

function renderSignals(source, signals) {
    const list = $("signals");
    list.replaceChildren();
    $("no-signals").hidden = signals.length > 0;
    const lines = source.split("\n");
    for (const s of signals) {
        const item = el("li");
        item.tabIndex = 0;
        item.dataset.signal = s.signal;
        item.dataset.line = String(s.line);
        const head = el("div", undefined, "signal-head");
        head.append(el("strong", SIGNALS[s.signal] || s.signal), el("code", s.evidence), el("span", `line ${s.line}`, "signal-line"));
        item.append(head);
        const text = lines[s.line - 1];
        if (text !== undefined) item.append(el("span", text.trim(), "snippet"));
        const jump = () => jumpToLine(s.line);
        item.addEventListener("click", jump);
        item.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); jump(); } });
        list.append(item);
    }
}

function renderFacts(compact) {
    const dl = $("facts");
    dl.replaceChildren();
    const f = compact.facts || {};
    const rows = [
        ["Routes", f.routes],
        ["Imports", f.imports],
        ["Exports", f.exports],
        ["Environment variables", f.env],
        ["Operations", f.operations],
        ["Forbidden capabilities", compact.forbidden]
    ];
    for (const [title, values] of rows) {
        if (!Array.isArray(values) || values.length === 0) continue;
        const dd = el("dd");
        for (const v of values) dd.append(el("span", String(v), "chip"));
        dl.append(el("dt", title), dd);
    }
    if (!dl.childElementCount) dl.append(el("dd", "None found.", "muted"));
}

function renderSize(source, compactJson) {
    const enc = new TextEncoder();
    const src = enc.encode(source).length;
    const out = enc.encode(compactJson).length;
    let text = `Source ${src.toLocaleString("en")} bytes → compact IR ${out.toLocaleString("en")} bytes`;
    if (src > 0 && out < src) text += ` (${Math.round((1 - out / src) * 100)}% smaller).`;
    else text += ". For very small snippets the fixed IR header is larger than the code itself.";
    text += " Comments and function bodies are not copied into the IR.";
    $("size").textContent = text;
}

async function analyze() {
    const source = $("source").value;
    const result = $("result");
    const button = $("analyze");
    const { language, how } = chooseLanguage(source);
    const options = { language };
    if (state.fileName) options.target = state.fileName;
    const ticket = ++state.run;

    $("error").hidden = true;
    result.dataset.state = "running";
    button.disabled = true;
    button.textContent = "Analyzing…";
    const started = performance.now();
    try {
        const { full, compact } = await analyzeInWorker(source, options);
        if (ticket !== state.run) return;
        const ms = Math.round(performance.now() - started);
        const risk = compact.world.risk;
        $("risk").textContent = risk;
        $("risk").className = `risk risk-${risk}`;
        const lineCount = source === "" ? 0 : source.split("\n").length;
        $("meta").textContent = `${LABELS[language] || language} (${how}) · ${lineCount} lines · ${ms} ms`;
        const incomplete = compact.analysisStatus !== "complete";
        $("incomplete").hidden = !incomplete;
        $("incomplete").textContent = incomplete
            ? `Incomplete analysis: ${compact.facts.reason || "the code did not parse"}.${describeParseError(compact.facts.parseError)} An incomplete result is not proof that the code is safe.`
            : "";
        renderSignals(source, full.facts.riskSignals || []);
        renderFacts(compact);
        const json = JSON.stringify(compact, null, 2);
        renderSize(source, JSON.stringify(compact));
        $("ir").textContent = json;
        result.hidden = false;
        result.dataset.language = language;
        result.dataset.state = "done";
    } catch (error) {
        if (ticket !== state.run) return;
        result.dataset.state = "error";
        $("error").hidden = false;
        $("error").textContent = `Analysis failed: ${error && error.message ? error.message : error}`;
    } finally {
        if (ticket === state.run) {
            button.disabled = false;
            button.textContent = "Analyze";
        }
    }
}

function loadExample(id) {
    const example = EXAMPLES.find(e => e.id === id);
    if (!example) return;
    $("source").value = example.source;
    $("language").value = "auto";
    setFileName(example.fileName);
    analyze();
}

async function loadFile(file) {
    if (!file) return;
    // Lets the same file be picked again; "change" does not fire otherwise.
    $("file").value = "";
    if (file.size > MAX_FILE_BYTES) {
        state.run++;
        cancelAnalysis();
        $("analyze").disabled = false;
        $("analyze").textContent = "Analyze";
        $("result").hidden = true;
        $("result").dataset.state = "idle";
        $("error").hidden = false;
        $("error").textContent = `${file.name} is larger than 2 MB, so it was not opened. Pick a single source file.`;
        return;
    }
    $("source").value = await file.text();
    $("language").value = "auto";
    $("example").value = "";
    setFileName(file.name);
    analyze();
}

async function copyIr() {
    const button = $("copy");
    const text = $("ir").textContent;
    try {
        await navigator.clipboard.writeText(text);
        button.textContent = "Copied";
    } catch {
        const range = document.createRange();
        range.selectNodeContents($("ir"));
        const selection = getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        button.textContent = "Selected";
    }
    setTimeout(() => { button.textContent = "Copy"; }, 1500);
}

function init() {
    const select = $("example");
    for (const example of EXAMPLES) {
        const option = el("option", example.title);
        option.value = example.id;
        select.append(option);
    }
    select.addEventListener("change", () => loadExample(select.value));
    $("file").addEventListener("change", e => loadFile(e.target.files[0]));
    $("analyze").addEventListener("click", analyze);
    $("copy").addEventListener("click", copyIr);
    $("language").addEventListener("change", analyze);
    // New code typed, pasted or dropped over everything is no longer the opened
    // file or example, so its name must not pick the language any more.
    $("source").addEventListener("paste", forgetFileIfReplacingAll);
    $("source").addEventListener("beforeinput", forgetFileIfReplacingAll);
    $("source").addEventListener("keydown", e => {
        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) analyze();
    });
    select.value = EXAMPLES[0].id;
    loadExample(EXAMPLES[0].id);
}

init();
