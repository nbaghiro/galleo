import { and, eq, sql } from "drizzle-orm";
import { db } from "../db/client";
import { schema } from "../db/schema";

// What a user reached for, one upsert counter per (user, kind, ref): artifact opens are the read
// clock behind "Recent" (updated_at is an edit clock), template uses rank the catalog by measured
// popularity across all users. Artifact deletion drops its rows in core/artifacts.ts (ref has no FK).

const bump = (userId: string, kind: "artifact" | "template", ref: string) =>
    db
        .insert(schema.visits)
        .values({ userId, kind, ref })
        .onConflictDoUpdate({
            target: [schema.visits.userId, schema.visits.kind, schema.visits.ref],
            set: { seenAt: new Date(), uses: sql`${schema.visits.uses} + 1` },
        });

export async function recordArtifactVisit(
    workspaceId: string,
    artifactId: string,
    userId: string,
): Promise<boolean> {
    const [a] = await db
        .select({ id: schema.artifacts.id })
        .from(schema.artifacts)
        .where(
            and(eq(schema.artifacts.id, artifactId), eq(schema.artifacts.workspaceId, workspaceId)),
        );
    if (!a) return false;
    await bump(userId, "artifact", a.id);
    return true;
}

export async function recordTemplateUse(userId: string, templateId: string): Promise<void> {
    await bump(userId, "template", templateId);
}

export async function templateUseCounts(): Promise<Record<string, number>> {
    const rows = await db
        .select({
            templateId: schema.visits.ref,
            uses: sql<number>`sum(${schema.visits.uses})::int`,
        })
        .from(schema.visits)
        .where(eq(schema.visits.kind, "template"))
        .groupBy(schema.visits.ref);
    return Object.fromEntries(rows.map((r) => [r.templateId, r.uses]));
}
