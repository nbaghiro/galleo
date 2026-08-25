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

// Where the words are read: by a person on screen, or by the model, which copies the register it
// is shown. Backend prose is in scope where it reaches either: transactional email, the plan
// catalogue, the template blurbs, and every prompt.
const IN_SCOPE = [
    /^app\//,
    /^website\//,
    /^ui\//,
    /^editor\//,
    /^publish\//,
    /^model\/(?:billing|templates)\.ts$/,
    /^services\/core\/mail\.ts$/,
    // The prompts are copy too: the model imitates the register it is shown, and 169 em-dashes in
    // here were why it wrote them back out. Structural separators in rendered rows use a middot.
    /^services\/core\/ai\/prompts\//,
    // The starter-template bodies. This is the copy a person clones and then publishes under their
    // own name, so it is the most-read prose the product ships; 295 lines of it carried an em-dash
    // while the rule that bans them scanned everything except this file.
    /^services\/core\/templates\.ts$/,
    // Element `create()` defaults and the blueprint placeholders: whatever they say is inserted
    // into a real document the moment someone drops the element. Comments here use em-dashes
    // freely and are stripped before the scan, and the one legitimate dash (the `dash` bullet
    // marker) is a bare glyph, which passes on its own.
    /^canvas\/elements\//,
];

// Not copy: tests, fixtures, and the sample artifacts whose whole job is to look like real
// editorial writing, where an em-dash is correct punctuation rather than a tell.
const OUT_OF_SCOPE = [
    /__tests__|\.test\.|\.itest\.|testkit/,
    /^app\/views\/theme-demo\.ts$/, // sample agency prose rendered in the theme preview
    // The visual-eval corpus is measured byte-for-byte between runs, so its prose is a fixed input
    // rather than copy anyone reads. `services/core/ai/prompts/` above does not reach it, but say
    // so here rather than leave it to the reader of a path.
    /^services\/core\/ai\/corpus\//,
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
//
// Line comments go FIRST. A `/*` inside one (`see services/api/*`) would otherwise open a block that
// runs to the next `*/` or to the end of the file, and every string in between stops being scanned:
// the guard goes quiet instead of going red, which is the one failure a guard must not have.
function stripComments(src) {
    return src
        .split("\n")
        .map((l) => l.replace(/(^|[^:"'`])\/\/.*$/, "$1"))
        .join("\n")
        .replace(/\/\*[\s\S]*?\*\//g, "");
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
        // The second line is the shape that once blinded the whole scan: a `/*` inside a line comment
        // opened a block that swallowed every string after it. A plain planted dash would not catch it.
        writeFileSync(
            file,
            'export const probe = "Saved your work — you can close this now.";\n' +
                "// see services/api/*\n" +
                'export const after = "Renamed the folder — everything inside moved with it.";\n' +
                "const el = <p>{/* a note */}</p>;\n",
        );
        const rel = file.slice(process.cwd().length + 1);
        return scan([rel]).length === 2;
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
