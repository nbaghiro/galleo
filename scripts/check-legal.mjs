// Legal guard: fails when an unresolved placeholder is still in the legal pages.
//
// The privacy policy and the terms were drafted around decisions nobody has made yet (the entity
// name, the governing law, the retention periods), and each one is left in the page as a bracketed
// marker in capitals so it cannot be quietly forgotten. Those pages are a legal statement rather
// than marketing copy, so publishing one that still names its own gaps is worse than publishing
// nothing: a reader learns the document was never finished, and a regulator reads a policy that
// does not say who the controller is.
//
// The page renders every marker in a loud inline chip, which is the reminder while the drafting is
// in progress. This is the gate that stops one reaching production, so it is expected to FAIL until
// the placeholders are resolved. It is deliberately not wired into pre-commit or CI yet.
//
// Self-verifying: a guard that can only report violations cannot tell you it has stopped working,
// so it runs the scan over a planted marker and over a clean sample before trusting a real result.
//
// Uses process.stdout.write rather than console because `no-console` is an error repo-wide.

import { existsSync, readFileSync } from "node:fs";

const SELF = "scripts/check-legal.mjs";
const PAGES = ["website/LegalPage.tsx"];

// Two leading capitals, so the marker shape (`[LEGAL ENTITY NAME]`, `[AGE]`) is matched and the
// code around it is not: a Tailwind bracket value is lowercase, an index is a digit or an
// identifier, and a character class carries punctuation in the first two positions.
const PLACEHOLDER = /\[[A-Z][A-Z0-9][^\]]*\]/g;

export function scan(files, read = (f) => readFileSync(f, "utf8")) {
    const hits = [];
    for (const file of files) {
        read(file)
            .split("\n")
            .forEach((text, i) => {
                for (const m of text.matchAll(PLACEHOLDER)) {
                    hits.push({ file, line: i + 1, marker: m[0] });
                }
            });
    }
    return hits;
}

const w = (s) => process.stdout.write(`${s}\n`);

// ---- self-check: the scan must see a planted marker and stay quiet on clean code ------------
const PLANTED = [
    'text: "[LEGAL ENTITY NAME] operates Galleo at galleo.app.",',
    'text: "We answer within 60 days at [DESIGNATED REQUEST ADDRESS].",',
].join("\n");

const CLEAN = [
    'const cls = "max-w-[68ch] min-w-168";',
    "const PLACEHOLDER = /(\\[[^\\]]+\\])/g;",
    "const first = row[0] ?? DOCS[id].title;",
    'text: "Sessions expire after 30 days.",',
].join("\n");

const planted = scan(["probe.tsx"], () => PLANTED);
const clean = scan(["probe.tsx"], () => CLEAN);
if (planted.length !== 2 || clean.length !== 0) {
    w("");
    w(
        "Legal guard self-check failed: the scan no longer separates a placeholder from ordinary code.",
    );
    w(`  planted markers reported: ${planted.length} (expected 2)`);
    w(`  clean lines reported:     ${clean.length} (expected 0)`);
    w(`Fix the scan in ${SELF} before trusting a green run.`);
    process.exit(1);
}

const missing = PAGES.filter((f) => !existsSync(f));
if (missing.length) {
    w("");
    w(`Legal guard failed: the page it checks is gone (${missing.join(", ")}).`);
    w(`Point ${SELF} at wherever the legal copy moved, so it keeps guarding something.`);
    process.exit(1);
}

const hits = scan(PAGES);

if (!hits.length) {
    w(`✓ no unresolved placeholders in the legal pages (${PAGES.join(", ")})`);
    process.exit(0);
}

w("");
w(`Legal guard failed: ${hits.length} unresolved placeholder(s) in the legal pages.\n`);
for (const h of hits) w(`  ${h.file}:${h.line}  ${h.marker.slice(0, 96)}`);
w("");
w("Each marker is a decision that has not been made. The pages must not ship while one stands:");
w("a privacy policy that names its own gaps tells a reader it was never finished. Resolve the");
w("decision and write the answer into the page; there is no way to silence this from the source.");
process.exit(1);
