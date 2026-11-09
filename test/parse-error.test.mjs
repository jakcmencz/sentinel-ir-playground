import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { describeParseError } = require("../src/parse-error.js");

test("describeParseError: every parseError kind", () => {
    assert.equal(describeParseError(undefined), "");
    assert.equal(describeParseError({ line: 1, column: 17, kind: "missing", expected: ")" }),
        ' First error at line 1, column 17: missing ")".');
    assert.equal(describeParseError({ line: 2, column: 3, kind: "missing" }),
        " First error at line 2, column 3: missing token.");
    assert.equal(describeParseError({ line: 3, column: 11, kind: "unexpected" }),
        " First error at line 3, column 11: unexpected text.");
    assert.equal(describeParseError({ line: 1, column: 11, kind: "unclosed", expected: ")" }),
        ' First error at line 1, column 11: "(" is never closed.');
    assert.equal(describeParseError({ line: 4, column: 5, kind: "unclosed", expected: "]" }),
        ' First error at line 4, column 5: "[" is never closed.');
    assert.equal(describeParseError({ line: 5, column: 1, kind: "unclosed", expected: "}" }),
        ' First error at line 5, column 1: "{" is never closed.');
    assert.equal(describeParseError({ line: 6, column: 2, kind: "unclosed" }),
        " First error at line 6, column 2: bracket is never closed.");
    assert.equal(describeParseError({ line: 7, column: 1, kind: "something-new" }),
        " First error at line 7, column 1: unexpected text.");
});
