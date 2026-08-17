import { describe, expect, it } from "vitest";
import { makeWorkspaceReader } from "@services/core/ai/reader";
import { authed, jsonInit, seedUser } from "@services/__tests__/harness";

// The chat agent's window onto the library: rows are created through the real create/trash routes,
// then read back through the reader the tools use.

const create = async (userId: string, title: string, draftContent?: unknown): Promise<string> => {
    const res = await authed(userId, "/artifacts", jsonInit("POST", { title, draftContent }));
    return ((await res.json()) as { id: string }).id;
};

const trash = (userId: string, id: string): Promise<Response> =>
    authed(userId, `/artifacts/${id}/trash`, jsonInit("POST", {}));

describe("find", () => {
    it("lists only this workspace's live artifacts, newest first", async () => {
        const mine = await seedUser();
        const theirs = await seedUser();
        await create(mine.userId, "Older");
        await create(mine.userId, "Newer");
        await create(theirs.userId, "Foreign");

        const refs = await makeWorkspaceReader(mine.workspaceId).find();
        expect(refs.map((r) => r.title)).toEqual(["Newer", "Older"]);
    });

    it("matches a query as a case-insensitive title fragment", async () => {
        const { userId, workspaceId } = await seedUser();
        await create(userId, "Meridian Roadmap");
        await create(userId, "Budget");

        const refs = await makeWorkspaceReader(workspaceId).find("roadMAP");
        expect(refs.map((r) => r.title)).toEqual(["Meridian Roadmap"]);
    });

    it("drops trashed artifacts", async () => {
        const { userId, workspaceId } = await seedUser();
        const doomed = await create(userId, "Doomed");
        await create(userId, "Kept");
        await trash(userId, doomed);

        const refs = await makeWorkspaceReader(workspaceId).find();
        expect(refs.map((r) => r.title)).toEqual(["Kept"]);
    });

    it("caps the browse listing at 8", async () => {
        const { userId, workspaceId } = await seedUser({ plan: "pro" });
        for (let i = 1; i <= 9; i++) await create(userId, `Deck ${i}`);

        const refs = await makeWorkspaceReader(workspaceId).find();
        expect(refs).toHaveLength(8);
        expect(refs.map((r) => r.title)).not.toContain("Deck 1");
    });
});

describe("read", () => {
    it("returns the ref and the stored content for an owned artifact", async () => {
        const { userId, workspaceId } = await seedUser();
        const content = { format: "deck", theme: "studio", sections: [] };
        const id = await create(userId, "Readable", content);

        const got = await makeWorkspaceReader(workspaceId).read(id);
        expect(got).not.toBeNull();
        expect(got!.ref.title).toBe("Readable");
        expect(got!.ref.format).toBe("deck");
        expect(Number.isNaN(Date.parse(got!.ref.updatedAt ?? ""))).toBe(false);
        expect(got!.content).toEqual(content);
    });

    it("answers null, not a thrown query, for a malformed id the model made up", async () => {
        const { workspaceId } = await seedUser();
        expect(await makeWorkspaceReader(workspaceId).read("Meridian Roadmap")).toBeNull();
    });

    it("answers null for a foreign or trashed artifact", async () => {
        const mine = await seedUser();
        const theirs = await seedUser();
        const foreign = await create(theirs.userId, "Foreign");
        const doomed = await create(mine.userId, "Doomed");
        await trash(mine.userId, doomed);

        const reader = makeWorkspaceReader(mine.workspaceId);
        expect(await reader.read(foreign)).toBeNull();
        expect(await reader.read(doomed)).toBeNull();
    });
});
