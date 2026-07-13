import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { authed, jsonInit, request, seedUser } from "../../__tests__/harness";
import { db, schema } from "../../schema";

// A minimal-but-valid content tree the cover/filmstrip derivation can read.
const draftWithCover = {
    format: "deck",
    theme: "studio",
    sections: [
        {
            id: "s1",
            root: {
                type: "group",
                data: {
                    children: [
                        { type: "text", data: { style: "label", text: "EYEBROW" } },
                        { type: "text", data: { style: "h1", text: "Hello Title" } },
                        { type: "text", data: { style: "body", text: "Sub copy" } },
                    ],
                },
            },
        },
        { id: "s2", root: { type: "chart", data: { type: "bar", values: "1,2,3" } } },
    ],
};

// bypasses the create route (fixture setup)
async function insertArtifact(
    workspaceId: string,
    over: Partial<typeof schema.artifacts.$inferInsert> = {},
): Promise<string> {
    const [a] = await db
        .insert(schema.artifacts)
        .values({ workspaceId, formatId: "deck", themeId: "studio", ...over })
        .returning({ id: schema.artifacts.id });
    return a!.id;
}

describe("artifact routes", () => {
    it("POST /artifacts creates a row and returns its id", async () => {
        const { userId, workspaceId } = await seedUser();
        const res = await authed(
            userId,
            "/artifacts",
            jsonInit("POST", { title: "My deck", formatId: "deck", themeId: "studio" }),
        );
        expect(res.status).toBe(200);
        const { id } = (await res.json()) as { id: string };
        expect(id).toBeTruthy();

        const [row] = await db.select().from(schema.artifacts).where(eq(schema.artifacts.id, id));
        expect(row).toBeTruthy();
        expect(row!.workspaceId).toBe(workspaceId);
        expect(row!.title).toBe("My deck");
    });

    it("POST /artifacts 401s without a session", async () => {
        const res = await request(
            "/artifacts",
            jsonInit("POST", { title: "x", formatId: "deck", themeId: "studio" }),
        );
        expect(res.status).toBe(401);
    });

    it("enforces the free plan artifact cap: the 11th live artifact is a 402 with upgrade:true", async () => {
        const { userId, workspaceId } = await seedUser({ plan: "free" }); // maxArtifacts = 10
        await db.insert(schema.artifacts).values(
            Array.from({ length: 10 }, () => ({
                workspaceId,
                formatId: "deck",
                themeId: "studio",
            })),
        );
        const res = await authed(userId, "/artifacts", jsonInit("POST", { title: "one too many" }));
        expect(res.status).toBe(402);
        const body = (await res.json()) as { upgrade?: boolean };
        expect(body.upgrade).toBe(true);
    });

    it("the cap counts only LIVE artifacts — a trashed one leaves a slot free", async () => {
        const { userId, workspaceId } = await seedUser({ plan: "free" });
        // 9 live + 1 trashed = 10 rows, but only 9 count against the cap.
        await db.insert(schema.artifacts).values(
            Array.from({ length: 9 }, () => ({
                workspaceId,
                formatId: "deck",
                themeId: "studio",
            })),
        );
        await insertArtifact(workspaceId, { trashedAt: new Date() });
        const res = await authed(userId, "/artifacts", jsonInit("POST", { title: "fits" }));
        expect(res.status).toBe(200);
    });

    it("PATCH bumps updatedAt on a real content edit but NOT on a folder-only move", async () => {
        const { userId, workspaceId } = await seedUser();
        const id = await insertArtifact(workspaceId);
        const [folder] = await db
            .insert(schema.folders)
            .values({ workspaceId, name: "Folder" })
            .returning({ id: schema.folders.id });

        // pin updatedAt in the past so any bump is unambiguous
        const past = new Date("2020-06-01T00:00:00.000Z");
        await db
            .update(schema.artifacts)
            .set({ updatedAt: past })
            .where(eq(schema.artifacts.id, id));

        const move = await authed(
            userId,
            `/artifacts/${id}`,
            jsonInit("PATCH", { folderId: folder!.id }),
        );
        expect(move.status).toBe(200);
        const afterMove = (await move.json()) as { updatedAt: string };
        expect(new Date(afterMove.updatedAt).getTime()).toBe(past.getTime());

        const edit = await authed(
            userId,
            `/artifacts/${id}`,
            jsonInit("PATCH", { draftContent: draftWithCover }),
        );
        expect(edit.status).toBe(200);
        const afterEdit = (await edit.json()) as { updatedAt: string };
        expect(new Date(afterEdit.updatedAt).getTime()).toBeGreaterThan(past.getTime());
    });

    it("GET /artifacts lists with the cover + section filmstrip DTO", async () => {
        const { userId, workspaceId } = await seedUser();
        await insertArtifact(workspaceId, { title: "Preview me", draftContent: draftWithCover });

        const res = await authed(userId, "/artifacts");
        expect(res.status).toBe(200);
        const { artifacts } = (await res.json()) as {
            artifacts: {
                id: string;
                title: string;
                cover: { eyebrow?: string; title?: string; sub?: string };
                sections: { title?: string; kind: string }[];
            }[];
        };
        expect(artifacts).toHaveLength(1);
        const a = artifacts[0]!;
        expect(a.title).toBe("Preview me");
        expect(a.cover.eyebrow).toBe("EYEBROW");
        expect(a.cover.title).toBe("Hello Title");
        expect(a.cover.sub).toBe("Sub copy");
        expect(a.sections).toHaveLength(2);
        expect(a.sections[0]!.kind).toBe("cover");
        expect(a.sections[1]!.kind).toBe("chart");
    });

    it("GET /artifacts?trashed=1 splits the live list from the Trash list", async () => {
        const { userId, workspaceId } = await seedUser();
        const liveId = await insertArtifact(workspaceId, { title: "live" });
        const trashedId = await insertArtifact(workspaceId, {
            title: "trashed",
            trashedAt: new Date(),
        });

        const live = (await (await authed(userId, "/artifacts")).json()) as {
            artifacts: { id: string }[];
        };
        expect(live.artifacts.map((a) => a.id)).toEqual([liveId]);

        const trashed = (await (await authed(userId, "/artifacts?trashed=1")).json()) as {
            artifacts: { id: string }[];
        };
        expect(trashed.artifacts.map((a) => a.id)).toEqual([trashedId]);
    });

    it("trash soft-deletes (sets trashedAt) and restore clears it", async () => {
        const { userId, workspaceId } = await seedUser();
        const id = await insertArtifact(workspaceId);

        const t = await authed(userId, `/artifacts/${id}/trash`, jsonInit("POST", {}));
        expect(t.status).toBe(200);
        const [afterTrash] = await db
            .select()
            .from(schema.artifacts)
            .where(eq(schema.artifacts.id, id));
        expect(afterTrash!.trashedAt).not.toBeNull();

        const r = await authed(userId, `/artifacts/${id}/restore`, jsonInit("POST", {}));
        expect(r.status).toBe(200);
        const [afterRestore] = await db
            .select()
            .from(schema.artifacts)
            .where(eq(schema.artifacts.id, id));
        expect(afterRestore!.trashedAt).toBeNull();
    });

    it("DELETE /trash permanently empties the workspace Trash but keeps live artifacts", async () => {
        const { userId, workspaceId } = await seedUser();
        const liveId = await insertArtifact(workspaceId, { title: "keep" });
        await insertArtifact(workspaceId, { title: "gone", trashedAt: new Date() });

        const res = await authed(userId, "/trash", { method: "DELETE" });
        expect(res.status).toBe(200);
        const rows = await db
            .select({ id: schema.artifacts.id })
            .from(schema.artifacts)
            .where(eq(schema.artifacts.workspaceId, workspaceId));
        expect(rows.map((r) => r.id)).toEqual([liveId]);
    });

    it("enforces tenant isolation — a foreign workspace can't GET or PATCH the artifact (404)", async () => {
        const owner = await seedUser();
        const stranger = await seedUser();
        const id = await insertArtifact(owner.workspaceId, { title: "secret" });

        const get = await authed(stranger.userId, `/artifacts/${id}`);
        expect(get.status).toBe(404);

        const patch = await authed(
            stranger.userId,
            `/artifacts/${id}`,
            jsonInit("PATCH", { title: "hijacked" }),
        );
        expect(patch.status).toBe(404);

        const [row] = await db
            .select()
            .from(schema.artifacts)
            .where(and(eq(schema.artifacts.id, id), eq(schema.artifacts.title, "secret")));
        expect(row).toBeTruthy();
    });
});
