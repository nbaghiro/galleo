import { and, desc, eq, ilike, isNull } from "drizzle-orm";
import type { ArtifactContent } from "@model/artifact";
import type { ArtifactRef } from "@model/ai";
import type { WorkspaceReader } from "../ai/tools/registry";
import { db, schema } from "../schema";

// The DB-backed WorkspaceReader — read access to one workspace's library, scoped by id. Built on the route
// side (where the DB + authed workspace live) and injected into the turn, so the chat agent's find/read
// tools reach the user's real work without the data layer leaking into services/ai. Live artifacts only
// (Trash is excluded); content is the stored draft.

// Guard a caller-supplied id before it reaches a `uuid` column — a model can pass a title or a truncated
// id, and Postgres would throw "invalid input syntax for type uuid" rather than simply not matching.
const isUuid = (s: string): boolean =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

const toRef = (r: {
    id: string;
    title: string;
    formatId: string;
    updatedAt: Date;
}): ArtifactRef => ({
    id: r.id,
    title: r.title,
    format: r.formatId,
    updatedAt: r.updatedAt.toISOString(),
});

export function makeWorkspaceReader(workspaceId: string): WorkspaceReader {
    return {
        async find(query?: string): Promise<ArtifactRef[]> {
            const rows = await db
                .select({
                    id: schema.artifacts.id,
                    title: schema.artifacts.title,
                    formatId: schema.artifacts.formatId,
                    updatedAt: schema.artifacts.updatedAt,
                })
                .from(schema.artifacts)
                .where(
                    and(
                        eq(schema.artifacts.workspaceId, workspaceId),
                        isNull(schema.artifacts.trashedAt),
                        query ? ilike(schema.artifacts.title, `%${query}%`) : undefined,
                    ),
                )
                .orderBy(desc(schema.artifacts.updatedAt))
                .limit(query ? 12 : 8);
            return rows.map(toRef);
        },
        async read(id: string): Promise<{ ref: ArtifactRef; content: ArtifactContent } | null> {
            if (!isUuid(id)) return null;
            const [a] = await db
                .select()
                .from(schema.artifacts)
                .where(
                    and(eq(schema.artifacts.id, id), eq(schema.artifacts.workspaceId, workspaceId)),
                );
            if (!a || a.trashedAt) return null;
            return { ref: toRef(a), content: a.draftContent as ArtifactContent };
        },
    };
}
