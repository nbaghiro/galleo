// Structural-map guard: fails when a per-file map in the docs stops matching its directory.
//
// The sibling guard (check-modules.mjs) does this for the one `model/` paragraph in AGENTS.md. This
// does it for the codebase maps in .docs/architecture.md, which had no guard at all and rotted
// accordingly: the editor/ map described five folders that never existed, and the render/ map named
// three files that had been renamed. Prose cannot be diffed against reality by review alone.
//
// The contract is opt-in and explicit rather than heuristic, so marking a new map is one line and no
// block is parsed by accident: a `<!-- map: <dir> [<dir>...] -->` comment binds the fenced block that
// follows it to those directories. Every `*.ts`/`*.tsx` in them (non-recursive, tests and .d.ts
// excluded) must be named somewhere in the block, and the block must name nothing that is not there.
// Several blocks may claim the same directory; their union is what has to cover it.
//
// Self-verifying: a guard that can only report violations cannot tell you it has stopped working, so
// it plants a drift and fails if the check stays quiet.
//
// Uses process.stdout.write rather than console because `no-console` is an error repo-wide.

import { readFileSync, readdirSync } from "node:fs";

const SELF = "scripts/check-maps.mjs";
const DOC = ".docs/architecture.md";

const w = (s) => process.stdout.write(`${s}\n`);

// files a map is expected to account for
function filesIn(dir) {
    return readdirSync(dir, { withFileTypes: true })
        .filter((e) => e.isFile() && /\.tsx?$/.test(e.name) && !e.name.endsWith(".d.ts"))
        .map((e) => e.name)
        .sort();
}

// every `<!-- map: … -->` and the fenced block after it, as { dirs, body }
function markedBlocks(doc) {
    const out = [];
    const re = /<!--\s*map:\s*([^>]+?)\s*-->\s*\n```[^\n]*\n([\s\S]*?)\n```/g;
    for (const m of doc.matchAll(re)) out.push({ dirs: m[1].split(/\s+/), body: m[2] });
    return out;
}

export function check(doc, listing) {
    const blocks = markedBlocks(doc);
    if (!blocks.length) return { fatal: `no \`<!-- map: … -->\` block in ${DOC}` };

    // union the blocks per directory, so a concept split across two fences still counts
    const named = new Map();
    for (const b of blocks) {
        const tokens = new Set([...b.body.matchAll(/([A-Za-z][\w.-]*\.tsx?)\b/g)].map((m) => m[1]));
        for (const dir of b.dirs) {
            const set = named.get(dir) ?? new Set();
            for (const t of tokens) set.add(t);
            named.set(dir, set);
        }
    }

    const problems = [];
    // Staleness is repo-wide, since hasElsewhere searches every directory. Attribute each stale name
    // to the first directory that surfaces it, or a block bound to two (editor/core editor/panels)
    // reports the same missing file once per directory and reads as two problems.
    const seen = new Set();
    for (const [dir, set] of named) {
        const real = listing(dir);
        const missing = real.filter((f) => !set.has(f));
        // only flag a named file that looks like it belongs to this directory, since a block may
        // legitimately cite a file elsewhere (services/core/ai/prompts/catalog.ts, for one)
        const stale = [...set].filter((f) => !real.includes(f) && !hasElsewhere(f) && !seen.has(f));
        for (const f of stale) seen.add(f);
        if (missing.length || stale.length) problems.push({ dir, missing, stale });
    }
    return { problems, blocks: blocks.length, dirs: [...named.keys()] };
}

// a token is only stale if no directory in the repo holds a file by that name
let everyFile = null;
function hasElsewhere(name) {
    everyFile ??= new Set(
        (function walk(d, acc) {
            for (const e of readdirSync(d, { withFileTypes: true })) {
                if (["node_modules", ".git", "dist", "coverage", "test-results"].includes(e.name))
                    continue;
                const p = `${d}/${e.name}`;
                if (e.isDirectory()) walk(p, acc);
                else acc.push(e.name);
            }
            return acc;
        })(".", []),
    );
    return everyFile.has(name);
}

const doc = readFileSync(DOC, "utf8");

// ---- self-check: plant a drift and confirm the check sees it -------------------------------
const planted = check(doc, (dir) => [...filesIn(dir), "definitely-not-a-real-file.ts"]);
if (!planted.problems?.some((p) => p.missing.includes("definitely-not-a-real-file.ts"))) {
    w("");
    w(`Map guard self-check failed: a planted file was NOT reported as missing from ${DOC}.`);
    w(`The check in ${SELF} has stopped working; fix it before trusting a green run.`);
    process.exit(1);
}

const { fatal, problems, blocks, dirs } = check(doc, filesIn);

if (fatal) {
    w("");
    w(`Map guard failed: ${fatal}`);
    process.exit(1);
}

if (!problems.length) {
    w(`✓ ${blocks} marked maps in ${DOC} match their directories (${dirs.join(", ")})`);
    process.exit(0);
}

w("");
w(`Map guard failed: ${DOC} no longer describes the tree.\n`);
for (const p of problems) {
    if (p.missing.length) w(`  in ${p.dir}/ but not in its map:  ${p.missing.join(", ")}`);
    if (p.stale.length) w(`  in the map but nowhere in the repo:  ${p.stale.join(", ")}`);
}
w("");
w(
    "These maps are where a contributor decides which file a change belongs in, so a stale one sends",
);
w(`work to the wrong place. Update the block under the matching \`<!-- map: … -->\` in ${DOC}.`);
process.exit(1);
