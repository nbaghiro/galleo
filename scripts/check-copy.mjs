// Copy guard: fails when an em-dash lands in user-facing copy.
//
// An em-dash joining two independent clauses is the single most reliable tell that a string was
// machine-written, and it reads as filler next to the plain register the product uses everywhere
// else. A comma works when the second clause qualifies the first, a period when it is a separate
// thought, a colon when a list follows, a middot when a label is being joined to a value.
//
// Comments are stripped first: the house comment style uses em-dashes freely and that is fine —
// only what a person reads on screen is in scope. A string that is nothing but an em-dash is a
// typographic glyph (an empty-value dash in a stat tile), not prose, so it passes on its own.
//
// Self-verifying: a guard that can only report violations cannot tell you it has stopped working,
// so it plants a violation and fails if the scan stays quiet.
//
// Uses process.stdout.write rather than console because `no-console` is an error repo-wide.

import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const SELF = "scripts/check-copy.mjs";
const DASH = "—";

// Where a person reads the words. Backend prose is in scope only where it reaches a person:
// transactional email, the plan catalogue, the template blurbs.
const IN_SCOPE = [
    /^app\//,
    /^website\//,
    /^ui\//,
    /^editor\//,
    /^publish\//,
    /^model\/(?:billing|templates)\.ts$/,
    /^services\/core\/mail\.ts$/,
];

// Not copy: tests, fixtures, and the sample artifacts whose whole job is to look like real
// editorial writing, where an em-dash is correct punctuation rather than a tell.
const OUT_OF_SCOPE = [
    /__tests__|\.test\.|\.itest\.|testkit/,
    /^app\/views\/theme-demo\.ts$/, // sample agency prose rendered in the theme preview
];

// Lines that carry an em-dash for a reason. Each needs the file AND the reason, so an exception
// shows up in review rather than accumulating quietly.
const ALLOW = {
    "editor/panels/DataEditor.tsx": "a leading dash marks the empty option in the parent select",
};

const CODE = /\.(?:ts|tsx)$/;

const inScope = (f) =>
    CODE.test(f) && IN_SCOPE.some((re) => re.test(f)) && !OUT_OF_SCOPE.some((re) => re.test(f));

// Block and line comments both go; the `[^:"'\`]` guard keeps `https://` and a `//` inside a
// string from being mistaken for the start of a comment.
function stripComments(src) {
    return src
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .split("\n")
        .map((l) => l.replace(/(^|[^:"'`])\/\/.*$/, "$1"))
        .join("\n");
}

// `"—"` alone is the empty-value glyph, not a sentence; prose is the case we are after.
const isGlyphOnly = (line) => {
    const stripped = line.replace(/(["'`])\s*—\s*\1/g, "");
    return !stripped.includes(DASH);
};

export function scan(files, read = (f) => readFileSync(f, "utf8")) {
    const hits = [];
    for (const file of files) {
        const allowed = ALLOW[file];
        stripComments(read(file))
            .split("\n")
            .forEach((text, i) => {
                if (!text.includes(DASH) || isGlyphOnly(text)) return;
                if (allowed) return;
                hits.push({ file, line: i + 1, text: text.trim() });
            });
    }
    return hits;
}

const w = (s) => process.stdout.write(`${s}\n`);

// ---- self-check: plant a violation and confirm the scan sees it ----------------------------
function selfCheck() {
    const dir = mkdtempSync(join(process.cwd(), "app", "copy-check-"));
    const file = join(dir, "probe.tsx");
    try {
        writeFileSync(file, 'export const probe = "Saved your work — you can close this now.";\n');
        const rel = file.slice(process.cwd().length + 1);
        return scan([rel]).length > 0;
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
}

// A killed process skips `finally`, so sweep anything a previous interrupted run left behind.
for (const stale of execFileSync("git", ["status", "--porcelain", "--untracked-files=all"], {
    encoding: "utf8",
})
    .split("\n")
    .map((l) => l.slice(3).trim())
    .filter((p) => /(?:^|\/)copy-check-[A-Za-z0-9]+\//.test(p))) {
    rmSync(stale.replace(/\/.*$/, ""), { recursive: true, force: true });
}

if (!selfCheck()) {
    w("");
    w("Copy guard self-check failed: a planted em-dash was NOT reported.");
    w(`The scan in ${SELF} has stopped working — fix it before trusting a green run.`);
    process.exit(1);
}

const files = execFileSync("git", ["ls-files"], { encoding: "utf8" })
    .split("\n")
    .filter((f) => f && f !== SELF && inScope(f) && existsSync(f));

const hits = scan(files);

if (!hits.length) {
    w(`✓ no em-dashes in user-facing copy (${files.length} files scanned)`);
    process.exit(0);
}

w("");
w("Copy guard failed: an em-dash in user-facing copy.\n");
for (const h of hits) w(`  ${h.file}:${h.line}  ${h.text.slice(0, 110)}`);
w("");
w("An em-dash joining two clauses reads as machine-written. Use a comma when the second clause");
w("qualifies the first, a period when it is a separate thought, a colon before a list, a middot");
w(
    `when joining a label to a value. If the dash is genuinely typographic, add it to ALLOW in ${SELF}.`,
);
process.exit(1);
