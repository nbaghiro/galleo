// Program-membership guard: fails when a tracked .ts/.tsx file is not in the tsc program.
//
// `website/` shipped to production untypechecked because tsconfig's `include` listed directories by
// hand and nobody noticed the omission: tsc reports success on the files it was given, and says
// nothing about the ones it never saw. A green typecheck is only meaningful alongside this check.

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();

// git ls-files reads the index; a tracked file deleted in the working tree is not tsc's problem.
const tracked = execFileSync("git", ["ls-files", "*.ts", "*.tsx"], { encoding: "utf8" })
    .split("\n")
    .filter((f) => f && existsSync(f));

// tsc exits non-zero whenever the tree has a type error, which is routine mid-refactor. It still
// prints --listFiles, so read stdout either way and keep only the absolute paths; diagnostics are
// relative ("app/x.ts(3,4): error TS...") and drop out. Membership is a separate question from
// whether the code currently compiles, and `pnpm typecheck` already owns the latter.
let listing = "";
try {
    listing = execFileSync("pnpm", ["exec", "tsc", "--noEmit", "--listFiles"], {
        encoding: "utf8",
        maxBuffer: 64 * 1024 * 1024,
    });
} catch (e) {
    listing = e.stdout ?? "";
    if (!listing) {
        process.stdout.write(
            "Could not read the tsc file list; run `pnpm typecheck` for details.\n",
        );
        process.exit(1);
    }
}

const compiled = new Set(
    listing
        .split("\n")
        .map((f) => f.trim())
        .filter((f) => f.startsWith("/"))
        .map((f) => resolve(f)),
);

const missing = tracked.filter((f) => !compiled.has(resolve(root, f)));

const w = (s) => process.stdout.write(`${s}\n`);

if (!missing.length) {
    w(`✓ all ${tracked.length} tracked TS files are in the tsc program`);
    process.exit(0);
}

w("");
w("Program-membership guard failed: these tracked files are never typechecked.\n");
for (const f of missing) w(`    ${f}`);
w("");
w('Add the directory to "include" in tsconfig.json.');
process.exit(1);
