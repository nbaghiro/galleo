import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Section } from "@model/artifact";
import { artifactDigest, artifactSearchText } from "@model/artifact";
import type { CommentCreateBody, CommentDto } from "@model/comments";
import { authed, jsonInit, seedUser } from "@services/__tests__/harness";
import { db } from "@services/db/client";
import { schema } from "@services/db/schema";

const section = (id: string): Section => ({
    id,
    root: { type: "text", data: { style: "body", text: `body of ${id}` } },
});

const content = (ids: string[]): Record<string, unknown> => ({
    format: "deck",
    theme: "studio",
    sections: ids.map(section),
});

async function seedArtifact(
    workspaceId: string,
    ids = ["s1", "s2"],
    over: Partial<typeof schema.artifacts.$inferInsert> = {},
): Promise<string> {
    const draft = content(ids);
    const [a] = await db
        .insert(schema.artifacts)
        .values({
            workspaceId,
            title: "Commented",
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

// a second person inside the same workspace, with the given stored role
async function addMember(workspaceId: string, role: string): Promise<{ userId: string }> {
    const u = await seedUser();
    await db.insert(schema.members).values({ workspaceId, userId: u.userId, role });
    await db
        .update(schema.users)
        .set({ activeWorkspaceId: workspaceId })
        .where(eq(schema.users.id, u.userId));
    return { userId: u.userId };
}

const root = (over: Partial<CommentCreateBody> = {}): CommentCreateBody => ({
    body: "Does this land?",
    sectionId: "s1",
    anchor: { kind: "element", elementId: "e-1" },
    ...over,
});

const post = async (
    userId: string,
    artifactId: string,
    body: unknown,
): Promise<{ status: number; comment?: CommentDto; error?: string }> => {
    const res = await authed(userId, `/artifacts/${artifactId}/comments`, jsonInit("POST", body));
    const parsed = (await res.json()) as { comment?: CommentDto; error?: string };
    return { status: res.status, ...parsed };
};

const list = async (userId: string, artifactId: string): Promise<CommentDto[]> => {
    const res = await authed(userId, `/artifacts/${artifactId}/comments`);
    expect(res.status).toBe(200);
    return ((await res.json()) as { comments: CommentDto[] }).comments;
};

describe("POST /artifacts/:id/comments", () => {
    it("round-trips a thread with its author and its replies in order", async () => {
        const owner = await seedUser();
        await db
            .update(schema.users)
            .set({ name: "Ada", avatarUrl: "https://example.test/a.png" })
            .where(eq(schema.users.id, owner.userId));
        const id = await seedArtifact(owner.workspaceId);

        const made = await post(owner.userId, id, root({ quote: "Run the kitchen" }));
        expect(made.status).toBe(200);
        expect(made.comment!.author).toEqual({
            id: owner.userId,
            name: "Ada",
            avatarUrl: "https://example.test/a.png",
        });
        expect(made.comment!.quote).toBe("Run the kitchen");
        expect(made.comment!.resolvedAt).toBeNull();

        const reply = await post(
            owner.userId,
            id,
            root({ body: "Yes, it does.", parentId: made.comment!.id }),
        );
        expect(reply.status).toBe(200);
        expect(reply.comment!.parentId).toBe(made.comment!.id);

        const all = await list(owner.userId, id);
        expect(all.map((c) => c.id)).toEqual([made.comment!.id, reply.comment!.id]);
    });

    it("tells each reader what they may do with the row", async () => {
        const owner = await seedUser({ plan: "pro" });
        const admin = await addMember(owner.workspaceId, "admin");
        const member = await addMember(owner.workspaceId, "member");
        const id = await seedArtifact(owner.workspaceId);
        await post(member.userId, id, root());

        const asAuthor = (await list(member.userId, id))[0]!;
        expect([asAuthor.mine, asAuthor.canDelete]).toEqual([true, true]);

        const asAdmin = (await list(admin.userId, id))[0]!;
        expect([asAdmin.mine, asAdmin.canDelete]).toEqual([false, true]);

        const asOther = (await list(owner.userId, id))[0]!;
        expect(asOther.mine).toBe(false);
        expect(asOther.canDelete).toBe(true); // the owner administers the workspace

        const bystander = await addMember(owner.workspaceId, "member");
        const asBystander = (await list(bystander.userId, id))[0]!;
        expect([asBystander.mine, asBystander.canDelete]).toEqual([false, false]);
    });

    it("keeps the anchor it was given", async () => {
        const owner = await seedUser();
        const id = await seedArtifact(owner.workspaceId);
        const made = await post(
            owner.userId,
            id,
            root({ anchor: { kind: "text", elementId: "e-abc12345" } }),
        );
        expect(made.comment!.anchor).toEqual({ kind: "text", elementId: "e-abc12345" });
    });

    it("400s on a body that is empty, oversized, or badly anchored", async () => {
        const owner = await seedUser();
        const id = await seedArtifact(owner.workspaceId);
        expect((await post(owner.userId, id, root({ body: "   " }))).status).toBe(400);
        expect((await post(owner.userId, id, root({ body: "x".repeat(10_001) }))).status).toBe(400);
        expect(
            (await post(owner.userId, id, { ...root(), anchor: { kind: "section" } })).status,
        ).toBe(400);
        expect(
            (await post(owner.userId, id, { ...root(), anchor: { kind: "element" } })).status,
        ).toBe(400);
        expect((await post(owner.userId, id, { body: "no section" })).status).toBe(400);
    });

    it("409s on a section id the artifact's digest has never seen", async () => {
        const owner = await seedUser();
        const id = await seedArtifact(owner.workspaceId);
        const made = await post(owner.userId, id, root({ sectionId: "ghost" }));
        expect(made.status).toBe(409);
        expect(await list(owner.userId, id)).toHaveLength(0);
    });

    it("accepts any section when the row predates the digest", async () => {
        const owner = await seedUser();
        const [a] = await db
            .insert(schema.artifacts)
            .values({
                workspaceId: owner.workspaceId,
                title: "Legacy",
                formatId: "deck",
                themeId: "studio",
                draftContent: content(["s1"]),
            })
            .returning({ id: schema.artifacts.id });
        expect((await post(owner.userId, a!.id, root({ sectionId: "s1" }))).status).toBe(200);
    });

    it("refuses a reply to a reply and a parent from another artifact", async () => {
        const owner = await seedUser();
        const one = await seedArtifact(owner.workspaceId);
        const two = await seedArtifact(owner.workspaceId);

        const first = await post(owner.userId, one, root());
        const reply = await post(owner.userId, one, root({ parentId: first.comment!.id }));
        const nested = await post(owner.userId, one, root({ parentId: reply.comment!.id }));
        expect(nested.status).toBe(409);

        const crossed = await post(owner.userId, two, root({ parentId: first.comment!.id }));
        expect(crossed.status).toBe(409);
    });

    it("404s for a member of another workspace", async () => {
        const mine = await seedUser();
        const theirs = await seedUser();
        const id = await seedArtifact(theirs.workspaceId);
        expect((await post(mine.userId, id, root())).status).toBe(404);
        expect((await authed(mine.userId, `/artifacts/${id}/comments`)).status).toBe(404);
    });
});

describe("PATCH /comments/:id", () => {
    it("lets the author rewrite their own comment and nobody else", async () => {
        const owner = await seedUser({ plan: "pro" });
        const other = await addMember(owner.workspaceId, "member");
        const id = await seedArtifact(owner.workspaceId);
        const made = await post(owner.userId, id, root());

        const mine = await authed(
            owner.userId,
            `/comments/${made.comment!.id}`,
            jsonInit("PATCH", { body: "Rewritten" }),
        );
        expect(mine.status).toBe(200);
        expect(((await mine.json()) as { comment: CommentDto }).comment.body).toBe("Rewritten");

        const theirs = await authed(
            other.userId,
            `/comments/${made.comment!.id}`,
            jsonInit("PATCH", { body: "Hijacked" }),
        );
        expect(theirs.status).toBe(403);
    });

    it("400s on an empty body", async () => {
        const owner = await seedUser();
        const id = await seedArtifact(owner.workspaceId);
        const made = await post(owner.userId, id, root());
        const res = await authed(
            owner.userId,
            `/comments/${made.comment!.id}`,
            jsonInit("PATCH", { body: "  " }),
        );
        expect(res.status).toBe(400);
    });
});

describe("resolve / unresolve", () => {
    it("resolves a thread from any member and reopens it", async () => {
        const owner = await seedUser({ plan: "pro" });
        const member = await addMember(owner.workspaceId, "member");
        const id = await seedArtifact(owner.workspaceId);
        const made = await post(owner.userId, id, root());

        const done = await authed(member.userId, `/comments/${made.comment!.id}/resolve`, {
            method: "POST",
        });
        expect(done.status).toBe(200);
        expect(((await done.json()) as { comment: CommentDto }).comment.resolvedAt).not.toBeNull();

        const reopened = await authed(owner.userId, `/comments/${made.comment!.id}/unresolve`, {
            method: "POST",
        });
        expect(((await reopened.json()) as { comment: CommentDto }).comment.resolvedAt).toBeNull();
    });

    it("refuses to resolve a reply", async () => {
        const owner = await seedUser();
        const id = await seedArtifact(owner.workspaceId);
        const made = await post(owner.userId, id, root());
        const reply = await post(owner.userId, id, root({ parentId: made.comment!.id }));
        const res = await authed(owner.userId, `/comments/${reply.comment!.id}/resolve`, {
            method: "POST",
        });
        expect(res.status).toBe(409);
    });
});

describe("DELETE /comments/:id", () => {
    it("lets an admin delete another member's comment but not a plain member", async () => {
        const owner = await seedUser({ plan: "pro" });
        const admin = await addMember(owner.workspaceId, "admin");
        const author = await addMember(owner.workspaceId, "member");
        const bystander = await addMember(owner.workspaceId, "member");
        const id = await seedArtifact(owner.workspaceId);

        const first = await post(author.userId, id, root());
        expect(
            (await authed(bystander.userId, `/comments/${first.comment!.id}`, { method: "DELETE" }))
                .status,
        ).toBe(403);
        expect(
            (await authed(admin.userId, `/comments/${first.comment!.id}`, { method: "DELETE" }))
                .status,
        ).toBe(200);
        expect(await list(owner.userId, id)).toHaveLength(0);

        const second = await post(author.userId, id, root());
        expect(
            (await authed(author.userId, `/comments/${second.comment!.id}`, { method: "DELETE" }))
                .status,
        ).toBe(200);
    });

    it("takes a thread's replies with it", async () => {
        const owner = await seedUser();
        const id = await seedArtifact(owner.workspaceId);
        const made = await post(owner.userId, id, root());
        await post(owner.userId, id, root({ parentId: made.comment!.id }));
        expect(await list(owner.userId, id)).toHaveLength(2);

        await authed(owner.userId, `/comments/${made.comment!.id}`, { method: "DELETE" });
        expect(await list(owner.userId, id)).toHaveLength(0);
    });

    it("404s on a comment in another workspace", async () => {
        const mine = await seedUser();
        const theirs = await seedUser();
        const id = await seedArtifact(theirs.workspaceId);
        const made = await post(theirs.userId, id, root());
        expect(
            (await authed(mine.userId, `/comments/${made.comment!.id}`, { method: "DELETE" }))
                .status,
        ).toBe(404);
        expect(
            (
                await authed(
                    mine.userId,
                    `/comments/${made.comment!.id}`,
                    jsonInit("PATCH", { body: "nope" }),
                )
            ).status,
        ).toBe(404);
    });
});

describe("artifact lifecycle", () => {
    it("drops the comments when the artifact is hard-deleted", async () => {
        const owner = await seedUser();
        const id = await seedArtifact(owner.workspaceId);
        await post(owner.userId, id, root());
        await authed(owner.userId, `/artifacts/${id}`, { method: "DELETE" });
        const left = await db
            .select({ id: schema.comments.id })
            .from(schema.comments)
            .where(eq(schema.comments.artifactId, id));
        expect(left).toHaveLength(0);
    });

    it("drops them when the trash is emptied", async () => {
        const owner = await seedUser();
        const id = await seedArtifact(owner.workspaceId);
        await post(owner.userId, id, root());
        await authed(owner.userId, `/artifacts/${id}/trash`, { method: "POST" });
        await authed(owner.userId, "/trash", { method: "DELETE" });
        const left = await db
            .select({ id: schema.comments.id })
            .from(schema.comments)
            .where(eq(schema.comments.artifactId, id));
        expect(left).toHaveLength(0);
    });
});
