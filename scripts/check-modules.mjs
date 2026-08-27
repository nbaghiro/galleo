// Module-map guard: fails when AGENTS.md's `model/` map stops matching the directory.
//
// The map is the first thing a contributor (human or agent) reads to decide where something goes, so
// a stale one sends work to the wrong file. It has drifted three times in two weeks: files landed
// without an entry, and the stated count outlived two consolidations. Prose cannot be diffed against
// reality by review alone, so it is checked here.
//
// What is checked: every `model/*.ts` is named somewhere in the map paragraph, nothing is named that
// no longer exists, and the spelled-out count matches the file count.
//
// Self-verifying: a guard that can only report violations cannot tell you it has stopped working, so
// it plants a drift and fails if the check stays quiet.
//
// Uses process.stdout.write rather than console because `no-console` is an error repo-wide.

import { readFileSync, readdirSync } from "node:fs";

const SELF = "scripts/check-modules.mjs";
const DOC = "AGENTS.md";

// The paragraph is the bullet that opens the Structure list; it ends at the next bullet.
const MAP_START = "- **`model/`**";

const WORDS = {
    ten: 10,
    eleven: 11,
    twelve: 12,
    thirteen: 13,
    fourteen: 14,
    fifteen: 15,
    sixteen: 16,
    seventeen: 17,
    eighteen: 18,
    nineteen: 19,
    twenty: 20,
};

function mapParagraph(doc) {
    const from = doc.indexOf(MAP_START);
    if (from < 0) return null;
    const rest = doc.slice(from + MAP_START.length);
    const to = rest.indexOf("\n- **");
    return rest.slice(0, to < 0 ? undefined : to);
}

export function check(doc, files) {
    const para = mapParagraph(doc);
    if (para === null) return { fatal: `no \`${MAP_START}\` paragraph in ${DOC}` };

    // every `name` in backticks that is not a path or an alias
    const named = new Set(
        [...para.matchAll(/`([a-z][a-zA-Z0-9-]*)`/g)]
            .map((m) => m[1])
            .filter((n) => !n.includes("/") && !n.startsWith("@")),
    );
    const missing = files.filter((f) => !named.has(f));
    const stale = [...named].filter((n) => !files.includes(n) && n !== "model");

    const word = para.match(/\b([A-Z][a-z]+) files;/);
    const stated = word ? WORDS[word[1].toLowerCase()] : undefined;
    const countWrong =
        stated !== undefined && stated !== files.length ? { stated, real: files.length } : null;

    return { missing, stale, countWrong, wordFound: !!word };
}

const w = (s) => process.stdout.write(`${s}\n`);

const files = readdirSync("model")
    .filter((f) => f.endsWith(".ts"))
    .map((f) => f.replace(/\.ts$/, ""))
    .sort();

// self-check: plant a drift and confirm the check sees it
const doc = readFileSync(DOC, "utf8");
const planted = check(doc, [...files, "definitely-not-a-real-module"]);
if (!planted.missing?.includes("definitely-not-a-real-module")) {
    w("");
    w(`Module-map self-check failed: a planted file was NOT reported as missing from ${DOC}.`);
    w(`The check in ${SELF} has stopped working; fix it before trusting a green run.`);
    process.exit(1);
}

const { fatal, missing, stale, countWrong, wordFound } = check(doc, files);

if (fatal) {
    w("");
    w(`Module-map guard failed: ${fatal}`);
    process.exit(1);
}
if (!missing.length && !stale.length && !countWrong) {
    w(
        `✓ the model/ map in ${DOC} matches the directory (${files.length} files${wordFound ? ", count included" : ""})`,
    );
    process.exit(0);
}

w("");
w(`Module-map guard failed: ${DOC} no longer describes model/.\n`);
if (missing.length) w(`  in model/ but not in the map:  ${missing.join(", ")}`);
if (stale.length) w(`  in the map but not in model/:  ${stale.join(", ")}`);
if (countWrong) w(`  the map says ${countWrong.stated} files; there are ${countWrong.real}`);
w("");
w("The map is where a contributor decides which file a change belongs in, so a stale one sends");
w(`work to the wrong place. Update the \`model/\` paragraph in ${DOC}, including its count.`);
process.exit(1);
