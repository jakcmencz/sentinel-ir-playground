// Loads the built site in a real Chromium with a phone viewport and checks
// that it gives exactly the IR that sentinel-ir gives under Node, without
// talking to anything but its own origin.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { chromium } from "playwright-core";
import { serve } from "../scripts/serve.mjs";

const require = createRequire(import.meta.url);
const ir = require("sentinel-ir");
const { EXAMPLES } = require("../src/examples.js");
const { languageFromFileName } = require("../src/detect.js");

// GitLab Pages serves projects under /<project>/, so test under a subpath.
const BASE = "/sentinel-ir-playground/";
const ARTIFACTS = new URL("../test-artifacts/", import.meta.url).pathname;

let server, browser, context, page, origin;
const requests = [];
const problems = [];

before(async () => {
    await mkdir(ARTIFACTS, { recursive: true });
    server = await serve({ port: 0, base: BASE });
    origin = `http://127.0.0.1:${server.address().port}`;
    browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
    context = await browser.newContext({
        viewport: { width: 393, height: 851 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
        userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36"
    });
    page = await context.newPage();
    page.on("request", r => requests.push(r.url()));
    page.on("pageerror", e => problems.push(`pageerror: ${e.message}`));
    page.on("console", m => { if (m.type() === "error" || m.type() === "warning") problems.push(`console.${m.type()}: ${m.text()}`); });
    await page.addInitScript(() => {
        document.addEventListener("securitypolicyviolation", e => console.error(`CSP violation: ${e.violatedDirective} ${e.blockedURI}`));
    });
    await page.goto(origin + BASE);
    await page.waitForSelector("#result[data-state=done]");
});

after(async () => {
    await browser?.close();
    await new Promise(resolve => server ? server.close(resolve) : resolve());
});

async function shownIr() {
    await page.waitForSelector("#result[data-state=done]");
    return JSON.parse(await page.textContent("#ir"));
}

async function nodeIr(source, options) {
    return ir.compress(await ir.analyzeAsync(source, options));
}

test("first visit shows the first example's analysis", async () => {
    const first = EXAMPLES[0];
    assert.deepEqual(await shownIr(), await nodeIr(first.source, { language: "python", target: first.fileName }));
    assert.equal(await page.textContent("#risk"), "critical");
});

for (const example of EXAMPLES) {
    test(`example "${example.id}" matches sentinel-ir under Node`, async () => {
        await page.selectOption("#example", "");
        await page.evaluate(() => { document.getElementById("result").dataset.state = "stale"; });
        await page.selectOption("#example", example.id);
        const shown = await shownIr();
        const expected = await nodeIr(example.source, { language: languageFromFileName(example.fileName), target: example.fileName });
        assert.deepEqual(shown, expected);
        assert.equal(await page.textContent("#risk"), expected.world.risk);
        const full = await ir.analyzeAsync(example.source, { language: languageFromFileName(example.fileName), target: example.fileName });
        const lines = await page.$$eval("#signals li", items => items.map(li => `${li.dataset.signal}@${li.dataset.line}`));
        assert.deepEqual(lines, full.facts.riskSignals.map(s => `${s.signal}@${s.line}`));
        assert.equal(await page.isVisible("#incomplete"), expected.analysisStatus !== "complete");
        await page.screenshot({ path: `${ARTIFACTS}${example.id}.png`, fullPage: true });
    });
}

test("expected verdicts for the examples", async () => {
    const verdict = {};
    for (const example of EXAMPLES) {
        const c = await nodeIr(example.source, { language: languageFromFileName(example.fileName), target: example.fileName });
        verdict[example.id] = `${c.analysisStatus}/${c.world.risk}`;
    }
    assert.deepEqual(verdict, {
        "python-pickle": "complete/critical",
        pytorch: "complete/critical",
        "js-eval": "complete/critical",
        "ts-shell": "complete/critical",
        "tsx-fetch": "complete/medium",
        harmless: "complete/low",
        broken: "incomplete/critical"
    });
    const torch = await nodeIr(EXAMPLES.find(e => e.id === "pytorch").source, { language: "python" });
    assert.deepEqual(torch.facts.riskSignals, ["unsafe_deserialization:torch.load@7"]);
});

test("pasted code without a file name is auto-detected", async () => {
    const source = "import os\n\ndef run(cmd):\n    os.system(cmd)\n";
    await page.evaluate(() => { document.getElementById("result").dataset.state = "stale"; });
    await page.focus("#source");
    await page.keyboard.press("ControlOrMeta+a");
    await page.evaluate(text => {
        const area = document.getElementById("source");
        const data = new DataTransfer();
        data.setData("text/plain", text);
        area.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true }));
        area.value = text;
    }, source);
    await page.click("#analyze");
    const shown = await shownIr();
    assert.equal(await page.getAttribute("#result", "data-language"), "python");
    assert.match(await page.textContent("#meta"), /Python \(auto-detected\)/);
    assert.deepEqual(shown, await nodeIr(source, { language: "python" }));
});

test("an opened file is analyzed by its extension", async () => {
    const source = "import yaml\nconfig = yaml.load(open('c.yml'))\n";
    await page.evaluate(() => { document.getElementById("result").dataset.state = "stale"; });
    await page.setInputFiles("#file", { name: "config.py", mimeType: "text/x-python", buffer: Buffer.from(source) });
    const shown = await shownIr();
    assert.match(await page.textContent("#meta"), /Python \(from file name\)/);
    assert.deepEqual(shown, await nodeIr(source, { language: "python", target: "config.py" }));
    assert.equal(shown.world.risk, "critical");
});

test("tapping a signal selects its line in the editor", async () => {
    await page.selectOption("#example", "python-pickle");
    await shownIr();
    await page.tap('#signals li[data-signal="unsafe_deserialization"]');
    const selected = await page.evaluate(() => {
        const a = document.getElementById("source");
        return a.value.slice(a.selectionStart, a.selectionEnd);
    });
    assert.equal(selected.trim(), "obj = pickle.loads(blob)");
});

test("fits a phone screen without horizontal scrolling", async () => {
    const { scroll, client } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
    assert.ok(scroll <= client, `scrollWidth ${scroll} > clientWidth ${client}`);
});

test("only the site's own files are requested and nothing is reported", async () => {
    const foreign = requests.filter(url => !url.startsWith(origin + BASE));
    assert.deepEqual(foreign, []);
    const paths = new Set(requests.map(url => new URL(url).pathname.slice(BASE.length)));
    for (const file of ["", "style.css", "app.js", "tree-sitter.wasm", "wasm/tree-sitter-python.wasm", "wasm/tree-sitter-javascript.wasm", "wasm/tree-sitter-typescript.wasm", "wasm/tree-sitter-tsx.wasm"]) {
        assert.ok(paths.has(file), `expected a request for ${file || "index"}`);
    }
    assert.deepEqual(problems, []);
});
