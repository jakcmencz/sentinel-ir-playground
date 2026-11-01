// Static server for public/, for local preview and the browser tests.
// Usage: node scripts/serve.mjs [port] [basePath]
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(path.dirname(fileURLToPath(import.meta.url))), "public");
const TYPES = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".wasm": "application/wasm",
    ".txt": "text/plain; charset=utf-8",
    ".json": "application/json"
};

export function serve({ port = 0, base = "/" } = {}) {
    const prefix = base.endsWith("/") ? base : base + "/";
    const server = createServer(async (req, res) => {
        const url = new URL(req.url, "http://localhost");
        if (!url.pathname.startsWith(prefix)) {
            res.writeHead(404).end();
            return;
        }
        let rel = decodeURIComponent(url.pathname.slice(prefix.length)) || "index.html";
        if (rel.endsWith("/")) rel += "index.html";
        const file = path.join(root, rel);
        if (!file.startsWith(root + path.sep)) {
            res.writeHead(403).end();
            return;
        }
        try {
            const body = await readFile(file);
            res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream" });
            res.end(body);
        } catch {
            res.writeHead(404).end();
        }
    });
    return new Promise(resolve => server.listen(port, "127.0.0.1", () => resolve(server)));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const port = Number(process.argv[2] || 8080);
    const base = process.argv[3] || "/";
    await serve({ port, base });
    console.log(`http://localhost:${port}${base}`);
}
