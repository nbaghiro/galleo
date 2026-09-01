// Suppression guard: fails when a new escape hatch lands in tracked source.
//
// The backstop to eslint.config.js: it reads tracked source directly, so it also fires in ignored
// directories, file types ESLint skips, and for markers no linter models (prettier-ignore, coverage).
// Adding an exception means editing ALLOW below, so it shows up in review.
//
// Uses process.stdout.write rather than console because `no-console` is an error repo-wide.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const SELF = "scripts/check-suppressions.mjs";

// Markers that must never appear; `budget` markers are capped instead.
//
// Anchored to `//` or `/*` because a directive only takes effect at a comment's start: prose that
// merely names one (this file, docs) must not trip the guard.
const directive = (body) => new RegExp(String.raw`(?://|/\*)\s*${body}`);

const MARKERS = [
    { id: "eslint-disable", re: directive(String.raw`eslint-disable(?:-next-line|-line)?\b`) },
    { id: "eslint-enable", re: directive(String.raw`eslint-enable\b`) },
    { id: "@ts-ignore", re: directive(String.raw`@ts-ignore\b`) },
    { id: "@ts-expect-error", re: directive(String.raw`@ts-expect-error\b`) },
    { id: "@ts-nocheck", re: directive(String.raw`@ts-nocheck\b`) },
    { id: "prettier-ignore", re: directive(String.raw`prettier-ignore\b`) },
    { id: "coverage-ignore", re: directive(String.raw`(?:v8|c8|istanbul) ignore\b`) },
    { id: "double-assertion", re: /\bas unknown as\b/, budget: 4 },
];

// Files allowed to carry a budgeted marker, with the reason. Anything else is a hard failure.
const ALLOW = {
    "double-assertion": [
        "canvas/testkit.ts", // partial CanvasRenderingContext2D stub
        "services/__tests__/reset-db.ts", // raw SQL row shape
        "ui/__tests__/motion.dom.test.ts", // installs a WAAPI recorder happy-dom lacks onto the prototype
    ],
};

const CODE = /\.(?:ts|tsx|js|jsx|mjs|cjs)$/;

// git ls-files reads the index, so a tracked file deleted in the working tree is still listed.
const files = execFileSync("git", ["ls-files"], { encoding: "utf8" })
    .split("\n")
    .filter((f) => f && CODE.test(f) && f !== SELF && existsSync(f));

const hits = [];
for (const file of files) {
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((text, i) => {
        for (const { id, re } of MARKERS) {
            if (re.test(text)) hits.push({ id, file, line: i + 1, text: text.trim() });
        }
    });
}

const failures = [];
for (const { id, budget } of MARKERS) {
    const found = hits.filter((h) => h.id === id);
    if (!found.length) continue;
    const allowed = ALLOW[id] ?? [];
    const stray = found.filter((h) => !allowed.includes(h.file));
    if (stray.length) failures.push({ id, hits: stray, reason: "not allowlisted" });
    else if (budget !== undefined && found.length > budget) {
        failures.push({ id, hits: found, reason: `over budget (${found.length} > ${budget})` });
    }
}

const w = (s) => process.stdout.write(`${s}\n`);

if (!failures.length) {
    const budgeted = hits.length;
    w(`✓ no stray suppressions (${files.length} files scanned, ${budgeted} allowlisted)`);
    process.exit(0);
}

w("");
w("Suppression guard failed.\n");
for (const { id, hits: list, reason } of failures) {
    w(`  ${id} — ${reason}`);
    for (const h of list) w(`    ${h.file}:${h.line}  ${h.text.slice(0, 100)}`);
    w("");
}
w("Fix the underlying problem rather than suppressing it. If the escape hatch is genuinely");
w(`correct, add the file to ALLOW in ${SELF} so the exception is reviewed.`);
process.exit(1);
