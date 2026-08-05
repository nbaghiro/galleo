// Program-membership guard: fails when a tracked .ts/.tsx file is not in the tsc program.
//
// tsc reports success on the files it was given and says nothing about the ones it never saw, so a
// green typecheck only means something alongside this check (`website/` once shipped untypechecked).

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();

// git ls-files reads the index; a tracked file deleted in the working tree is not tsc's problem.
const tracked = execFileSync("git", ["ls-files", "*.ts", "*.tsx"], { encoding: "utf8" })
    .split("\n")
    .filter((f) => f && existsSync(f));

// tsc exits non-zero on any type error, routine mid-refactor, but still prints --listFiles: read
// stdout either way and keep only absolute paths, since diagnostics are relative and drop out.
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
