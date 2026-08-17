// Body-validation guard: fails when a route reads a request body without stating its shape.
//
// A body is untrusted input. readJson used to be `(await c.req.json()) as T`, which handed every
// route a fully-typed object that had never been checked, so the only thing standing between a
// malformed body and the database was whatever the handler happened to test. One route did
// validate, and it accepted an insert with no index, which reached splice as NaN and prepended the
// section instead of rejecting it. The type said the field was a number the whole time.
//
// What is checked: every readJson call passes a schema as its second argument, and no file
// reaches for c.req.json() directly to get around it.
//
// Self-verifying: a guard that can only report violations cannot tell you it has stopped working,
// so it plants both violations and fails if the scan stays quiet.
//
// Uses process.stdout.write rather than console because `no-console` is an error repo-wide.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const SELF = "scripts/check-validation.mjs";
const HELPER = "services/utils/http.ts";

// readJson with a single argument: the schema-less form the migration removed. The gap is [^(]*
// rather than a <…> match so a nested generic (readJson<Partial<FolderInput>>) still reads as one
// call; type arguments cannot contain a paren, so this cannot run past the call it belongs to.
const UNVALIDATED = /\breadJson\b[^(]*\(\s*c\s*\)/;
// the escape hatch around the helper; http.ts itself is where the one legitimate call lives
const RAW_JSON = /\bc\.req\.json\s*\(/;

const inScope = (f) => /^services\/.*\.ts$/.test(f) && !/__tests__|\.test\.|\.itest\./.test(f);

export function scan(files, read = (f) => readFileSync(f, "utf8")) {
    const hits = [];
    for (const file of files) {
        read(file)
            .split("\n")
            .forEach((text, i) => {
                const at = { file, line: i + 1, text: text.trim() };
                if (UNVALIDATED.test(text)) hits.push({ ...at, why: "readJson with no schema" });
                if (RAW_JSON.test(text) && file !== HELPER)
                    hits.push({ ...at, why: "c.req.json() bypasses readJson" });
            });
    }
    return hits;
}

const w = (s) => process.stdout.write(`${s}\n`);

// ---- self-check: plant every violation shape and confirm the scan sees them ------------------
// The nested generic is deliberate: the first version of this guard matched <…> with [^>]*, which
// a readJson<Partial<FolderInput>>(c) slipped straight through while a probe using <Thing> passed.
const PROBES = {
    "plain.ts": "const body = await readJson(c);\n",
    "generic.ts": "const body = await readJson<Thing>(c);\n",
    "nested.ts": "const body = await readJson<Partial<FolderInput>>(c);\n",
    "raw.ts": "const body = await c.req.json();\n",
};
const planted = scan(Object.keys(PROBES), (f) => PROBES[f]);
const missed = Object.keys(PROBES).filter((f) => !planted.some((h) => h.file === f));
if (missed.length) {
    w("");
    w(
        `Validation guard self-check failed: planted violations went unreported (${missed.join(", ")}).`,
    );
    w(`The scan in ${SELF} has stopped working; fix it before trusting a green run.`);
    process.exit(1);
}

const files = execFileSync("git", ["ls-files"], { encoding: "utf8" })
    .split("\n")
    .filter((f) => f && inScope(f) && existsSync(f));

const hits = scan(files);

if (!hits.length) {
    w(`✓ every request body is validated (${files.length} files scanned)`);
    process.exit(0);
}

w("");
w("Validation guard failed: a request body is read without a schema.\n");
for (const h of hits) w(`  ${h.file}:${h.line}  ${h.why}\n      ${h.text.slice(0, 100)}`);
w("");
w("Pass a zod schema: `await readJson(c, zThing)`, which returns null when the body does not");
w("match, so the route can answer 400. Schemas that carry stored content must not rebuild it:");
w("use z.looseObject or z.custom, or fields this layer does not enumerate are dropped on write.");
process.exit(1);
