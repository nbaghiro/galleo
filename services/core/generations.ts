import { and, eq, isNull, lt, or, sql } from "drizzle-orm";
import type { Brief, Generation, GenerationOp } from "@model/ai";
import { applyContentOps, applyGenerationOps } from "@model/ai";
import type { ArtifactContent, GenMeta } from "@model/artifact";
import { asContent } from "@model/artifact";
import { db } from "@services/db/client";
import { schema } from "@services/db/schema";
import type { GenerationRead, GenerationStore } from "@services/core/ai/tools";
import { commitPatch } from "@services/core/ai/effects";
import { createArtifact, readArtifact, updateArtifact } from "@services/core/artifacts";

// The database-backed GenerationStore: rows in `generations`, the section of record in the draft
// artifact. Tool bodies never touch either; the executor applies their patches through here, so
// the same body runs against the in-memory store below in a test or an eval.

type Row = typeof schema.generations.$inferSelect;

const fromRow = (r: Row): Generation => ({
    id: r.id,
    workspaceId: r.workspaceId,
    artifactId: r.artifactId,
    stage: r.stage,
    brief: r.brief,
    briefVersion: r.briefVersion,
    outline: r.outline ?? null,
    plannedAgainst: r.plannedAgainst,
    steer: r.steer,
    clarify: r.clarify,
    beats: r.beats,
    seq: r.seq,
    createdAt: r.createdAt.toISOString(),
});

const emptyContent = (brief: Brief): ArtifactContent => ({
    format: brief.surface,
    theme: brief.theme,
    sections: [],
});

// what a finished generation records on its artifact, the shape the studio used to write
function runMeta(gen: Generation, models: Record<string, string> = {}): GenMeta {
    const b = gen.brief;
    return {
        at: new Date().toISOString(),
        models,
        prompt: b.prompt,
        surface: b.surface,
        theme: b.theme,
        ...(b.length ? { length: b.length } : {}),
        ...(b.imageSource ? { imageSource: b.imageSource } : {}),
        ...(b.goal ? { goal: b.goal } : {}),
        ...(b.audience ? { audience: b.audience } : {}),
        ...(b.tone ? { tone: b.tone } : {}),
        ...(b.mustInclude?.length ? { mustInclude: [...b.mustInclude] } : {}),
        ...(gen.steer.trim() ? { steer: gen.steer.trim() } : {}),
        ...(b.source ? { source: b.source } : {}),
        beats: (gen.outline?.beats ?? []).map((x) => ({ id: x.id, label: x.label, role: x.role })),
    };
}

// The lease is a timestamp on the row rather than an in-process set, so a second instance refuses
// the same write. It lapses on its own, which is what keeps a dead writer from leaving a run stuck,
// and every patch the holder lands pushes it out again, so a long write is never cut off mid-beat.
const LEASE_MS = 10 * 60_000;
const leaseUntil = (): Date => new Date(Date.now() + LEASE_MS);

export function makeGenerationStore(workspaceId: string, userId: string): GenerationStore {
    const content = async (artifactId: string): Promise<ArtifactContent> => {
        const row = await readArtifact(workspaceId, artifactId);
        if (!row) throw new Error("the generation's draft artifact is gone");
        return asContent(row.draftContent);
    };
    const read = async (id: string): Promise<GenerationRead | null> => {
        const [row] = await db
            .select()
            .from(schema.generations)
            .where(eq(schema.generations.id, id));
        if (!row || row.workspaceId !== workspaceId) return null;
        return { generation: fromRow(row), content: await content(row.artifactId) };
    };
    return {
        async create({ brief, artifactId }) {
            const target =
                artifactId ??
                (await createArtifact(workspaceId, userId, {
                    title: "Untitled",
                    draftContent: emptyContent(brief),
                }));
            if (!target) throw new Error("the draft artifact could not be created");
            const [row] = await db
                .insert(schema.generations)
                .values({
                    workspaceId,
                    artifactId: target,
                    createdBy: userId,
                    stage: "briefed",
                    brief,
                    beats: {},
                })
                .returning();
            if (!row) throw new Error("the generation could not be created");
            return { generation: fromRow(row), content: await content(target) };
        },
        read,
        async apply(id, patch) {
            const ops: GenerationOp[] = patch.generation ?? [];
            const generation = await db.transaction(async (tx) => {
                const [row] = await tx
                    .select()
                    .from(schema.generations)
                    .where(eq(schema.generations.id, id))
                    .for("update");
                if (!row || row.workspaceId !== workspaceId)
                    throw new Error("that generation was not found");
                const next = applyGenerationOps(fromRow(row), ops);
                const [saved] = await tx
                    .update(schema.generations)
                    .set({
                        stage: next.stage,
                        brief: next.brief,
                        briefVersion: next.briefVersion,
                        outline: next.outline,
                        plannedAgainst: next.plannedAgainst,
                        steer: next.steer,
                        clarify: next.clarify,
                        beats: next.beats,
                        seq: sql`${schema.generations.seq} + 1`,
                        updatedAt: new Date(),
                        ...(row.writerUntil ? { writerUntil: leaseUntil() } : {}),
                    })
                    .where(eq(schema.generations.id, id))
                    .returning();
                return fromRow(saved!);
            });
            let next = await content(generation.artifactId);
            if (patch.artifact?.length) {
                const landed = await commitPatch(
                    { workspaceId, artifactId: generation.artifactId },
                    next,
                    patch.artifact,
                    generation.outline?.title,
                );
                // a section the patch names is gone: someone edited the draft under the write
                if (!landed) throw new Error("the draft changed while this was being written");
                next = landed.content;
            }
            return { generation, content: next };
        },
        // the ledger's view of a run is the sum of what its traces settled
        async spent(id) {
            const [row] = await db
                .select({ n: sql<number>`coalesce(sum(${schema.traces.credits}), 0)` })
                .from(schema.traces)
                .where(eq(schema.traces.generationId, id));
            return Number(row?.n ?? 0);
        },
        async finish(id, models = {}) {
            const got = await read(id);
            if (!got) return;
            await updateArtifact(workspaceId, got.generation.artifactId, {
                aiMeta: runMeta(got.generation, models),
            });
        },
        async claim(id) {
            const taken = await db
                .update(schema.generations)
                .set({ writerUntil: leaseUntil() })
                .where(
                    and(
                        eq(schema.generations.id, id),
                        eq(schema.generations.workspaceId, workspaceId),
                        or(
                            isNull(schema.generations.writerUntil),
                            lt(schema.generations.writerUntil, new Date()),
                        ),
                    ),
                )
                .returning({ id: schema.generations.id });
            return taken.length > 0;
        },
        async release(id) {
            await db
                .update(schema.generations)
                .set({ writerUntil: null })
                .where(eq(schema.generations.id, id));
        },
        async held(id) {
            const [row] = await db
                .select({ until: schema.generations.writerUntil })
                .from(schema.generations)
                .where(eq(schema.generations.id, id));
            return !!row?.until && row.until.getTime() > Date.now();
        },
    };
}

/** The same store with no database behind it, for the eval harness and the tests. */
export function memoryGenerationStore(workspaceId = "ws"): GenerationStore {
    const writers = new Set<string>();
    const rows = new Map<string, GenerationRead>();
    let n = 0;
    return {
        async create({ brief, artifactId }) {
            n += 1;
            const id = `gen-${n}`;
            const generation: Generation = {
                id,
                workspaceId,
                artifactId: artifactId ?? `art-${n}`,
                stage: "briefed",
                brief,
                briefVersion: 0,
                outline: null,
                plannedAgainst: null,
                steer: "",
                clarify: null,
                beats: {},
                seq: 0,
                createdAt: new Date().toISOString(),
            };
            const got = { generation, content: emptyContent(brief) };
            rows.set(id, got);
            return got;
        },
        async read(id) {
            return rows.get(id) ?? null;
        },
        async apply(id, patch) {
            const cur = rows.get(id);
            if (!cur) throw new Error("that generation was not found");
            const generation = {
                ...applyGenerationOps(cur.generation, patch.generation ?? []),
                seq: cur.generation.seq + 1,
            };
            const content = patch.artifact?.length
                ? applyContentOps(cur.content, patch.artifact)
                : cur.content;
            const next = { generation, content };
            rows.set(id, next);
            return next;
        },
        async spent() {
            return 0;
        },
        async finish() {},
        async claim(id) {
            if (writers.has(id)) return false;
            writers.add(id);
            return true;
        },
        async release(id) {
            writers.delete(id);
        },
        async held(id) {
            return writers.has(id);
        },
    };
}
