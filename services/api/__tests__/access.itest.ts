import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { ArtifactAccess } from "@model/artifact";
import { db } from "@services/db/client";
import { schema } from "@services/db/schema";
import { reserve } from "@services/core/spend";
import { authed, jsonInit, seedUser } from "@services/__tests__/harness";

// One workspace, an owner plus an admin and a member, and one artifact the owner created. Each test
// sets the artifact's level (or the workspace default) and asserts what the member may do.
interface Cast {
    owner: Awaited<ReturnType<typeof seedUser>>;
    admin: string;
    member: string;
    workspaceId: string;
}

let cast: Cast;

const join = async (workspaceId: string, role: "admin" | "member"): Promise<string> => {
    const u = await seedUser();
    await db.insert(schema.members).values({ workspaceId, userId: u.userId, role });
    await db
        .update(schema.users)
        .set({ activeWorkspaceId: workspaceId })
        .where(eq(schema.users.id, u.userId));
    return u.userId;
};

const makeArtifact = async (workspaceId: string, createdBy: string): Promise<string> => {
    const [a] = await db
        .insert(schema.artifacts)
        .values({
            workspaceId,
            createdBy,
            title: "Locked deck",
            draftContent: { format: "deck", theme: "studio", sections: [] },
        })
        .returning({ id: schema.artifacts.id });
    return a!.id;
};

const setAccess = (id: string, access: ArtifactAccess | null) =>
    db.update(schema.artifacts).set({ memberAccess: access }).where(eq(schema.artifacts.id, id));

const setDefault = (workspaceId: string, access: ArtifactAccess) =>
    db
        .update(schema.workspaces)
        .set({ defaultArtifactAccess: access })
        .where(eq(schema.workspaces.id, workspaceId));

let artifactId: string;

beforeEach(async () => {
    const owner = await seedUser();
    cast = {
        owner,
        workspaceId: owner.workspaceId,
        admin: await join(owner.workspaceId, "admin"),
        member: await join(owner.workspaceId, "member"),
    };
    artifactId = await makeArtifact(owner.workspaceId, owner.userId);
});

const readIt = (userId: string) => authed(userId, `/artifacts/${artifactId}`);
const editIt = (userId: string) =>
    authed(
        userId,
        `/artifacts/${artifactId}`,
        jsonInit("PATCH", { title: "Renamed by the member" }),
    );

describe("artifact access levels", () => {
    it("leaves every member with edit when nothing is configured", async () => {
        expect((await readIt(cast.member)).status).toBe(200);
        expect((await editIt(cast.member)).status).toBe(200);
    });

    it("reports the caller's own level on the read", async () => {
        await setAccess(artifactId, "view");
        const body = (await (await readIt(cast.member)).json()) as {
            artifact: { access: ArtifactAccess };
        };
        expect(body.artifact.access).toBe("view");
    });

    it("lets a view-only member read but not write", async () => {
        await setAccess(artifactId, "view");
        expect((await readIt(cast.member)).status).toBe(200);
        expect((await editIt(cast.member)).status).toBe(403);
    });

    it("blocks the content patch, trash, restore, and delete at view", async () => {
        await setAccess(artifactId, "view");
        const ops = jsonInit("PATCH", { ops: [{ kind: "remove", id: "s1" }] });
        expect((await authed(cast.member, `/artifacts/${artifactId}/content`, ops)).status).toBe(
            403,
        );
        expect(
            (await authed(cast.member, `/artifacts/${artifactId}/trash`, jsonInit("POST", {})))
                .status,
        ).toBe(403);
        expect(
            (await authed(cast.member, `/artifacts/${artifactId}/restore`, jsonInit("POST", {})))
                .status,
        ).toBe(403);
        expect(
            (await authed(cast.member, `/artifacts/${artifactId}`, { method: "DELETE" })).status,
        ).toBe(403);
    });

    it("hides a `none` artifact behind a 404, so it reads as missing rather than forbidden", async () => {
        await setAccess(artifactId, "none");
        expect((await readIt(cast.member)).status).toBe(404);
        expect((await editIt(cast.member)).status).toBe(404);
    });

    it("keeps the owner and admins at edit whatever the artifact says", async () => {
        await setAccess(artifactId, "none");
        expect((await readIt(cast.owner.userId)).status).toBe(200);
        expect((await editIt(cast.owner.userId)).status).toBe(200);
        expect((await readIt(cast.admin)).status).toBe(200);
        expect((await editIt(cast.admin)).status).toBe(200);
    });

    it("keeps the creator at edit on their own locked artifact", async () => {
        const mine = await makeArtifact(cast.workspaceId, cast.member);
        await setAccess(mine, "none");
        expect((await authed(cast.member, `/artifacts/${mine}`)).status).toBe(200);
        expect(
            (await authed(cast.member, `/artifacts/${mine}`, jsonInit("PATCH", { title: "Mine" })))
                .status,
        ).toBe(200);
    });

    it("falls back to the workspace default when the artifact sets no level", async () => {
        await setDefault(cast.workspaceId, "view");
        expect((await readIt(cast.member)).status).toBe(200);
        expect((await editIt(cast.member)).status).toBe(403);
    });

    it("lets an explicit level beat a tighter workspace default", async () => {
        await setDefault(cast.workspaceId, "view");
        await setAccess(artifactId, "edit");
        expect((await editIt(cast.member)).status).toBe(200);
    });
});

describe("the library and search never leak a locked artifact", () => {
    it("drops a `none` artifact from the list for a member but not for an admin", async () => {
        await setAccess(artifactId, "none");
        const ids = async (userId: string): Promise<string[]> => {
            const body = (await (await authed(userId, "/artifacts")).json()) as {
                artifacts: { id: string }[];
            };
            return body.artifacts.map((a) => a.id);
        };
        expect(await ids(cast.member)).not.toContain(artifactId);
        expect(await ids(cast.admin)).toContain(artifactId);
        expect(await ids(cast.owner.userId)).toContain(artifactId);
    });

    it("keeps the member's own locked artifact in their list", async () => {
        const mine = await makeArtifact(cast.workspaceId, cast.member);
        await setAccess(mine, "none");
        const body = (await (await authed(cast.member, "/artifacts")).json()) as {
            artifacts: { id: string }[];
        };
        expect(body.artifacts.map((a) => a.id)).toContain(mine);
    });

    it("hides every inheriting artifact when the workspace default is none", async () => {
        await setDefault(cast.workspaceId, "none");
        const body = (await (await authed(cast.member, "/artifacts")).json()) as {
            artifacts: { id: string }[];
        };
        expect(body.artifacts.map((a) => a.id)).not.toContain(artifactId);
    });

    it("still lists an artifact opened up against a none default", async () => {
        await setDefault(cast.workspaceId, "none");
        await setAccess(artifactId, "view");
        const body = (await (await authed(cast.member, "/artifacts")).json()) as {
            artifacts: { id: string }[];
        };
        expect(body.artifacts.map((a) => a.id)).toContain(artifactId);
    });

    it("drops a locked artifact from search results", async () => {
        await setAccess(artifactId, "none");
        const hits = async (userId: string): Promise<string[]> => {
            const body = (await (await authed(userId, "/search?q=Locked")).json()) as {
                artifacts: { id: string }[];
            };
            return body.artifacts.map((a) => a.id);
        };
        expect(await hits(cast.member)).not.toContain(artifactId);
        expect(await hits(cast.admin)).toContain(artifactId);
    });

    it("drops a locked artifact from the recents landing state too", async () => {
        await setAccess(artifactId, "none");
        const body = (await (await authed(cast.member, "/search")).json()) as {
            artifacts: { id: string }[];
        };
        expect(body.artifacts.map((a) => a.id)).not.toContain(artifactId);
    });
});

describe("comments follow the artifact's level", () => {
    const thread = (userId: string) =>
        authed(
            userId,
            `/artifacts/${artifactId}/comments`,
            jsonInit("POST", {
                body: "A note",
                sectionId: "s1",
                anchor: { kind: "element", elementId: "e1" },
            }),
        );

    it("lets a comment-level member comment but not edit the artifact", async () => {
        await setAccess(artifactId, "comment");
        expect((await thread(cast.member)).status).toBe(200);
        expect((await editIt(cast.member)).status).toBe(403);
    });

    it("refuses a new comment at view", async () => {
        await setAccess(artifactId, "view");
        expect((await thread(cast.member)).status).toBe(403);
        expect((await authed(cast.member, `/artifacts/${artifactId}/comments`)).status).toBe(200);
    });

    it("stops a member from resolving a thread once they drop to view", async () => {
        await setAccess(artifactId, "comment");
        const created = (await (await thread(cast.member)).json()) as { comment: { id: string } };
        await setAccess(artifactId, "view");
        const res = await authed(
            cast.member,
            `/comments/${created.comment.id}/resolve`,
            jsonInit("POST", {}),
        );
        expect(res.status).toBe(403);
    });

    it("404s comments on an artifact the member cannot see", async () => {
        await setAccess(artifactId, "none");
        expect((await authed(cast.member, `/artifacts/${artifactId}/comments`)).status).toBe(404);
    });
});

describe("emptying the trash", () => {
    it("is refused for a plain member and allowed for an admin", async () => {
        expect((await authed(cast.member, "/trash", { method: "DELETE" })).status).toBe(403);
        expect((await authed(cast.admin, "/trash", { method: "DELETE" })).status).toBe(200);
    });
});

describe("the publish policy", () => {
    const publish = (userId: string) =>
        authed(
            userId,
            `/artifacts/${artifactId}/links`,
            jsonInit("POST", { visibility: "public" }),
        );

    beforeEach(async () => {
        // public links are a paid feature, so the gate under test is the policy, not the plan
        await db
            .update(schema.workspaces)
            .set({ plan: "pro" })
            .where(eq(schema.workspaces.id, cast.workspaceId));
    });

    it("lets any member publish under the default policy", async () => {
        expect((await publish(cast.member)).status).toBe(200);
    });

    it("refuses a member under the admins policy, and still allows an admin", async () => {
        await db
            .update(schema.workspaces)
            .set({ publishPolicy: "admins" })
            .where(eq(schema.workspaces.id, cast.workspaceId));
        expect((await publish(cast.member)).status).toBe(403);
        expect((await publish(cast.admin)).status).toBe(200);
    });

    it("refuses publishing an artifact the member can only view", async () => {
        await setAccess(artifactId, "view");
        expect((await publish(cast.member)).status).toBe(403);
    });

    // handing a live link to new addresses is publishing too, so it takes the same two gates
    it("gates adding recipients on both the artifact's level and the policy", async () => {
        const created = (await (await publish(cast.owner.userId)).json()) as {
            link: { id: string };
        };
        const invite = (userId: string) =>
            authed(
                userId,
                `/links/${created.link.id}/recipients`,
                jsonInit("POST", { emails: ["outsider@example.com"] }),
            );

        await setAccess(artifactId, "view");
        expect((await invite(cast.member)).status).toBe(403);

        await setAccess(artifactId, "edit");
        expect((await invite(cast.member)).status).toBe(200);

        await db
            .update(schema.workspaces)
            .set({ publishPolicy: "admins" })
            .where(eq(schema.workspaces.id, cast.workspaceId));
        expect((await invite(cast.member)).status).toBe(403);
    });

    it("needs edit to revoke a recipient, but no policy check", async () => {
        const created = (await (await publish(cast.owner.userId)).json()) as {
            link: { id: string };
        };
        const { recipients } = (await (
            await authed(
                cast.owner.userId,
                `/links/${created.link.id}/recipients`,
                jsonInit("POST", { emails: ["outsider@example.com"] }),
            )
        ).json()) as { recipients: { id: string }[] };

        await setAccess(artifactId, "view");
        const path = `/links/${created.link.id}/recipients/${recipients[0]!.id}`;
        expect((await authed(cast.member, path, { method: "DELETE" })).status).toBe(403);

        // an admins-only policy must not strand a live invite nobody can take down
        await db
            .update(schema.workspaces)
            .set({ publishPolicy: "admins" })
            .where(eq(schema.workspaces.id, cast.workspaceId));
        await setAccess(artifactId, "edit");
        expect((await authed(cast.member, path, { method: "DELETE" })).status).toBe(200);
    });

    it("hides link and artifact analytics from a member who cannot see the artifact", async () => {
        await publish(cast.owner.userId);
        await setAccess(artifactId, "none");
        expect((await authed(cast.member, `/artifacts/${artifactId}/analytics`)).status).toBe(404);
    });
});

describe("PATCH /workspace settings", () => {
    it("stores the three policy settings for an admin", async () => {
        const res = await authed(
            cast.admin,
            "/workspace",
            jsonInit("PATCH", {
                defaultArtifactAccess: "view",
                publishPolicy: "admins",
                memberCreditCap: 250,
            }),
        );
        expect(res.status).toBe(200);
        const [ws] = await db
            .select()
            .from(schema.workspaces)
            .where(eq(schema.workspaces.id, cast.workspaceId));
        expect(ws!.defaultArtifactAccess).toBe("view");
        expect(ws!.publishPolicy).toBe("admins");
        expect(ws!.memberCreditCap).toBe(250);
    });

    it("clears the cap on an explicit null", async () => {
        await authed(cast.admin, "/workspace", jsonInit("PATCH", { memberCreditCap: 250 }));
        await authed(cast.admin, "/workspace", jsonInit("PATCH", { memberCreditCap: null }));
        const [ws] = await db
            .select()
            .from(schema.workspaces)
            .where(eq(schema.workspaces.id, cast.workspaceId));
        expect(ws!.memberCreditCap).toBeNull();
    });

    it("refuses a plain member", async () => {
        const res = await authed(
            cast.member,
            "/workspace",
            jsonInit("PATCH", { defaultArtifactAccess: "view" }),
        );
        expect(res.status).toBe(403);
    });

    it("rejects a level or policy it does not know, and a negative cap", async () => {
        for (const body of [
            { defaultArtifactAccess: "toString" },
            { defaultArtifactAccess: "admin" },
            { publishPolicy: "everyone" },
            { memberCreditCap: -5 },
        ]) {
            expect((await authed(cast.admin, "/workspace", jsonInit("PATCH", body))).status).toBe(
                400,
            );
        }
    });

    it("still renames, and rejects an empty patch", async () => {
        expect(
            (await authed(cast.admin, "/workspace", jsonInit("PATCH", { name: "Renamed" }))).status,
        ).toBe(200);
        expect((await authed(cast.admin, "/workspace", jsonInit("PATCH", {}))).status).toBe(400);
    });
});

describe("PUT /artifacts/:id/access", () => {
    it("sets and clears an artifact's level", async () => {
        const set = await authed(
            cast.owner.userId,
            `/artifacts/${artifactId}/access`,
            jsonInit("PUT", { access: "view" }),
        );
        expect(set.status).toBe(200);
        expect((await editIt(cast.member)).status).toBe(403);

        await authed(
            cast.owner.userId,
            `/artifacts/${artifactId}/access`,
            jsonInit("PUT", { access: null }),
        );
        expect((await editIt(cast.member)).status).toBe(200);
    });

    it("refuses a member who only has view on it", async () => {
        await setAccess(artifactId, "view");
        const res = await authed(
            cast.member,
            `/artifacts/${artifactId}/access`,
            jsonInit("PUT", { access: "edit" }),
        );
        expect(res.status).toBe(403);
    });

    it("rejects a level it does not know", async () => {
        const res = await authed(
            cast.owner.userId,
            `/artifacts/${artifactId}/access`,
            jsonInit("PUT", { access: "constructor" }),
        );
        expect(res.status).toBe(400);
    });
});

describe("the per-member credit cap", () => {
    const getWs = async (id: string) => {
        const [ws] = await db.select().from(schema.workspaces).where(eq(schema.workspaces.id, id));
        return ws!;
    };
    const setWs = (id: string, fields: Partial<typeof schema.workspaces.$inferInsert>) =>
        db.update(schema.workspaces).set(fields).where(eq(schema.workspaces.id, id));

    // generate-theme is a flat 4 credits, so the arithmetic below is exact
    const COST = 4;

    beforeEach(async () => {
        await setWs(cast.workspaceId, {
            aiCreditsBalance: 10_000,
            creditsResetAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        });
    });

    const spend = (userId: string, role: "owner" | "admin" | "member") =>
        getWs(cast.workspaceId).then((ws) => reserve(ws, userId, "generate-theme", { role }));

    it("lets a member spend right up to the cap and refuses the call that would cross it", async () => {
        await setWs(cast.workspaceId, { memberCreditCap: COST * 2 });
        expect((await spend(cast.member, "member")).ok).toBe(true);
        expect((await spend(cast.member, "member")).ok).toBe(true);

        const third = await spend(cast.member, "member");
        expect(third.ok).toBe(false);
        if (!third.ok) expect(third.capped).toBe(COST * 2);
    });

    it("charges nothing for the refused call", async () => {
        await setWs(cast.workspaceId, { memberCreditCap: COST });
        await spend(cast.member, "member");
        const after = (await getWs(cast.workspaceId)).aiCreditsBalance;
        expect((await spend(cast.member, "member")).ok).toBe(false);
        expect((await getWs(cast.workspaceId)).aiCreditsBalance).toBe(after);
    });

    it("caps each member separately rather than pooling their spend", async () => {
        await setWs(cast.workspaceId, { memberCreditCap: COST });
        expect((await spend(cast.member, "member")).ok).toBe(true);
        expect((await spend(cast.member, "member")).ok).toBe(false);
        // a second member starts from their own zero
        const other = await join(cast.workspaceId, "member");
        expect((await spend(other, "member")).ok).toBe(true);
    });

    it("does not cap the owner or an admin", async () => {
        await setWs(cast.workspaceId, { memberCreditCap: 0 });
        expect((await spend(cast.owner.userId, "owner")).ok).toBe(true);
        expect((await spend(cast.admin, "admin")).ok).toBe(true);
        expect((await spend(cast.member, "member")).ok).toBe(false);
    });

    it("leaves everyone uncapped when no cap is set", async () => {
        await setWs(cast.workspaceId, { memberCreditCap: null });
        for (let i = 0; i < 5; i++) expect((await spend(cast.member, "member")).ok).toBe(true);
    });

    it("still refuses on an empty balance, cap or no cap", async () => {
        await setWs(cast.workspaceId, { memberCreditCap: 10_000, aiCreditsBalance: 0 });
        const held = await spend(cast.member, "member");
        expect(held.ok).toBe(false);
        if (!held.ok) expect(held.capped).toBeUndefined(); // the pool is dry, not the person
    });

    it("frees the member's budget when the credit window rolls", async () => {
        await setWs(cast.workspaceId, { memberCreditCap: COST });
        expect((await spend(cast.member, "member")).ok).toBe(true);
        expect((await spend(cast.member, "member")).ok).toBe(false);
        // the window reopening puts the earlier spend behind creditsStartedAt
        await setWs(cast.workspaceId, { creditsStartedAt: new Date() });
        expect((await spend(cast.member, "member")).ok).toBe(true);
    });
});
