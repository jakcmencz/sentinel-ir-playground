"use strict";

const OPENER = Object.freeze({ ")": "(", "]": "[", "}": "{" });

function describeParseError(error) {
    if (!error) return "";
    let what;
    if (error.kind === "missing") {
        what = `missing ${error.expected ? `"${error.expected}"` : "token"}`;
    } else if (error.kind === "unclosed") {
        const opener = OPENER[error.expected];
        what = opener ? `"${opener}" is never closed` : "bracket is never closed";
    } else {
        what = "unexpected text";
    }
    return ` First error at line ${error.line}, column ${error.column}: ${what}.`;
}

module.exports = { describeParseError };
