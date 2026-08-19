import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { ArtifactAccess } from "@model/artifact";
import { db } from "@services/db/client";
import { schema } from "@services/db/schema";
import { authed, jsonInit, seedUser } from "@services/__tests__/harness";

// Two separate workspaces: the host owns the artifact, the guest is a complete outsider whose only
// route to it is a grant. Every effective-access assertion below is about that seam.
interface Cast {
    host: Awaited<ReturnType<typeof seedUser>>;
    guest: Awaited<ReturnType<typeof seedUser>>;
    member: string;
}

let cast: Cast;
let artifactId: string;

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
            title: "Quarterly review",
            formatId: "deck",
            themeId: "studio",
            draftContent: {
                format: "deck",
                theme: "studio",
                sections: [{ id: "s1", root: { type: "group", data: { children: [] } } }],
            },
            digest: { cover: {}, sections: [{ kind: "cover", id: "s1" }] },
        })
        .returning({ id: schema.artifacts.id });
    return a!.id;
};

const setAccess = (id: string, access: ArtifactAccess | null) =>
    db.update(schema.artifacts).set({ memberAccess: access }).where(eq(schema.artifacts.id, id));

const invite = (by: string, email: string, access: ArtifactAccess) =>
    authed(by, `/artifacts/${artifactId}/collaborators`, jsonInit("POST", { email, access }));

const collaborators = async (
    userId: string,
): Promise<{ id: string; email: string; access: string }[]> => {
    const body = (await (
        await authed(userId, `/artifacts/${artifactId}/collaborators`)
    ).json()) as { collaborators: { id: string; email: string; access: string }[] };
    return body.collaborators;
};

const read = (userId: string) => authed(userId, `/artifacts/${artifactId}`);
const rename = (userId: string) =>
    authed(userId, `/artifacts/${artifactId}`, jsonInit("PATCH", { title: "Renamed" }));

beforeEach(async () => {
    const host = await seedUser();
    cast = { host, guest: await seedUser(), member: await join(host.workspaceId, "member") };
    artifactId = await makeArtifact(host.workspaceId, host.userId);
});

describe("collaborator grants", () => {
    it("keeps an outsider out until they are invited", async () => {
        expect((await read(cast.guest.userId)).status).toBe(404);
        await invite(cast.host.userId, cast.guest.email, "view");
        expect((await read(cast.guest.userId)).status).toBe(200);
    });

    it("reads across workspaces, so the caller's own active workspace is never the scope", async () => {
        await invite(cast.host.userId, cast.guest.email, "edit");
        const body = (await (await read(cast.guest.userId)).json()) as {
            artifact: { id: string; access: ArtifactAccess };
        };
        expect(body.artifact.id).toBe(artifactId);
        expect(body.artifact.access).toBe("edit");
        // and the guest's own workspace still holds nothing
        const mine = (await (await authed(cast.guest.userId, "/artifacts")).json()) as {
            artifacts: { id: string }[];
        };
        expect(mine.artifacts).toHaveLength(0);
    });

    it("grants each level exactly", async () => {
        await invite(cast.host.userId, cast.guest.email, "view");
        expect((await read(cast.guest.userId)).status).toBe(200);
        expect((await rename(cast.guest.userId)).status).toBe(403);

        await invite(cast.host.userId, cast.guest.email, "comment");
        const comment = await authed(
            cast.guest.userId,
            `/artifacts/${artifactId}/comments`,
            jsonInit("POST", {
                body: "Looks good",
                sectionId: "s1",
                anchor: { kind: "element", elementId: "e1" },
            }),
        );
        expect(comment.status).toBe(200);
        expect((await rename(cast.guest.userId)).status).toBe(403);

        await invite(cast.host.userId, cast.guest.email, "edit");
        expect((await rename(cast.guest.userId)).status).toBe(200);
    });

    it("lets a grantee patch content through the section-op route", async () => {
        await invite(cast.host.userId, cast.guest.email, "edit");
        const res = await authed(
            cast.guest.userId,
            `/artifacts/${artifactId}/content`,
            jsonInit("PATCH", {
                ops: [
                    {
                        kind: "set",
                        section: { id: "s1", root: { type: "group", data: { children: [] } } },
                    },
                ],
            }),
        );
        expect(res.status).toBe(200);
    });

    // A grant is an explicit per-user level, so it beats what the artifact and the workspace say,
    // in both directions: "everyone can edit, except Sam is view-only" has to be expressible.
    it("lowers a plain member below an edit default", async () => {
        await setAccess(artifactId, "edit");
        expect((await rename(cast.member)).status).toBe(200);
        const [u] = await db
            .select({ email: schema.users.email })
            .from(schema.users)
            .where(eq(schema.users.id, cast.member));
        await invite(cast.host.userId, u!.email, "view");
        expect((await read(cast.member)).status).toBe(200);
        expect((await rename(cast.member)).status).toBe(403);
    });

    it("returns a narrowed member to the inherited level when the grant is revoked", async () => {
        const [u] = await db
            .select({ email: schema.users.email })
            .from(schema.users)
            .where(eq(schema.users.id, cast.member));
        await invite(cast.host.userId, u!.email, "view");
        expect((await rename(cast.member)).status).toBe(403);
        const row = (await collaborators(cast.host.userId)).find((g) => g.email === u!.email);
        await authed(cast.host.userId, `/artifacts/${artifactId}/collaborators/${row!.id}`, {
            method: "DELETE",
        });
        expect((await rename(cast.member)).status).toBe(200);
    });

    it("never lowers an admin or the owner", async () => {
        const admin = await join(cast.host.workspaceId, "admin");
        const [a] = await db
            .select({ email: schema.users.email })
            .from(schema.users)
            .where(eq(schema.users.id, admin));
        await invite(cast.host.userId, a!.email, "view");
        expect((await rename(admin)).status).toBe(200);
    });

    it("raises a locked-down member through a grant", async () => {
        await setAccess(artifactId, "none");
        expect((await read(cast.member)).status).toBe(404);
        const [u] = await db
            .select({ email: schema.users.email })
            .from(schema.users)
            .where(eq(schema.users.id, cast.member));
        await invite(cast.host.userId, u!.email, "comment");
        expect((await read(cast.member)).status).toBe(200);
        expect((await rename(cast.member)).status).toBe(403);
    });

    it("lists, re-levels, and revokes", async () => {
        await invite(cast.host.userId, cast.guest.email, "view");
        const [row] = await collaborators(cast.host.userId);
        expect(row?.email).toBe(cast.guest.email);
        expect(row?.access).toBe("view");

        const patched = await authed(
            cast.host.userId,
            `/artifacts/${artifactId}/collaborators/${row!.id}`,
            jsonInit("PATCH", { access: "edit" }),
        );
        expect(patched.status).toBe(200);
        expect((await rename(cast.guest.userId)).status).toBe(200);

        const revoked = await authed(
            cast.host.userId,
            `/artifacts/${artifactId}/collaborators/${row!.id}`,
            { method: "DELETE" },
        );
        expect(revoked.status).toBe(200);
        expect((await read(cast.guest.userId)).status).toBe(404);
    });

    it("refuses a level it does not know and an unusable email", async () => {
        expect((await invite(cast.host.userId, "not-an-email", "edit")).status).toBe(400);
        const res = await authed(
            cast.host.userId,
            `/artifacts/${artifactId}/collaborators`,
            jsonInit("POST", { email: cast.guest.email, access: "none" }),
        );
        // a grant is a level, never a way to take someone to none, so "none" is not grantable
        expect(res.status).toBe(200);
        const [row] = await collaborators(cast.host.userId);
        expect(row?.access).toBe("edit");
        const patched = await authed(
            cast.host.userId,
            `/artifacts/${artifactId}/collaborators/${row!.id}`,
            jsonInit("PATCH", { access: "none" }),
        );
        expect(patched.status).toBe(400);
    });

    it("stops an invited editor from inviting anyone else", async () => {
        await invite(cast.host.userId, cast.guest.email, "edit");
        const third = await seedUser();
        expect((await invite(cast.guest.userId, third.email, "edit")).status).toBe(403);
    });

    it("refuses a caller who can only view the artifact", async () => {
        await setAccess(artifactId, "view");
        const third = await seedUser();
        expect((await invite(cast.member, third.email, "edit")).status).toBe(403);
    });
});

describe("inviting an address with no account", () => {
    it("hands back a token link, and accepting it binds the grant", async () => {
        const res = await invite(cast.host.userId, "nobody@example.com", "edit");
        expect(res.status).toBe(200);
        const body = (await res.json()) as { url: string | null };
        expect(body.url).toContain("/collab/");
        const token = body.url!.split("/collab/")[1]!;

        // the person then signs up; a fresh account holds no grant until the token is spent
        const late = await seedUser();
        expect((await read(late.userId)).status).toBe(404);

        const peek = await authed(late.userId, `/collab/invites/${token}`);
        expect(peek.status).toBe(200);

        const accepted = await authed(
            late.userId,
            "/collab/invites/accept",
            jsonInit("POST", { token }),
        );
        expect(accepted.status).toBe(200);
        expect((await read(late.userId)).status).toBe(200);
        expect((await rename(late.userId)).status).toBe(200);

        // the token is spent, so a forwarded copy of the link does nothing
        const other = await seedUser();
        expect(
            (await authed(other.userId, "/collab/invites/accept", jsonInit("POST", { token })))
                .status,
        ).toBe(404);
    });

    it("binds an address that already has an account without a token", async () => {
        const res = await invite(cast.host.userId, cast.guest.email, "view");
        const body = (await res.json()) as { url: string | null };
        expect(body.url).toBeNull();
        expect((await read(cast.guest.userId)).status).toBe(200);
    });
});

describe("what a grant does not open", () => {
    beforeEach(async () => {
        await invite(cast.host.userId, cast.guest.email, "edit");
    });

    // The route 503s before its gate when no provider key is present, so one is faked here: the
    // assertion is about the artifact gate, which runs before anything billable.
    it("keeps AI turns members-only", async () => {
        const before = process.env.GOOGLE_API_KEY;
        process.env.GOOGLE_API_KEY = "test-key";
        try {
            const turn = (userId: string) =>
                authed(
                    userId,
                    "/ai/turn",
                    jsonInit("POST", {
                        kind: "chat",
                        input: { message: "hi", context: { artifactId } },
                    }),
                );
            expect((await turn(cast.guest.userId)).status).toBe(404);
            // the host is a member, so the same turn gets past the gate
            expect((await turn(cast.host.userId)).status).not.toBe(404);
        } finally {
            if (before === undefined) delete process.env.GOOGLE_API_KEY;
            else process.env.GOOGLE_API_KEY = before;
        }
    });

    it("keeps trashing and deleting with the owning workspace", async () => {
        expect(
            (
                await authed(
                    cast.guest.userId,
                    `/artifacts/${artifactId}/trash`,
                    jsonInit("POST", {}),
                )
            ).status,
        ).toBe(404);
        expect(
            (await authed(cast.guest.userId, `/artifacts/${artifactId}`, { method: "DELETE" }))
                .status,
        ).toBe(404);
    });

    it("keeps publishing with the owning workspace", async () => {
        const res = await authed(
            cast.guest.userId,
            `/artifacts/${artifactId}/links`,
            jsonInit("POST", { visibility: "public" }),
        );
        expect(res.status).not.toBe(200);
    });

    it("keeps the artifact out of the grantee's own library and search", async () => {
        const list = (await (await authed(cast.guest.userId, "/artifacts")).json()) as {
            artifacts: { id: string }[];
        };
        expect(list.artifacts.map((a) => a.id)).not.toContain(artifactId);
        const hits = (await (await authed(cast.guest.userId, "/search?q=Quarterly")).json()) as {
            artifacts: { id: string }[];
        };
        expect(hits.artifacts.map((a) => a.id)).not.toContain(artifactId);
    });
});

describe("shared with me", () => {
    it("lists what a grant opened, and drops it again on revoke", async () => {
        await invite(cast.host.userId, cast.guest.email, "edit");
        const shared = async (): Promise<{ id: string; workspaceName: string }[]> => {
            const body = (await (await authed(cast.guest.userId, "/shared-with-me")).json()) as {
                artifacts: { id: string; workspaceName: string }[];
            };
            return body.artifacts;
        };
        expect((await shared()).map((a) => a.id)).toContain(artifactId);

        const [row] = await collaborators(cast.host.userId);
        await authed(cast.host.userId, `/artifacts/${artifactId}/collaborators/${row!.id}`, {
            method: "DELETE",
        });
        expect(await shared()).toHaveLength(0);
    });

    it("never lists an artifact the caller already reaches as a member", async () => {
        const [u] = await db
            .select({ email: schema.users.email })
            .from(schema.users)
            .where(eq(schema.users.id, cast.member));
        await invite(cast.host.userId, u!.email, "edit");
        const body = (await (await authed(cast.member, "/shared-with-me")).json()) as {
            artifacts: { id: string }[];
        };
        expect(body.artifacts).toHaveLength(0);
    });

    it("drops a trashed artifact from the list", async () => {
        await invite(cast.host.userId, cast.guest.email, "edit");
        await authed(cast.host.userId, `/artifacts/${artifactId}/trash`, jsonInit("POST", {}));
        const body = (await (await authed(cast.guest.userId, "/shared-with-me")).json()) as {
            artifacts: { id: string }[];
        };
        expect(body.artifacts).toHaveLength(0);
    });
});

// The library, search, and shared-with-me are three readers of one question. A grant that opens an
// artifact by URL but leaves it out of every list is an artifact only a link-holder can find.
describe("a grant always puts the artifact on a list", () => {
    const memberEmail = async (): Promise<string> => {
        const [u] = await db
            .select({ email: schema.users.email })
            .from(schema.users)
            .where(eq(schema.users.id, cast.member));
        return u!.email;
    };
    const library = async (userId: string): Promise<string[]> => {
        const body = (await (await authed(userId, "/artifacts")).json()) as {
            artifacts: { id: string }[];
        };
        return body.artifacts.map((a) => a.id);
    };
    const found = async (userId: string): Promise<string[]> => {
        const body = (await (await authed(userId, "/search?q=Quarterly")).json()) as {
            artifacts: { id: string }[];
        };
        return body.artifacts.map((a) => a.id);
    };
    const shared = async (userId: string): Promise<string[]> => {
        const body = (await (await authed(userId, "/shared-with-me")).json()) as {
            artifacts: { id: string }[];
        };
        return body.artifacts.map((a) => a.id);
    };

    it("keeps a locked artifact in the member's library and search once they hold a grant", async () => {
        await setAccess(artifactId, "none");
        expect(await library(cast.member)).not.toContain(artifactId);
        expect(await found(cast.member)).not.toContain(artifactId);

        await invite(cast.host.userId, await memberEmail(), "comment");
        expect(await library(cast.member)).toContain(artifactId);
        expect(await found(cast.member)).toContain(artifactId);
    });

    it("does the same when the workspace default is what locked it", async () => {
        await db
            .update(schema.workspaces)
            .set({ defaultArtifactAccess: "none" })
            .where(eq(schema.workspaces.id, cast.host.workspaceId));
        expect(await library(cast.member)).not.toContain(artifactId);
        await invite(cast.host.userId, await memberEmail(), "view");
        expect(await library(cast.member)).toContain(artifactId);
        expect(await found(cast.member)).toContain(artifactId);
    });

    it("lands a reachable artifact in exactly one of library and shared-with-me", async () => {
        await setAccess(artifactId, "none");
        await invite(cast.host.userId, await memberEmail(), "edit");
        await invite(cast.host.userId, cast.guest.email, "edit");

        // the member of the owning workspace reads it from their own library
        expect(await library(cast.member)).toContain(artifactId);
        expect(await shared(cast.member)).not.toContain(artifactId);
        // the outsider reads it from shared-with-me, and has no library of their own holding it
        expect(await library(cast.guest.userId)).not.toContain(artifactId);
        expect(await shared(cast.guest.userId)).toContain(artifactId);
    });
});

// A workspace policy the client cannot read is a policy the client has to guess at, and the guess
// that would hurt is the restrictive one, so the response carries it explicitly.
describe("the workspace response carries its access policy", () => {
    it("names the default the resolver falls back to", async () => {
        const body = (await (await authed(cast.host.userId, "/workspace")).json()) as {
            workspace: { defaultArtifactAccess: string; publishPolicy: string };
        };
        expect(body.workspace.defaultArtifactAccess).toBe("edit");
        expect(body.workspace.publishPolicy).toBe("members");
    });

    it("keeps a plain member's own library non-empty under that default", async () => {
        const body = (await (await authed(cast.member, "/artifacts")).json()) as {
            artifacts: { id: string; access: string }[];
        };
        expect(body.artifacts.map((a) => a.id)).toContain(artifactId);
        expect(body.artifacts.find((a) => a.id === artifactId)?.access).toBe("edit");
    });
});

describe("grants follow the artifact", () => {
    it("cascades away when the artifact is deleted", async () => {
        await invite(cast.host.userId, cast.guest.email, "edit");
        await authed(cast.host.userId, `/artifacts/${artifactId}`, { method: "DELETE" });
        const rows = await db
            .select({ id: schema.artifactGrants.id })
            .from(schema.artifactGrants)
            .where(eq(schema.artifactGrants.artifactId, artifactId));
        expect(rows).toHaveLength(0);
    });
});
