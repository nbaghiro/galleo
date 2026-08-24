// Boundary self-check: proves the layering laws still report, rather than trusting a clean run.
//
// `import/no-restricted-paths` silently checks nothing when a specifier fails to resolve, which is how
// the law once sat dead here: ESLint reported success without examining a single import. So this
// plants a real violation and fails if either enforcement path stays quiet. Three laws are probed:
// the outer one (model · canvas · ui · editor · app), the leaf builds and tooling that hang off it
// (publish · website · widget · scripts · e2e), and the tier law inside services/.

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const REQUIRED = ["import/no-restricted-paths", "no-restricted-imports"];

const PROBES = [
    {
        law: "outer layering",
        under: "canvas",
        violation: "canvas → editor",
        // alias form; the relative form is covered by the same rule pair
        source: 'import { Editor } from "@editor/Editor";\nexport const probe = Editor;\n',
    },
    {
        law: "outer layering (alias form)",
        under: "app",
        violation: "app → @services",
        source: 'import { listArtifacts } from "@services/core/artifacts";\nexport const probe = listArtifacts;\n',
    },
    {
        law: "services layer",
        under: join("services", "core"),
        violation: "core → api",
        // relative form stays banned even though the canonical spelling is now @services/…
        source: 'import { requireUser } from "../../api/middleware";\nexport const probe = requireUser;\n',
    },
    {
        law: "services layer (alias form)",
        under: join("services", "core"),
        violation: "core → @services/api",
        source: 'import { requireUser } from "@services/api/middleware";\nexport const probe = requireUser;\n',
    },
    {
        law: "core-is-not-routes",
        under: join("services", "core"),
        violation: "core → hono",
        rules: ["no-restricted-imports"], // resolver-free only: hono resolves fine, it is just banned here
        source: 'import { Hono } from "hono";\nexport const probe = new Hono();\n',
    },
    {
        law: "utils-is-database-free",
        under: join("services", "utils"),
        violation: "utils → db",
        source: 'import { db } from "../../db/client";\nexport const probe = db;\n',
    },
    {
        law: "leaf builds",
        under: "publish",
        violation: "publish → @app",
        source: 'import { api } from "@app/api";\nexport const probe = api;\n',
    },
    {
        law: "leaf builds (website)",
        under: "website",
        violation: "website → @app",
        source: 'import { api } from "@app/api";\nexport const probe = api;\n',
    },
    {
        // the widget bundles the solver with no framework, so @ui (Solid) is the line, not @app
        law: "widget-is-framework-free",
        under: "widget",
        violation: "widget → @ui",
        source: 'import { Mark } from "@ui/brand";\nexport const probe = Mark;\n',
    },
    {
        law: "tooling-is-not-the-shell",
        under: "scripts",
        violation: "scripts → @app",
        source: 'import { api } from "@app/api";\nexport const probe = api;\n',
    },
    {
        // bound to *.spec.ts, so the probe has to be named like a spec or the zone skips it
        law: "e2e-drives-the-real-thing",
        under: "e2e",
        name: "probe.spec.ts",
        violation: "e2e spec → @services",
        source: 'import { listArtifacts } from "@services/core/artifacts";\nexport const probe = listArtifacts;\n',
    },
];

const w = (s) => process.stdout.write(`${s}\n`);

function probe({ under, source, name, rules: probeRules }) {
    // process.exit() skips finally, so the probe dir is removed before any exit path is taken.
    const dir = mkdtempSync(join(process.cwd(), under, "boundary-check-"));
    const file = join(dir, name ?? "probe.ts");
    try {
        writeFileSync(file, source);
        let output = "";
        try {
            execFileSync("pnpm", ["exec", "eslint", file, "--format", "json"], {
                encoding: "utf8",
            });
        } catch (e) {
            // a violating file makes eslint exit non-zero; the JSON report is what we want
            output = e.stdout ?? "";
        }
        const reported = new Set(
            (JSON.parse(output || "[]")[0]?.messages ?? []).map((m) => m.ruleId),
        );
        return (probeRules ?? REQUIRED).filter((r) => !reported.has(r));
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
}

const dead = PROBES.map((p) => ({ ...p, silent: probe(p) })).filter((p) => p.silent.length);

if (dead.length) {
    w("");
    for (const p of dead) {
        w(`Boundary self-check failed: a ${p.violation} import was NOT reported by:`);
        for (const r of p.silent) w(`    ${r}`);
    }
    w("");
    w("A layering law is not being enforced. For import/no-restricted-paths this usually means");
    w("the TS resolver is missing or broken (settings['import/resolver'] in eslint.config.js), so");
    w("every specifier fails to resolve and the rule skips silently. For no-restricted-imports it");
    w("usually means a later config block replaced the layer's own entry for the same rule.");
    process.exit(1);
}

w(`✓ ${PROBES.map((p) => p.law).join(" + ")} laws are live (${REQUIRED.join(", ")})`);
