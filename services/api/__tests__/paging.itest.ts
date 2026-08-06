import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { ArtifactPage, ArtifactWindow, Section, SectionOp } from "@model/artifact";
import { artifactDigest, artifactSearchText } from "@model/artifact";
import { authed, jsonInit, seedUser } from "../../__tests__/harness";
import { db } from "../../db/client";
import { schema } from "../../db/schema";

const section = (id: string, text: string): Section => ({
    id,
    root: { type: "text", data: { style: "body", text } },
});

const content = (ids: string[]): Record<string, unknown> => ({
    format: "deck",
    theme: "studio",
    sections: ids.map((id) => section(id, `body of ${id}`)),
});

async function seedArtifact(
    workspaceId: string,
    title: string,
    over: Partial<typeof schema.artifacts.$inferInsert> = {},
): Promise<string> {
    const draft = over.draftContent ?? content(["s1", "s2"]);
    const [a] = await db
        .insert(schema.artifacts)
        .values({
            workspaceId,
            title,
            formatId: "deck",
            themeId: "studio",
            draftContent: draft,
            digest: artifactDigest(draft),
            searchText: artifactSearchText(draft),
            ...over,
        })
        .returning({ id: schema.artifacts.id });
    return a!.id;
}

// distinct updatedAt per row so the keyset order is deterministic
async function seedMany(workspaceId: string, titles: string[]): Promise<void> {
    for (const [i, title] of titles.entries())
        await seedArtifact(workspaceId, title, {
            updatedAt: new Date(Date.UTC(2026, 0, 1 + i)),
        });
}

const page = async (userId: string, qs = ""): Promise<ArtifactPage> => {
    const res = await authed(userId, `/artifacts${qs ? `?${qs}` : ""}`);
    expect(res.status).toBe(200);
    return (await res.json()) as ArtifactPage;
};

describe("GET /artifacts — keyset pagination", () => {
    it("walks the whole list in pages without repeating or skipping a row", async () => {
        const { userId, workspaceId } = await seedUser();
        await seedMany(
            workspaceId,
            Array.from({ length: 7 }, (_, i) => `A${i}`),
        );

        const seen: string[] = [];
        let cursor: string | null = null;
        for (let guard = 0; guard < 10; guard++) {
            const p: ArtifactPage = await page(
                userId,
                `limit=3${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
            );
            seen.push(...p.artifacts.map((a) => a.title));
            cursor = p.nextCursor;
            if (!cursor) break;
        }
        expect(cursor).toBeNull();
        expect(seen).toEqual(["A6", "A5", "A4", "A3", "A2", "A1", "A0"]); // newest first
        expect(new Set(seen).size).toBe(7);
    });

    it("reports no next cursor when the page exactly empties the list", async () => {
        const { userId, workspaceId } = await seedUser();
        await seedMany(workspaceId, ["one", "two", "three"]);
        const p = await page(userId, "limit=3");
        expect(p.artifacts).toHaveLength(3);
        expect(p.nextCursor).toBeNull();
    });

    it("ignores a malformed cursor instead of failing the page", async () => {
        const { userId, workspaceId } = await seedUser();
        await seedMany(workspaceId, ["only"]);
        expect((await page(userId, "cursor=not-a-cursor")).artifacts).toHaveLength(1);
    });

    it("paginates A–Z ascending on its own key", async () => {
        const { userId, workspaceId } = await seedUser();
        await seedMany(workspaceId, ["Charlie", "alpha", "Bravo"]);
        const first = await page(userId, "sort=az&limit=2");
        expect(first.artifacts.map((a) => a.title)).toEqual(["alpha", "Bravo"]);
        const second = await page(
            userId,
            `sort=az&limit=2&cursor=${encodeURIComponent(first.nextCursor!)}`,
        );
        expect(second.artifacts.map((a) => a.title)).toEqual(["Charlie"]);
        expect(second.nextCursor).toBeNull();
    });

    it("scopes to a folder and a format server-side", async () => {
        const { userId, workspaceId } = await seedUser();
        const [folder] = await db
            .insert(schema.folders)
            .values({ workspaceId, name: "Pitches" })
            .returning({ id: schema.folders.id });
        await seedArtifact(workspaceId, "in folder", { folderId: folder!.id });
        await seedArtifact(workspaceId, "loose deck");
        await seedArtifact(workspaceId, "a site", { formatId: "web" });

        expect((await page(userId, `folder=${folder!.id}`)).artifacts.map((a) => a.title)).toEqual([
            "in folder",
        ]);
        expect((await page(userId, "format=web")).artifacts.map((a) => a.title)).toEqual([
            "a site",
        ]);
    });

    it("keeps trash on its own keyset", async () => {
        const { userId, workspaceId } = await seedUser();
        await seedArtifact(workspaceId, "live one");
        await seedArtifact(workspaceId, "binned", { trashedAt: new Date() });
        expect((await page(userId, "")).artifacts.map((a) => a.title)).toEqual(["live one"]);
        expect((await page(userId, "trashed=1")).artifacts.map((a) => a.title)).toEqual(["binned"]);
    });

    it("caps an oversized limit", async () => {
        const { userId, workspaceId } = await seedUser();
        await seedMany(
            workspaceId,
            Array.from({ length: 5 }, (_, i) => `x${i}`),
        );
        expect((await page(userId, "limit=9999")).artifacts).toHaveLength(5);
    });
});

describe("GET /artifacts/:id — windowed read", () => {
    it("returns the shell, the whole section index, and only the requested slice", async () => {
        const { userId, workspaceId } = await seedUser();
        const id = await seedArtifact(workspaceId, "Long", {
            draftContent: content(["a", "b", "c", "d", "e"]),
        });
        const res = await authed(userId, `/artifacts/${id}?window=1:2`);
        const { artifact } = (await res.json()) as { artifact: ArtifactWindow };
        expect(artifact.total).toBe(5);
        expect(artifact.from).toBe(1);
        expect(artifact.sections.map((s) => s.id)).toEqual(["b", "c"]);
        expect(artifact.index.map((s) => s.id)).toEqual(["a", "b", "c", "d", "e"]);
        expect(artifact.index[0]!.size).toBeGreaterThan(0);
        expect(artifact.shell).toEqual({ format: "deck", theme: "studio" });
    });

    it("still returns the whole document without a window", async () => {
        const { userId, workspaceId } = await seedUser();
        const id = await seedArtifact(workspaceId, "Whole", { draftContent: content(["a", "b"]) });
        const res = await authed(userId, `/artifacts/${id}`);
        const { artifact } = (await res.json()) as { artifact: { draftContent: { sections: [] } } };
        expect(artifact.draftContent.sections).toHaveLength(2);
    });

    it("ignores a malformed window rather than erroring", async () => {
        const { userId, workspaceId } = await seedUser();
        const id = await seedArtifact(workspaceId, "Whole", { draftContent: content(["a", "b"]) });
        const res = await authed(userId, `/artifacts/${id}?window=abc`);
        const { artifact } = (await res.json()) as { artifact: { draftContent?: unknown } };
        expect(artifact.draftContent).toBeTruthy();
    });

    it("serves later sections by id and by range", async () => {
        const { userId, workspaceId } = await seedUser();
        const id = await seedArtifact(workspaceId, "Long", {
            draftContent: content(["a", "b", "c", "d"]),
        });
        const byId = await authed(userId, `/artifacts/${id}/sections?ids=c,a`);
        expect(((await byId.json()) as { sections: Section[] }).sections.map((s) => s.id)).toEqual([
            "a",
            "c", // document order, not request order
        ]);
        const byRange = await authed(userId, `/artifacts/${id}/sections?window=2:5`);
        expect(
            ((await byRange.json()) as { sections: Section[] }).sections.map((s) => s.id),
        ).toEqual(["c", "d"]);
    });

    it("recomputes the index when the stored digest predates section ids", async () => {
        const { userId, workspaceId } = await seedUser();
        const draft = content(["a", "b"]);
        const [row] = await db
            .insert(schema.artifacts)
            .values({
                workspaceId,
                title: "Legacy",
                formatId: "deck",
                themeId: "studio",
                draftContent: draft,
                // an old digest: summaries without ids or sizes
                digest: { cover: {}, sections: [{ kind: "cover" }, { kind: "content" }] },
            })
            .returning({ id: schema.artifacts.id });
        const res = await authed(userId, `/artifacts/${row!.id}?window=0:1`);
        const { artifact } = (await res.json()) as { artifact: ArtifactWindow };
        expect(artifact.index.map((s) => s.id)).toEqual(["a", "b"]);
    });

    it("won't serve another workspace's sections", async () => {
        const mine = await seedUser();
        const theirs = await seedUser();
        const id = await seedArtifact(theirs.workspaceId, "Theirs");
        expect((await authed(mine.userId, `/artifacts/${id}/sections`)).status).toBe(404);
        expect((await authed(mine.userId, `/artifacts/${id}?window=0:2`)).status).toBe(404);
    });
});

describe("PATCH /artifacts/:id/content — section ops", () => {
    const apply = async (
        userId: string,
        id: string,
        ops: SectionOp[],
    ): Promise<{ status: number; body: Record<string, unknown> }> => {
        const res = await authed(userId, `/artifacts/${id}/content`, jsonInit("PATCH", { ops }));
        return { status: res.status, body: (await res.json()) as Record<string, unknown> };
    };
    const sectionsOf = async (id: string): Promise<string[]> => {
        const [row] = await db
            .select({ draftContent: schema.artifacts.draftContent })
            .from(schema.artifacts)
            .where(eq(schema.artifacts.id, id));
        return (row!.draftContent as { sections: Section[] }).sections.map((s) => s.id);
    };

    it("applies set, insert, remove, and order in one request", async () => {
        const { userId, workspaceId } = await seedUser();
        const id = await seedArtifact(workspaceId, "Doc", {
            draftContent: content(["a", "b", "c"]),
        });
        const { status } = await apply(userId, id, [
            { kind: "set", section: section("b", "rewritten") },
            { kind: "insert", section: section("d", "new one"), index: 1 },
            { kind: "remove", id: "c" },
            { kind: "order", ids: ["d", "a", "b"] },
        ]);
        expect(status).toBe(200);
        expect(await sectionsOf(id)).toEqual(["d", "a", "b"]);

        const [row] = await db.select().from(schema.artifacts).where(eq(schema.artifacts.id, id));
        expect(row!.searchText).toContain("rewritten");
        expect(row!.searchText).not.toContain("body of c");
        expect(row!.digest?.sections.map((s) => s.id)).toEqual(["d", "a", "b"]);
    });

    it("rejects the whole batch when an op names a section the server doesn't have", async () => {
        const { userId, workspaceId } = await seedUser();
        const id = await seedArtifact(workspaceId, "Doc", { draftContent: content(["a", "b"]) });
        const { status } = await apply(userId, id, [
            { kind: "set", section: section("a", "fine") },
            { kind: "remove", id: "ghost" },
        ]);
        expect(status).toBe(409);
        expect(await sectionsOf(id)).toEqual(["a", "b"]); // the valid op didn't land either
    });

    it("rejects an order that isn't a permutation", async () => {
        const { userId, workspaceId } = await seedUser();
        const id = await seedArtifact(workspaceId, "Doc", { draftContent: content(["a", "b"]) });
        expect((await apply(userId, id, [{ kind: "order", ids: ["a"] }])).status).toBe(409);
    });

    it("400s on an empty or unrecognizable op list", async () => {
        const { userId, workspaceId } = await seedUser();
        const id = await seedArtifact(workspaceId, "Doc");
        expect((await apply(userId, id, [])).status).toBe(400);
        const res = await authed(
            userId,
            `/artifacts/${id}/content`,
            jsonInit("PATCH", { ops: [{ kind: "nonsense" }] }),
        );
        expect(res.status).toBe(400);
    });

    it("carries a shell change and bumps updatedAt", async () => {
        const { userId, workspaceId } = await seedUser();
        const id = await seedArtifact(workspaceId, "Doc", { draftContent: content(["a"]) });
        await db
            .update(schema.artifacts)
            .set({ updatedAt: new Date("2020-01-01T00:00:00.000Z") })
            .where(eq(schema.artifacts.id, id));
        const { status } = await apply(userId, id, [
            { kind: "shell", shell: { format: "doc", theme: "aurora" } },
        ]);
        expect(status).toBe(200);
        const [row] = await db.select().from(schema.artifacts).where(eq(schema.artifacts.id, id));
        const draft = row!.draftContent as { format: string; theme: string };
        expect(draft.format).toBe("doc");
        expect(draft.theme).toBe("aurora");
        expect(row!.updatedAt.getTime()).toBeGreaterThan(new Date("2020-01-01").getTime());
    });

    it("won't touch another workspace's artifact", async () => {
        const mine = await seedUser();
        const theirs = await seedUser();
        const id = await seedArtifact(theirs.workspaceId, "Theirs");
        const { status } = await apply(mine.userId, id, [
            { kind: "set", section: section("s1", "hijacked") },
        ]);
        expect(status).toBe(404);
    });

    // this route rewrites the whole content through asContent()
    it("preserves the artifact's page size across a section op", async () => {
        const { userId, workspaceId } = await seedUser();
        const id = await seedArtifact(workspaceId, "Sized", {
            draftContent: { ...content(["a", "b"]), page: { width: 1080, height: 1350 } },
        });
        const { status } = await apply(userId, id, [{ kind: "remove", id: "b" }]);
        expect(status).toBe(200);

        const [row] = await db.select().from(schema.artifacts).where(eq(schema.artifacts.id, id));
        const draft = row!.draftContent as { page?: { width: number; height: number } };
        expect(draft.page).toEqual({ width: 1080, height: 1350 });
        expect(row!.digest?.page).toEqual({ width: 1080, height: 1350 });
    });
});

describe("GET /folders — counts", () => {
    it("counts live artifacts per folder server-side", async () => {
        const { userId, workspaceId } = await seedUser();
        const [folder] = await db
            .insert(schema.folders)
            .values({ workspaceId, name: "Pitches" })
            .returning({ id: schema.folders.id });
        await seedArtifact(workspaceId, "one", { folderId: folder!.id });
        await seedArtifact(workspaceId, "two", { folderId: folder!.id });
        await seedArtifact(workspaceId, "binned", {
            folderId: folder!.id,
            trashedAt: new Date(),
        });
        const res = await authed(userId, "/folders");
        const { folders } = (await res.json()) as { folders: { id: string; count: number }[] };
        expect(folders[0]!.count).toBe(2);
    });
});
