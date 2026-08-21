import "dotenv/config";
import { eq } from "drizzle-orm";
import type { ArtifactContent } from "@model/artifact";
import { contentToContainer } from "@model/artifact";
import { db } from "@services/db/client";
import { contentColumns } from "@services/core/artifacts";
import { syncArtifactAssets } from "@services/core/media";
import { schema } from "@services/db/schema";

/**
 * Backfill: `group` and `card` element types become `container`.
 *
 *   pnpm migrate:container            dry run, writes nothing (the default)
 *   pnpm migrate:container --write    apply
 *   pnpm migrate:container --verify   re-read and assert nothing is left
 *
 * Two stores hold element trees. `artifacts.digest` needs no touch (SectionSummary carries no
 * element types), `search_text` is derived from copy rather than structure, and `comments.anchor`
 * keys on element ids rather than paths or types, so none of them move.
 *
 * Artifact writes go through `contentColumns`, the same pair the save path uses, so `digest` and
 * `search_text` are re-derived rather than left stale and media urls stay adopted. Deliberately not
 * bumping `updatedAt` or `seq`: a type rename is not an edit, and bumping either would reorder the
 * library and resync every collaborator over a write nobody made.
 *
 * The transform is `contentToContainer` in @model/artifact, which returns the same object when a
 * tree did not change. That makes this idempotent: a second run writes nothing, so an interrupted
 * run is safe to repeat and needs no resume state.
 */

const has = (flag: string): boolean => process.argv.includes(`--${flag}`);
const out = (s: string): void => {
    process.stdout.write(`${s}\n`);
};

// counts what the transform will actually change, for the report
function countLegacy(content: ArtifactContent): { group: number; card: number } {
    let group = 0;
    let card = 0;
    const walk = (v: unknown): void => {
        if (Array.isArray(v)) {
            for (const x of v) walk(x);
            return;
        }
        if (!v || typeof v !== "object") return;
        const o = v as Record<string, unknown>;
        if (o.type === "group") group += 1;
        if (o.type === "card") card += 1;
        for (const x of Object.values(o)) walk(x);
    };
    for (const s of content.sections ?? []) walk(s.root);
    return { group, card };
}

interface Row {
    id: string;
    label: string;
    workspaceId?: string;
    content: ArtifactContent | null;
}

async function readAll(): Promise<{ artifacts: Row[]; runs: Row[] }> {
    const artifacts = await db
        .select({
            id: schema.artifacts.id,
            label: schema.artifacts.title,
            workspaceId: schema.artifacts.workspaceId,
            content: schema.artifacts.draftContent,
        })
        .from(schema.artifacts);
    const runs = await db
        .select({
            id: schema.evalRuns.id,
            label: schema.evalRuns.status,
            content: schema.evalRuns.content,
        })
        .from(schema.evalRuns);
    return {
        artifacts: artifacts as Row[],
        runs: runs.map((r) => ({ ...r, label: `eval ${r.label}` })) as Row[],
    };
}

async function main(): Promise<void> {
    const write = has("write");
    const { artifacts, runs } = await readAll();

    if (has("verify")) {
        let left = 0;
        for (const r of [...artifacts, ...runs]) {
            if (!r.content?.sections) continue;
            const n = countLegacy(r.content);
            if (n.group || n.card) {
                left += 1;
                out(`  STILL LEGACY ${r.id} ${r.label} group=${n.group} card=${n.card}`);
            }
        }
        out(left ? `\nFAILED: ${left} row(s) still carry group/card` : "\nverified: none left");
        process.exit(left ? 1 : 0);
    }

    out(write ? "applying" : "dry run (pass --write to apply)");
    let changed = 0;
    let groups = 0;
    let cards = 0;

    for (const [table, rows] of [
        ["artifacts", artifacts],
        ["eval_runs", runs],
    ] as const) {
        for (const r of rows) {
            if (!r.content?.sections) continue;
            const n = countLegacy(r.content);
            if (!n.group && !n.card) continue;
            const next = contentToContainer(r.content);
            if (next === r.content) continue; // nothing moved
            changed += 1;
            groups += n.group;
            cards += n.card;
            out(
                `  ${table.padEnd(9)} ${r.id.slice(0, 8)} ${String(r.label).slice(0, 34).padEnd(35)} group=${String(n.group).padStart(3)} card=${String(n.card).padStart(3)}`,
            );
            if (!write) continue;
            if (table === "artifacts")
                await db.transaction(async (tx) => {
                    const { columns, assetIds } = await contentColumns(r.workspaceId!, next, tx);
                    await tx
                        .update(schema.artifacts)
                        .set(columns)
                        .where(eq(schema.artifacts.id, r.id));
                    await syncArtifactAssets(r.id, assetIds, tx);
                });
            else
                await db
                    .update(schema.evalRuns)
                    .set({ content: next })
                    .where(eq(schema.evalRuns.id, r.id));
        }
    }

    out(
        `\n${changed} row(s) ${write ? "migrated" : "would change"} · ${groups} group + ${cards} card nodes`,
    );
    if (!write && changed) out("re-run with --write to apply, then --verify");
}

main()
    .then(() => process.exit(0))
    .catch((e: unknown) => {
        process.stderr.write(`${String(e)}\n`);
        process.exit(1);
    });
