// Boundary self-check: proves the layering law still reports, rather than trusting a clean run.
//
// `import/no-restricted-paths` silently checks nothing when a specifier fails to resolve, which is how
// the law once sat dead here: ESLint reported success without examining a single import. So this
// plants a real violation and fails if either enforcement path stays quiet.

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const REQUIRED = ["import/no-restricted-paths", "no-restricted-imports"];

// canvas may not reach editor; both the alias and relative forms must be caught.
const dir = mkdtempSync(join(process.cwd(), "canvas", "boundary-check-"));
const file = join(dir, "probe.ts");

const w = (s) => process.stdout.write(`${s}\n`);

// process.exit() skips finally, so the probe dir is removed before any exit path is taken.
let silent = [];
try {
    writeFileSync(file, 'import { Editor } from "@editor/Editor";\nexport const probe = Editor;\n');

    let output = "";
    try {
        execFileSync("pnpm", ["exec", "eslint", file, "--format", "json"], { encoding: "utf8" });
    } catch (e) {
        // a violating file makes eslint exit non-zero; the JSON report is what we want
        output = e.stdout ?? "";
    }

    const reported = new Set((JSON.parse(output || "[]")[0]?.messages ?? []).map((m) => m.ruleId));
    silent = REQUIRED.filter((r) => !reported.has(r));
} finally {
    rmSync(dir, { recursive: true, force: true });
}

if (silent.length) {
    w("");
    w("Boundary self-check failed: a canvas → editor import was NOT reported by:");
    for (const r of silent) w(`    ${r}`);
    w("");
    w("The layering law is not being enforced. For import/no-restricted-paths this usually means");
    w("the TS resolver is missing or broken (settings['import/resolver'] in eslint.config.js), so");
    w("every specifier fails to resolve and the rule skips silently.");
    process.exit(1);
}

w(`✓ boundary law is live (${REQUIRED.join(", ")})`);
