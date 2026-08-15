import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { authed, jsonInit, seedUser } from "@services/__tests__/harness";
import { db } from "@services/db/client";
import { schema } from "@services/db/schema";

const setSeats = (wsId: string, seats: number) =>
    db.update(schema.workspaces).set({ seats }).where(eq(schema.workspaces.id, wsId));

// a second user placed straight into the workspace with the given stored role
async function addMember(wsId: string, role: string): Promise<{ userId: string }> {
    const u = await seedUser();
    await db.insert(schema.members).values({ workspaceId: wsId, userId: u.userId, role });
    await db
        .update(schema.users)
        .set({ activeWorkspaceId: wsId })
        .where(eq(schema.users.id, u.userId));
    return { userId: u.userId };
}

const memberRow = async (wsId: string, userId: string) => {
    const [row] = await db
        .select()
        .from(schema.members)
        .where(and(eq(schema.members.workspaceId, wsId), eq(schema.members.userId, userId)));
    return row;
};

describe("role reporting", () => {
    it("returns real roles, mapping legacy editor rows to member", async () => {
        const owner = await seedUser({ plan: "pro" });
        await setSeats(owner.workspaceId, 4);
        const admin = await addMember(owner.workspaceId, "admin");
        const legacy = await addMember(owner.workspaceId, "editor");

        const body = await (await authed(owner.userId, "/workspace")).json();
        const byId = new Map(
            body.members.map((m: { userId: string; role: string }) => [m.userId, m.role]),
        );
        expect(byId.get(owner.userId)).toBe("owner");
        expect(byId.get(admin.userId)).toBe("admin");
        expect(byId.get(legacy.userId)).toBe("member");

        expect((await (await authed(admin.userId, "/workspace")).json()).role).toBe("admin");
        expect((await (await authed(legacy.userId, "/workspace")).json()).role).toBe("member");
    });

    it("hides pending invites from plain members but not admins", async () => {
        const owner = await seedUser({ plan: "pro" });
        await setSeats(owner.workspaceId, 4);
        const admin = await addMember(owner.workspaceId, "admin");
        const member = await addMember(owner.workspaceId, "member");
        await authed(
            owner.userId,
            "/workspace/invites",
            jsonInit("POST", { email: "x@test.local" }),
        );

        expect((await (await authed(admin.userId, "/workspace")).json()).invites).toHaveLength(1);
        expect((await (await authed(member.userId, "/workspace")).json()).invites).toHaveLength(0);
    });
});

describe("the role matrix", () => {
    it("members can't invite, revoke, rename, or remove; admins can", async () => {
        const owner = await seedUser({ plan: "pro" });
        await setSeats(owner.workspaceId, 5);
        const admin = await addMember(owner.workspaceId, "admin");
        const member = await addMember(owner.workspaceId, "member");
        const target = await addMember(owner.workspaceId, "member");

        const asMember = [
            await authed(
                member.userId,
                "/workspace/invites",
                jsonInit("POST", { email: "a@test.local" }),
            ),
            await authed(member.userId, "/workspace", jsonInit("PATCH", { name: "Hijacked" })),
            await authed(member.userId, `/workspace/members/${target.userId}`, {
                method: "DELETE",
            }),
        ];
        for (const res of asMember) expect(res.status).toBe(403);

        expect(
            (
                await authed(
                    admin.userId,
                    "/workspace/invites",
                    jsonInit("POST", { email: "b@test.local" }),
                )
            ).status,
        ).toBe(200);
        expect(
            (await authed(admin.userId, "/workspace", jsonInit("PATCH", { name: "Renamed" })))
                .status,
        ).toBe(200);
        expect(
            (
                await authed(admin.userId, `/workspace/members/${target.userId}`, {
                    method: "DELETE",
                })
            ).status,
        ).toBe(200);
    });

    it("an admin can't remove a fellow admin, and nobody removes the owner", async () => {
        const owner = await seedUser({ plan: "pro" });
        await setSeats(owner.workspaceId, 4);
        const adminA = await addMember(owner.workspaceId, "admin");
        const adminB = await addMember(owner.workspaceId, "admin");

        expect(
            (
                await authed(adminA.userId, `/workspace/members/${adminB.userId}`, {
                    method: "DELETE",
                })
            ).status,
        ).toBe(403);
        expect(
            (
                await authed(adminA.userId, `/workspace/members/${owner.userId}`, {
                    method: "DELETE",
                })
            ).status,
        ).toBe(400);
        expect(
            (
                await authed(owner.userId, `/workspace/members/${adminB.userId}`, {
                    method: "DELETE",
                })
            ).status,
        ).toBe(200);
    });

    it("only the owner changes roles, and never their own", async () => {
        const owner = await seedUser({ plan: "pro" });
        await setSeats(owner.workspaceId, 4);
        const admin = await addMember(owner.workspaceId, "admin");
        const member = await addMember(owner.workspaceId, "member");

        expect(
            (
                await authed(
                    admin.userId,
                    `/workspace/members/${member.userId}`,
                    jsonInit("PATCH", { role: "admin" }),
                )
            ).status,
        ).toBe(403);
        expect(
            (
                await authed(
                    owner.userId,
                    `/workspace/members/${owner.userId}`,
                    jsonInit("PATCH", { role: "member" }),
                )
            ).status,
        ).toBe(400);
        expect(
            (
                await authed(
                    owner.userId,
                    `/workspace/members/${member.userId}`,
                    jsonInit("PATCH", { role: "bogus" }),
                )
            ).status,
        ).toBe(400);

        const ok = await authed(
            owner.userId,
            `/workspace/members/${member.userId}`,
            jsonInit("PATCH", { role: "admin" }),
        );
        expect(ok.status).toBe(200);
        expect((await memberRow(owner.workspaceId, member.userId))!.role).toBe("admin");
    });

    it("an invite can carry a role, which the acceptor lands with", async () => {
        const owner = await seedUser({ plan: "pro" });
        await setSeats(owner.workspaceId, 3);
        const res = await authed(
            owner.userId,
            "/workspace/invites",
            jsonInit("POST", { email: "admin-to-be@test.local", role: "admin" }),
        );
        const { url } = await res.json();
        const token = url.split("/invite/")[1];

        const joiner = await seedUser();
        expect(
            (await authed(joiner.userId, "/invites/accept", jsonInit("POST", { token }))).status,
        ).toBe(200);
        expect((await memberRow(owner.workspaceId, joiner.userId))!.role).toBe("admin");
    });
});

describe("rename / leave / transfer", () => {
    it("renames, trimmed and required", async () => {
        const owner = await seedUser();
        expect(
            (await authed(owner.userId, "/workspace", jsonInit("PATCH", { name: "  " }))).status,
        ).toBe(400);
        await authed(owner.userId, "/workspace", jsonInit("PATCH", { name: "  Studio Two  " }));
        const [ws] = await db
            .select()
            .from(schema.workspaces)
            .where(eq(schema.workspaces.id, owner.workspaceId));
        expect(ws!.name).toBe("Studio Two");
    });

    it("a member leaves and falls back to their own workspace; the owner can't", async () => {
        const owner = await seedUser({ plan: "pro" });
        await setSeats(owner.workspaceId, 3);
        const member = await addMember(owner.workspaceId, "member");

        expect((await authed(owner.userId, "/workspace/leave", { method: "POST" })).status).toBe(
            400,
        );
        expect((await authed(member.userId, "/workspace/leave", { method: "POST" })).status).toBe(
            200,
        );
        expect(await memberRow(owner.workspaceId, member.userId)).toBeUndefined();
        const [u] = await db
            .select({ active: schema.users.activeWorkspaceId })
            .from(schema.users)
            .where(eq(schema.users.id, member.userId));
        expect(u!.active).toBeNull();
    });

    it("transfer hands ownership to a member and demotes the old owner to admin", async () => {
        const owner = await seedUser({ plan: "pro" });
        await setSeats(owner.workspaceId, 3);
        const member = await addMember(owner.workspaceId, "member");
        const outsider = await seedUser();

        expect(
            (
                await authed(
                    owner.userId,
                    "/workspace/transfer",
                    jsonInit("POST", { userId: outsider.userId }),
                )
            ).status,
        ).toBe(400);
        expect(
            (
                await authed(
                    member.userId,
                    "/workspace/transfer",
                    jsonInit("POST", { userId: member.userId }),
                )
            ).status,
        ).toBe(403);

        expect(
            (
                await authed(
                    owner.userId,
                    "/workspace/transfer",
                    jsonInit("POST", { userId: member.userId }),
                )
            ).status,
        ).toBe(200);
        const [ws] = await db
            .select()
            .from(schema.workspaces)
            .where(eq(schema.workspaces.id, owner.workspaceId));
        expect(ws!.ownerId).toBe(member.userId);
        expect((await memberRow(owner.workspaceId, owner.userId))!.role).toBe("admin");
        // the new owner now holds owner-only powers
        expect(
            (
                await authed(
                    member.userId,
                    `/workspace/members/${owner.userId}`,
                    jsonInit("PATCH", { role: "member" }),
                )
            ).status,
        ).toBe(200);
    });
});
