# Sentinel-IR Playground

Try [sentinel-ir](https://www.npmjs.com/package/sentinel-ir) in a browser, including on a phone. Paste code or open a
JavaScript, TypeScript, TSX or Python file and see what an AI agent would get instead of the raw source:

- the risk level (`low`, `medium`, `high`, `critical`);
- risk signals with line numbers (tap one to jump to the line);
- routes, imports, operations and forbidden capabilities;
- the compact structural IR, with a Copy button and its size next to the source size.

## Privacy

The analysis runs in the browser through WebAssembly (tree-sitter grammars bundled with sentinel-ir). The page is
static: no server-side code, no AI model, no API keys, no analytics. Your code is not uploaded and is never executed;
sentinel-ir only parses it.

What the tests check: in headless Chromium the page requests only its own files, and its Content-Security-Policy
(`connect-src 'self'`) blocks connections to any other origin. Links in the footer are ordinary navigation.

## Limits

- Static analysis only. A `low` risk or an empty signal list is not proof that code is safe.
- An `incomplete` result means the code did not fully parse; it is not proof of safety either.
- For very small snippets the compact IR is larger than the code; it pays off on larger files.
- Language auto-detection for pasted code is a heuristic. A file's extension always wins, and you can pick the
  language yourself.
- CI runs the full checks in Chromium with a phone viewport, and the no-horizontal-scroll check for every
  example at 320–412 px in Chromium, Firefox and WebKit (Safari's engine). Real Mobile Safari (iOS 27 simulator)
  and desktop Safari (macOS 26) were checked by hand, not in CI.

The same analysis is available to coding agents (Cursor, VS Code, Claude Code) as MCP tools through
[sentinel-ir-mcp](https://www.npmjs.com/package/sentinel-ir-mcp).

## Development

Node.js 20 or newer.

```sh
npm ci
npm run build        # bundles the site into public/
npm run serve        # http://localhost:8080/
npm test             # build + unit tests + browser tests
```

The browser tests use `playwright-core` with Chromium, Firefox and WebKit. Install them once with
`npx playwright-core install chromium firefox webkit`, or point `CHROME_PATH` at an existing Chromium/Chrome build. They load the site under `/sentinel-ir-playground/`
(like GitLab Pages) in a phone viewport and check that:

- every example gives exactly the same compact IR and signals as `sentinel-ir` under Node;
- pasted code is auto-detected and an opened file uses its extension;
- tapping a signal selects its line;
- the page fits a 393 px wide screen, and every example fits 320–412 px in Chromium, Firefox and WebKit;
- no request leaves the site's origin and there are no console errors or CSP violations.

Screenshots of every example are written to `test-artifacts/`.

## Deployment

CI runs the tests on every push. The `pages` job publishes `public/` to GitLab Pages only from `main`.

## License

Apache-2.0. See `LICENSE` and `NOTICE` for the bundled third-party components.
