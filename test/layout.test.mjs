// Every example must fit common phone widths without horizontal scrolling in
// all three browser engines (Chromium, Firefox, WebKit = Safari's engine).
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { chromium, firefox, webkit } from "playwright-core";
import { serve } from "../scripts/serve.mjs";

const require = createRequire(import.meta.url);
const { EXAMPLES } = require("../src/examples.js");

const BASE = "/sentinel-ir-playground/";
const WIDTHS = [320, 360, 375, 393, 402, 412];
// isMobile is left off: in Playwright's Linux WebKit it makes WebAssembly start-up
// hang on about half of all loads, which real Safari (iOS 27, macOS 26) does not do.
const ENGINES = { chromium, firefox, webkit };

let server, origin;

before(async () => {
    server = await serve({ port: 0, base: BASE });
    origin = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
    await new Promise(resolve => server ? server.close(resolve) : resolve());
});

for (const [name, engine] of Object.entries(ENGINES)) {
    test(`${name}: every example fits ${WIDTHS.join("/")} px`, async () => {
        const browser = await engine.launch(name === "chromium" && process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
        const overflow = [];
        try {
            for (const width of WIDTHS) {
                const page = await (await browser.newContext({ viewport: { width, height: 800 } })).newPage();
                await page.goto(origin + BASE);
                await page.waitForSelector("#result[data-state=done]");
                for (const example of EXAMPLES) {
                    await page.evaluate(() => { document.getElementById("result").dataset.state = "stale"; });
                    await page.selectOption("#example", example.id);
                    await page.waitForSelector("#result[data-state=done]");
                    const scroll = await page.evaluate(() => document.documentElement.scrollWidth);
                    if (scroll > width) overflow.push(`${example.id}@${width}px: ${scroll}`);
                }
                await page.context().close();
            }
        } finally {
            await browser.close();
        }
        assert.deepEqual(overflow, []);
    });
}
