import { and, desc, eq, ilike, isNull } from "drizzle-orm";
import type { ArtifactContent } from "@model/artifact";
import { asContent } from "@model/artifact";
import type { ArtifactRef } from "@model/ai";
import type { Viewer } from "@services/core/artifacts";
import { searchArtifacts } from "@services/core/search";
import type { WorkspaceReader } from "./tools";
import { db } from "@services/db/client";
import { schema } from "@services/db/schema";

// Postgres throws on a malformed uuid rather than just not matching, and a model may pass a title.
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

/**
 * `viewer` opts the search into the same index the library and ⌘K query, which needs a viewer to
 * scope what this person may see at all. Without one the title match still answers, so a caller that
 * has no viewer to hand (the eval harness) keeps working rather than seeing nothing.
 */
export function makeWorkspaceReader(workspaceId: string, viewer?: Viewer): WorkspaceReader {
    return {
        async find(query?: string): Promise<ArtifactRef[]> {
            if (query && viewer) {
                const hits = await searchArtifacts({
                    workspaceId,
                    userId: viewer.userId,
                    query,
                    limit: 12,
                    viewer,
                });
                return hits.map((h) => ({
                    id: h.id,
                    title: h.title,
                    format: h.formatId,
                    updatedAt: h.updatedAt,
                }));
            }
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
            return { ref: toRef(a), content: asContent(a.draftContent) };
        },
    };
}
