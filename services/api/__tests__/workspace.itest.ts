import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { authed, jsonInit, seedUser } from "@services/__tests__/harness";
import { db } from "@services/db/client";
import { chargeCredits } from "@services/core/ledger";
import { schema } from "@services/db/schema";

const setPlan = (wsId: string, plan: string) =>
    db.update(schema.workspaces).set({ plan }).where(eq(schema.workspaces.id, wsId));
// a plan for one person cannot invite, so the fixtures that need a roster run on the team plan
const makeTeam = (wsId: string) => setPlan(wsId, "premium");

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
    it("owner invites; the pending invite appears with an accept URL", async () => {
        const owner = await seedUser({ plan: "pro" });
        await makeTeam(owner.workspaceId);
        const { url } = await invite(owner.userId, "new@test.local");
        expect(url).toContain("/invite/");
        const body = await (await authed(owner.userId, "/workspace")).json();
        expect(body.invites).toHaveLength(1);
        expect(body.invites[0].email).toBe("new@test.local");
    });

    it("402s with an upgrade hint on a plan for one person", async () => {
        const owner = await seedUser(); // free is for one person, and the owner is that person
        const res = await authed(
            owner.userId,
            "/workspace/invites",
            jsonInit("POST", { email: "x@test.local" }),
        );
        expect(res.status).toBe(402);
        expect(await res.json()).toMatchObject({
            upgrade: true,
            reason: "feature",
            feature: "maxMembers",
        });
    });

    it("409s when the email already belongs to a member", async () => {
        const owner = await seedUser({ plan: "pro" });
        await makeTeam(owner.workspaceId);
        const res = await authed(
            owner.userId,
            "/workspace/invites",
            jsonInit("POST", { email: owner.email }),
        );
        expect(res.status).toBe(409);
    });

    it("only the owner can invite or revoke", async () => {
        const owner = await seedUser({ plan: "pro" });
        await makeTeam(owner.workspaceId);
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
        await makeTeam(owner.workspaceId);
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
        await makeTeam(owner.workspaceId);
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
        await makeTeam(owner.workspaceId);
        const joiner = await seedUser();
        const { token } = await invite(owner.userId, joiner.email);
        await db
            .update(schema.invites)
            .set({ expiresAt: new Date(Date.now() - 1000) })
            .where(eq(schema.invites.workspaceId, owner.workspaceId));
        const res = await authed(joiner.userId, "/invites/accept", jsonInit("POST", { token }));
        expect(res.status).toBe(404);
    });

    it("402s at the door when the plan dropped to one person after the invite went out", async () => {
        const owner = await seedUser({ plan: "premium" });
        const joiner = await seedUser();
        const { token } = await invite(owner.userId, joiner.email);
        await setPlan(owner.workspaceId, "pro");
        const res = await authed(joiner.userId, "/invites/accept", jsonInit("POST", { token }));
        expect(res.status).toBe(402);
        expect(await res.json()).toMatchObject({ reason: "feature", feature: "maxMembers" });
    });
});

describe("the roster's spend column", () => {
    it("carries each member's spend this cycle only when asked", async () => {
        const owner = await seedUser({ plan: "premium" });
        const joiner = await seedUser();
        const { token } = await invite(owner.userId, joiner.email);
        await authed(joiner.userId, "/invites/accept", jsonInit("POST", { token }));
        const [ws] = await db
            .select()
            .from(schema.workspaces)
            .where(eq(schema.workspaces.id, owner.workspaceId));
        await chargeCredits(ws!, 7, "rewrite-section", joiner.userId);

        const plain = await (await authed(owner.userId, "/workspace")).json();
        expect(plain.members.every((m: { spend?: number }) => m.spend === undefined)).toBe(true);

        const withSpend = await (await authed(owner.userId, "/workspace?spend=1")).json();
        const by = new Map(
            withSpend.members.map((m: { email: string; spend: number }) => [m.email, m.spend]),
        );
        expect(by.get(joiner.email)).toBe(7);
        expect(by.get(owner.email)).toBe(0);
    });
});

describe("members & switching", () => {
    async function joined() {
        const owner = await seedUser({ plan: "pro" });
        await makeTeam(owner.workspaceId);
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

describe("API credentials", () => {
    it("issues one on a plan that grants API access, and shows the secret only there", async () => {
        const owner = await seedUser({ plan: "premium" });
        const made = await authed(
            owner.userId,
            "/workspace/credentials",
            jsonInit("POST", { name: "CI" }),
        );
        expect(made.status).toBe(201);
        const credential = await made.json();
        expect(credential.clientId).toMatch(/^galleo-api-[0-9a-f]{24}$/);
        expect(credential.secret).toBeTruthy();

        const listed = await (await authed(owner.userId, "/workspace/credentials")).json();
        expect(listed.credentials).toHaveLength(1);
        expect(listed.credentials[0]).toMatchObject({ clientId: credential.clientId, name: "CI" });
        expect(listed.credentials[0].secret).toBeUndefined();
        expect(listed.credentials[0].lastUsedAt).toBeNull();
    });

    it("402s with an upgrade hint on a plan without API access", async () => {
        const owner = await seedUser();
        const res = await authed(
            owner.userId,
            "/workspace/credentials",
            jsonInit("POST", { name: "CI" }),
        );
        expect(res.status).toBe(402);
        expect((await res.json()).upgrade).toBe(true);
    });

    it("400s a nameless credential with a plain error body", async () => {
        const owner = await seedUser({ plan: "premium" });
        const res = await authed(
            owner.userId,
            "/workspace/credentials",
            jsonInit("POST", { name: "" }),
        );
        expect(res.status).toBe(400);
        expect(await res.json()).toEqual({ error: "invalid request body" });
    });

    it("is admin work: a plain member neither lists nor creates", async () => {
        const owner = await seedUser({ plan: "premium" });
        await makeTeam(owner.workspaceId);
        const joiner = await seedUser();
        const { token } = await invite(owner.userId, joiner.email);
        await authed(joiner.userId, "/invites/accept", jsonInit("POST", { token }));

        expect((await authed(joiner.userId, "/workspace/credentials")).status).toBe(403);
        const res = await authed(
            joiner.userId,
            "/workspace/credentials",
            jsonInit("POST", { name: "CI" }),
        );
        expect(res.status).toBe(403);
    });

    it("revokes one, and answers 404 for a credential that is already gone", async () => {
        const owner = await seedUser({ plan: "premium" });
        const made = await authed(
            owner.userId,
            "/workspace/credentials",
            jsonInit("POST", { name: "CI" }),
        );
        const { clientId } = await made.json();

        const gone = await authed(owner.userId, `/workspace/credentials/${clientId}`, {
            method: "DELETE",
        });
        expect(gone.status).toBe(200);
        const listed = await (await authed(owner.userId, "/workspace/credentials")).json();
        expect(listed.credentials).toHaveLength(0);

        const again = await authed(owner.userId, `/workspace/credentials/${clientId}`, {
            method: "DELETE",
        });
        expect(again.status).toBe(404);
    });

    it("does not reach another workspace's credentials", async () => {
        const mine = await seedUser({ plan: "premium" });
        const theirs = await seedUser({ plan: "premium" });
        const made = await authed(
            theirs.userId,
            "/workspace/credentials",
            jsonInit("POST", { name: "CI" }),
        );
        const { clientId } = await made.json();

        const res = await authed(mine.userId, `/workspace/credentials/${clientId}`, {
            method: "DELETE",
        });
        expect(res.status).toBe(404);
        const listed = await (await authed(theirs.userId, "/workspace/credentials")).json();
        expect(listed.credentials).toHaveLength(1);
    });
});
