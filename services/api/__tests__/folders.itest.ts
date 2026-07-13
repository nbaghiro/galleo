import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { authed, jsonInit, request, seedUser } from "../../test/harness";
import { db, schema } from "../../schema";

// Integration: the folder routes — create, rename, and the delete-cascade that removes descendant
// subfolders and un-files (rather than deletes) their artifacts.

describe("folder routes", () => {
    it("POST /folders creates a folder row", async () => {
        const { userId, workspaceId } = await seedUser();
        const res = await authed(userId, "/folders", jsonInit("POST", { name: "Decks" }));
        expect(res.status).toBe(200);
        const { folder } = (await res.json()) as {
            folder: { id: string; name: string; parentId: string | null };
        };
        expect(folder.name).toBe("Decks");
        expect(folder.parentId).toBeNull();

        const [row] = await db
            .select()
            .from(schema.folders)
            .where(eq(schema.folders.id, folder.id));
        expect(row!.workspaceId).toBe(workspaceId);
    });

    it("POST /folders 401s without a session", async () => {
        const res = await request("/folders", jsonInit("POST", { name: "x" }));
        expect(res.status).toBe(401);
    });

    it("PATCH /folders/:id renames the folder", async () => {
        const { userId, workspaceId } = await seedUser();
        const [f] = await db
            .insert(schema.folders)
            .values({ workspaceId, name: "Old name" })
            .returning({ id: schema.folders.id });

        const res = await authed(
            userId,
            `/folders/${f!.id}`,
            jsonInit("PATCH", { name: "New name" }),
        );
        expect(res.status).toBe(200);
        expect(((await res.json()) as { folder: { name: string } }).folder.name).toBe("New name");

        const [row] = await db
            .select({ name: schema.folders.name })
            .from(schema.folders)
            .where(eq(schema.folders.id, f!.id));
        expect(row!.name).toBe("New name");
    });

    it("PATCH /folders/:id 400s on an empty name and 404s on an unknown id", async () => {
        const { userId, workspaceId } = await seedUser();
        const [f] = await db
            .insert(schema.folders)
            .values({ workspaceId, name: "Keep" })
            .returning({ id: schema.folders.id });

        const empty = await authed(userId, `/folders/${f!.id}`, jsonInit("PATCH", { name: "  " }));
        expect(empty.status).toBe(400);

        const missing = await authed(
            userId,
            "/folders/00000000-0000-0000-0000-000000000000",
            jsonInit("PATCH", { name: "Whatever" }),
        );
        expect(missing.status).toBe(404);
    });

    it("DELETE /folders/:id cascades to subfolders and un-files (keeps) their artifacts", async () => {
        const { userId, workspaceId } = await seedUser();
        // parent → child → grandchild
        const [parent] = await db
            .insert(schema.folders)
            .values({ workspaceId, name: "Parent" })
            .returning({ id: schema.folders.id });
        const [child] = await db
            .insert(schema.folders)
            .values({ workspaceId, name: "Child", parentId: parent!.id })
            .returning({ id: schema.folders.id });
        const [grandchild] = await db
            .insert(schema.folders)
            .values({ workspaceId, name: "Grandchild", parentId: child!.id })
            .returning({ id: schema.folders.id });

        // An artifact filed in the parent and one in the child.
        const [inParent] = await db
            .insert(schema.artifacts)
            .values({ workspaceId, formatId: "deck", themeId: "studio", folderId: parent!.id })
            .returning({ id: schema.artifacts.id });
        const [inChild] = await db
            .insert(schema.artifacts)
            .values({ workspaceId, formatId: "deck", themeId: "studio", folderId: child!.id })
            .returning({ id: schema.artifacts.id });

        const res = await authed(userId, `/folders/${parent!.id}`, { method: "DELETE" });
        expect(res.status).toBe(200);

        // All three folders are gone.
        const folders = await db
            .select({ id: schema.folders.id })
            .from(schema.folders)
            .where(eq(schema.folders.workspaceId, workspaceId));
        expect(folders).toHaveLength(0);
        void grandchild;

        // Both artifacts survive, un-filed back to the library root.
        const arts = await db
            .select({ id: schema.artifacts.id, folderId: schema.artifacts.folderId })
            .from(schema.artifacts)
            .where(eq(schema.artifacts.workspaceId, workspaceId));
        expect(arts).toHaveLength(2);
        expect(arts.every((a) => a.folderId === null)).toBe(true);
        expect(arts.map((a) => a.id).sort()).toEqual([inParent!.id, inChild!.id].sort());
    });
});
