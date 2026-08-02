import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { authed, jsonInit, seedUser } from "../../__tests__/harness";
import { db, schema } from "../../schema";

const setSeats = (wsId: string, seats: number) =>
    db.update(schema.workspaces).set({ seats }).where(eq(schema.workspaces.id, wsId));

async function invite(ownerId: string, email: string): Promise<{ url: string; token: string }> {
    const res = await authed(ownerId, "/workspace/invites", jsonInit("POST", { email }));
    expect(res.status).toBe(200);
    const body = await res.json();
    return { url: body.url, token: body.url.split("/invite/")[1] };
}

describe("GET /workspace", () => {
    it("reports members, role, and memberships", async () => {
        const { userId, email } = await seedUser();
        const res = await authed(userId, "/workspace");
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.role).toBe("owner");
        expect(body.members).toHaveLength(1);
        expect(body.members[0]).toMatchObject({ email, isOwner: true });
        expect(body.memberships).toHaveLength(1);
        expect(body.memberships[0].active).toBe(true);
    });
});

describe("invites", () => {
    it("owner invites into a free seat; the pending invite appears with an accept URL", async () => {
        const owner = await seedUser({ plan: "pro" });
        await setSeats(owner.workspaceId, 2);
        const { url } = await invite(owner.userId, "new@test.local");
        expect(url).toContain("/invite/");
        const body = await (await authed(owner.userId, "/workspace")).json();
        expect(body.invites).toHaveLength(1);
        expect(body.invites[0].email).toBe("new@test.local");
    });

    it("402s with an upgrade hint when every seat is taken", async () => {
        const owner = await seedUser(); // free: 1 seat, owner occupies it
        const res = await authed(
            owner.userId,
            "/workspace/invites",
            jsonInit("POST", { email: "x@test.local" }),
        );
        expect(res.status).toBe(402);
        expect((await res.json()).upgrade).toBe(true);
    });

    it("409s when the email already belongs to a member", async () => {
        const owner = await seedUser({ plan: "pro" });
        await setSeats(owner.workspaceId, 3);
        const res = await authed(
            owner.userId,
            "/workspace/invites",
            jsonInit("POST", { email: owner.email }),
        );
        expect(res.status).toBe(409);
    });

    it("only the owner can invite or revoke", async () => {
        const owner = await seedUser({ plan: "pro" });
        await setSeats(owner.workspaceId, 3);
        const joiner = await seedUser();
        const { token } = await invite(owner.userId, joiner.email);
        await authed(joiner.userId, "/invites/accept", jsonInit("POST", { token }));
        const res = await authed(
            joiner.userId,
            "/workspace/invites",
            jsonInit("POST", { email: "z@test.local" }),
        );
        expect(res.status).toBe(403);
    });

    it("revoking a pending invite kills its token", async () => {
        const owner = await seedUser({ plan: "pro" });
        await setSeats(owner.workspaceId, 2);
        const joiner = await seedUser();
        const { token } = await invite(owner.userId, joiner.email);
        const body = await (await authed(owner.userId, "/workspace")).json();
        await authed(owner.userId, `/workspace/invites/${body.invites[0].id}`, {
            method: "DELETE",
        });
        const res = await authed(joiner.userId, "/invites/accept", jsonInit("POST", { token }));
        expect(res.status).toBe(404);
    });
});

describe("accepting an invite", () => {
    it("joins the workspace and switches the member into it", async () => {
        const owner = await seedUser({ plan: "pro" });
        await setSeats(owner.workspaceId, 2);
        const joiner = await seedUser();
        const { token } = await invite(owner.userId, joiner.email);

        const preview = await authed(joiner.userId, `/invites/${token}`);
        expect((await preview.json()).workspace).toBe("Test WS");

        const res = await authed(joiner.userId, "/invites/accept", jsonInit("POST", { token }));
        expect(res.status).toBe(200);
        expect((await res.json()).workspaceId).toBe(owner.workspaceId);

        const body = await (await authed(joiner.userId, "/workspace")).json();
        expect(body.workspace.id).toBe(owner.workspaceId);
        expect(body.role).toBe("member");
        expect(body.memberships).toHaveLength(2);
    });

    it("404s an expired invite", async () => {
        const owner = await seedUser({ plan: "pro" });
        await setSeats(owner.workspaceId, 2);
        const joiner = await seedUser();
        const { token } = await invite(owner.userId, joiner.email);
        await db
            .update(schema.invites)
            .set({ expiresAt: new Date(Date.now() - 1000) })
            .where(eq(schema.invites.workspaceId, owner.workspaceId));
        const res = await authed(joiner.userId, "/invites/accept", jsonInit("POST", { token }));
        expect(res.status).toBe(404);
    });

    it("402s at the door when seats shrank after the invite went out", async () => {
        const owner = await seedUser({ plan: "pro" });
        await setSeats(owner.workspaceId, 2);
        const joiner = await seedUser();
        const { token } = await invite(owner.userId, joiner.email);
        await setSeats(owner.workspaceId, 1);
        const res = await authed(joiner.userId, "/invites/accept", jsonInit("POST", { token }));
        expect(res.status).toBe(402);
    });
});

describe("members & switching", () => {
    async function joined() {
        const owner = await seedUser({ plan: "pro" });
        await setSeats(owner.workspaceId, 3);
        const joiner = await seedUser();
        const { token } = await invite(owner.userId, joiner.email);
        await authed(joiner.userId, "/invites/accept", jsonInit("POST", { token }));
        return { owner, joiner };
    }

    it("a member can switch back to their own workspace and into the shared one", async () => {
        const { owner, joiner } = await joined();
        await authed(
            joiner.userId,
            "/workspace/switch",
            jsonInit("POST", { workspaceId: joiner.workspaceId }),
        );
        let body = await (await authed(joiner.userId, "/workspace")).json();
        expect(body.workspace.id).toBe(joiner.workspaceId);

        await authed(
            joiner.userId,
            "/workspace/switch",
            jsonInit("POST", { workspaceId: owner.workspaceId }),
        );
        body = await (await authed(joiner.userId, "/workspace")).json();
        expect(body.workspace.id).toBe(owner.workspaceId);
    });

    it("403s switching into a workspace without a membership", async () => {
        const stranger = await seedUser();
        const other = await seedUser();
        const res = await authed(
            stranger.userId,
            "/workspace/switch",
            jsonInit("POST", { workspaceId: other.workspaceId }),
        );
        expect(res.status).toBe(403);
    });

    it("removing a member drops them back into their own workspace", async () => {
        const { owner, joiner } = await joined();
        const res = await authed(owner.userId, `/workspace/members/${joiner.userId}`, {
            method: "DELETE",
        });
        expect(res.status).toBe(200);
        const body = await (await authed(joiner.userId, "/workspace")).json();
        expect(body.workspace.id).toBe(joiner.workspaceId);
        expect(body.memberships).toHaveLength(1);
    });

    it("the owner can't be removed", async () => {
        const { owner } = await joined();
        const res = await authed(owner.userId, `/workspace/members/${owner.userId}`, {
            method: "DELETE",
        });
        expect(res.status).toBe(400);
    });
});
