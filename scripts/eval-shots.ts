import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ArtifactContent } from "@model/artifact";
import { aria } from "@services/core/ai/corpus/aria";
import { fieldnotes } from "@services/core/ai/corpus/fieldnotes";
import { galleo } from "@services/core/ai/corpus/galleo";
import { helios } from "@services/core/ai/corpus/helios";
import { lumen } from "@services/core/ai/corpus/lumen";
import { slowweb } from "@services/core/ai/corpus/slowweb";
import { terra } from "@services/core/ai/corpus/terra";
import { judgeVisuals } from "@services/core/ai/eval/visual-judge";
import { session } from "./shoot";

/**
 * Headless capture and measurement over the corpus.
 *
 *   pnpm eval:shots              measure only, and report every check that fails
 *   pnpm eval:shots --write DIR  also write the PNGs, for eyeballing or a pixel diff
 *   pnpm eval:shots --judge      also run the vision judge (spends tokens, one call per section)
 *
 * This is the only place the height-derived checks can be trusted: `fills-frame` and `fits-frame`
 * both depend on text metrics, and every Node measurer is a stand-in. The corpus is the quality bar,
 * so a check it fails here is miscalibrated by definition.
 */

const CORPUS: Record<string, ArtifactContent> = {
    galleo,
    aria,
    helios,
    lumen,
    terra,
    slowweb,
    fieldnotes,
};

/**
 * Corpus flaws we have seen and not yet fixed, so the gate stays useful instead of being switched
 * off. `aria/s9` genuinely overflows a 16:9 frame by 215px: the editor stack is continuous so it
 * merely grows, but the same section is clipped in Present and in a thumbnail. Fix the section and
 * delete the entry.
 */
const KNOWN: Record<string, string> = {
    "aria/section:s9/fits-frame": "overflows the 16:9 frame; clipped in Present",
};

const out = (s: string): void => {
    process.stdout.write(`${s}\n`);
};
const judging = (): boolean => process.argv.includes("--judge");
const dirArg = (): string | null => {
    const i = process.argv.indexOf("--write");
    return i >= 0 ? (process.argv[i + 1] ?? "shots") : null;
};

/** Where a failing artifact's PNGs land when the caller asked for none: a red CI job with no image
 *  is a check id and a guess, which is exactly the confidence gap CI has against the /eval UI. */
const FAILURE_DIR = "shots";

async function main(): Promise<void> {
    const dir = dirArg();
    if (dir) mkdirSync(dir, { recursive: true });

    let failures = 0;
    let total = 0;
    const tally: Record<string, number> = {};

    await session(async (shoot) => {
        for (const [name, content] of Object.entries(CORPUS)) {
            const cap = await shoot(content);
            total += cap.checks.length;

            let failedHere = 0;
            for (const c of cap.checks.filter((x) => !x.pass)) {
                const known = KNOWN[`${name}/${c.target}/${c.id}`];
                if (known) {
                    out(`  ~ ${name}/${c.target} ${c.id} — known: ${known}`);
                    continue;
                }
                failures += 1;
                failedHere += 1;
                tally[c.id] = (tally[c.id] ?? 0) + 1;
                out(`  ✗ ${name}/${c.target} ${c.id}${c.detail ? ` — ${c.detail}` : ""}`);
            }

            const shapes = cap.shapes.map((s) => s.archetype).join(" ");
            out(`${name.padEnd(11)} ${cap.shots.length} sections · ${shapes}`);

            // the only part that costs money, so it is opt-in and runs after the free checks
            if (judging()) {
                const verdicts = await judgeVisuals(
                    cap.shots.map((sh) => ({ id: sh.id, png: sh.png })),
                );
                for (const v of verdicts) {
                    const no = v.answers.filter((a) => !a.yes);
                    if (no.length)
                        out(`    ${v.target}: ${no.map((a) => `${a.id} — ${a.why}`).join(" | ")}`);
                }
            }

            // always keep the evidence for an artifact that failed, even without --write
            const target = dir ?? (failedHere ? FAILURE_DIR : null);
            if (target) {
                mkdirSync(join(target, name), { recursive: true });
                writeFileSync(join(target, name, "_strip.png"), cap.strip);
                for (const s of cap.shots) writeFileSync(join(target, name, `${s.id}.png`), s.png);
            }
        }
    });

    out("");
    out(
        failures
            ? `${failures} of ${total} checks failed: ${JSON.stringify(tally)}`
            : `all ${total} checks pass across the corpus`,
    );
    if (dir) out(`PNGs → ${dir}/`);
    else if (failures) out(`PNGs for the failing artifacts → ${FAILURE_DIR}/`);
    process.exit(failures ? 1 : 0);
}

main().catch((e: unknown) => {
    process.stderr.write(`${String(e)}\n`);
    process.exit(1);
});
