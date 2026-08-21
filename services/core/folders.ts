import { and, eq, isNull, sql } from "drizzle-orm";
import type { Folder, FolderInput } from "@model/workspace";
import { db } from "@services/db/client";
import { schema } from "@services/db/schema";

const folderCols = {
    id: schema.folders.id,
    name: schema.folders.name,
    parentId: schema.folders.parentId,
    createdAt: schema.folders.createdAt,
};

type FolderRow = { [K in keyof typeof folderCols]: (typeof schema.folders.$inferSelect)[K] };

// Counted here rather than from the client's artifact list, which is now one page deep.
export async function listFolders(workspaceId: string): Promise<(FolderRow & { count: number })[]> {
    const rows = await db
        .select(folderCols)
        .from(schema.folders)
        .where(eq(schema.folders.workspaceId, workspaceId))
        .orderBy(schema.folders.createdAt);
    const counts = await db
        .select({ folderId: schema.artifacts.folderId, count: sql<number>`count(*)::int` })
        .from(schema.artifacts)
        .where(
            and(eq(schema.artifacts.workspaceId, workspaceId), isNull(schema.artifacts.trashedAt)),
        )
        .groupBy(schema.artifacts.folderId);
    const byFolder = new Map(counts.map((r) => [r.folderId, r.count]));
    return rows.map((f) => ({ ...f, count: byFolder.get(f.id) ?? 0 }));
}

export async function createFolder(
    workspaceId: string,
    input: Partial<FolderInput>,
): Promise<FolderRow | undefined> {
    const [f] = await db
        .insert(schema.folders)
        .values({
            workspaceId,
            name: (input.name ?? "New folder").trim() || "New folder",
            parentId: input.parentId ?? null,
        })
        .returning(folderCols);
    return f;
}

export async function renameFolder(
    id: string,
    name: string,
): Promise<Pick<Folder, "id" | "name"> | null> {
    const [f] = await db
        .update(schema.folders)
        .set({ name: name.trim() })
        .where(eq(schema.folders.id, id))
        .returning({ id: schema.folders.id, name: schema.folders.name });
    return f ?? null;
}

// Deletes the folder and every subfolder beneath it; the artifacts inside fall back to the root
// rather than being trashed with it.
/** How many artifacts the folder held, which is what makes the deletion readable. */
export async function deleteFolderTree(workspaceId: string, id: string): Promise<number> {
    const all = await db
        .select({ id: schema.folders.id, parentId: schema.folders.parentId })
        .from(schema.folders)
        .where(eq(schema.folders.workspaceId, workspaceId));
    const doomed = new Set([id]);
    for (let changed = true; changed; ) {
        changed = false;
        for (const f of all) {
            if (f.parentId && doomed.has(f.parentId) && !doomed.has(f.id)) {
                doomed.add(f.id);
                changed = true;
            }
        }
    }
    let orphaned = 0;
    for (const fid of doomed) {
        const moved = await db
            .update(schema.artifacts)
            .set({ folderId: null })
            .where(eq(schema.artifacts.folderId, fid))
            .returning({ id: schema.artifacts.id });
        orphaned += moved.length;
        await db.delete(schema.folders).where(eq(schema.folders.id, fid));
    }
    return orphaned;
}
