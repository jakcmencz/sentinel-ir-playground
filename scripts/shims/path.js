"use strict";

// Minimal browser stand-in for path.join(), enough for sentinel-ir's grammar
// lookup. Keeps relative paths relative.
function join(...parts) {
    const segments = [];
    for (const segment of parts.join("/").split("/")) {
        if (segment === "" || segment === ".") continue;
        if (segment === ".." && segments.length > 0 && segments[segments.length - 1] !== "..") segments.pop();
        else if (segment === "..") continue;
        else segments.push(segment);
    }
    const joined = segments.join("/");
    return parts[0] && parts[0].startsWith("/") ? "/" + joined : joined || ".";
}

module.exports = { join, sep: "/" };
