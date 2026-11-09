"use strict";

// Runs sentinel-ir off the page's main thread so a large file cannot freeze
// the page. A worker loaded from a URL does not inherit the page's <meta> CSP
// and GitLab Pages cannot send CSP headers, so the same-origin-only rule is
// enforced here in code before sentinel-ir is loaded.
const ORIGIN = self.location.origin;
const realFetch = self.fetch.bind(self);
self.fetch = (input, init) => {
    const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url, self.location.href);
    if (url.origin !== ORIGIN) return Promise.reject(new TypeError(`Blocked a request to ${url.origin}`));
    return realFetch(input, init);
};
for (const name of ["XMLHttpRequest", "WebSocket", "EventSource", "WebTransport"]) {
    try { Object.defineProperty(self, name, { value: undefined, configurable: false, writable: false }); } catch { /* not present */ }
}
self.importScripts = () => { throw new Error("importScripts is disabled"); };

const ir = require("sentinel-ir");

self.onmessage = async ({ data }) => {
    try {
        const full = await ir.analyzeAsync(data.source, data.options);
        self.postMessage({ id: data.id, full, compact: ir.compress(full) });
    } catch (error) {
        self.postMessage({ id: data.id, error: error && error.message ? error.message : String(error) });
    }
};
