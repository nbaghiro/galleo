import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@services/db/client";
import { schema } from "@services/db/schema";
import { SESSION_COOKIE } from "@services/utils/auth";
import { authed, jsonInit, request, seedUser } from "@services/__tests__/harness";

interface UserBody {
    user: {
        id: string;
        email: string;
        name: string | null;
        hasPassword: boolean;
        emailVerified: boolean;
        prefs: Record<string, unknown>;
    };
}

const link = (userId: string, provider = "google", providerAccountId = "sub-1") =>
    db.insert(schema.oauthAccounts).values({ userId, provider, providerAccountId });

const clearPassword = (userId: string) =>
    db.update(schema.users).set({ passwordHash: null }).where(eq(schema.users.id, userId));

describe("GET /me", () => {
    it("carries hasPassword and prefs alongside the profile", async () => {
        const { userId, email } = await seedUser();
        const res = await authed(userId, "/me");
        expect(res.status).toBe(200);
        const { user } = (await res.json()) as UserBody;
        expect(user.email).toBe(email);
        expect(user.hasPassword).toBe(true);
        expect(user.prefs).toEqual({});
    });

    it("reports hasPassword false for an OAuth-only account", async () => {
        const { userId } = await seedUser();
        await clearPassword(userId);
        const { user } = (await (await authed(userId, "/me")).json()) as UserBody;
        expect(user.hasPassword).toBe(false);
    });

    it("401s without a session", async () => {
        expect((await request("/me")).status).toBe(401);
    });
});

describe("PATCH /me", () => {
    it("renames the account and answers with the updated user", async () => {
        const { userId } = await seedUser();
        const res = await authed(userId, "/me", jsonInit("PATCH", { name: "  Ada Lovelace  " }));
        expect(res.status).toBe(200);
        expect(((await res.json()) as UserBody).user.name).toBe("Ada Lovelace");
        const { user } = (await (await authed(userId, "/me")).json()) as UserBody;
        expect(user.name).toBe("Ada Lovelace");
    });

    it("caps an overlong name at 80 characters", async () => {
        const { userId } = await seedUser();
        const res = await authed(userId, "/me", jsonInit("PATCH", { name: "n".repeat(200) }));
        expect(((await res.json()) as UserBody).user.name).toHaveLength(80);
    });

    it("clears the name when it is emptied", async () => {
        const { userId } = await seedUser();
        await authed(userId, "/me", jsonInit("PATCH", { name: "Temp" }));
        const res = await authed(userId, "/me", jsonInit("PATCH", { name: "   " }));
        expect(((await res.json()) as UserBody).user.name).toBeNull();
    });

    it("400s when the body carries nothing to update", async () => {
        const { userId } = await seedUser();
        expect((await authed(userId, "/me", jsonInit("PATCH", {}))).status).toBe(400);
    });

    it("401s without a session", async () => {
        expect((await request("/me", jsonInit("PATCH", { name: "x" }))).status).toBe(401);
    });
});

describe("POST /me/password", () => {
    it("changes the password when the current one matches, and the new one then logs in", async () => {
        const { userId, email, password } = await seedUser();
        const res = await authed(
            userId,
            "/me/password",
            jsonInit("POST", { current: password, password: "new-password-1" }),
        );
        expect(res.status).toBe(200);

        const login = await request(
            "/auth/login",
            jsonInit("POST", { email, password: "new-password-1" }),
        );
        expect(login.status).toBe(200);
        const stale = await request("/auth/login", jsonInit("POST", { email, password }));
        expect(stale.status).toBe(401);
    });

    it("reissues the caller's cookie, so the change does not sign them out", async () => {
        const { userId, password } = await seedUser();
        const res = await authed(
            userId,
            "/me/password",
            jsonInit("POST", { current: password, password: "another-password" }),
        );
        expect(res.headers.get("set-cookie")).toContain(SESSION_COOKIE);
    });

    it("stamps passwordChangedAt, which is what revokes sessions minted earlier", async () => {
        const { userId, password } = await seedUser();
        const [before] = await db
            .select({ at: schema.users.passwordChangedAt })
            .from(schema.users)
            .where(eq(schema.users.id, userId));
        expect(before?.at).toBeNull();

        const sentAt = Date.now();
        await authed(
            userId,
            "/me/password",
            jsonInit("POST", { current: password, password: "rotated-password" }),
        );
        const [after] = await db
            .select({ at: schema.users.passwordChangedAt })
            .from(schema.users)
            .where(eq(schema.users.id, userId));
        expect(after?.at).not.toBeNull();
        expect(after!.at!.getTime()).toBeGreaterThanOrEqual(sentAt - 1000);
    });

    it("403s on a wrong current password and leaves the old one working", async () => {
        const { userId, email, password } = await seedUser();
        const res = await authed(
            userId,
            "/me/password",
            jsonInit("POST", { current: "not-it", password: "new-password-1" }),
        );
        expect(res.status).toBe(403);
        expect((await request("/auth/login", jsonInit("POST", { email, password }))).status).toBe(
            200,
        );
    });

    it("400s when the current password is missing on an account that has one", async () => {
        const { userId } = await seedUser();
        const res = await authed(
            userId,
            "/me/password",
            jsonInit("POST", { password: "new-password-1" }),
        );
        expect(res.status).toBe(400);
    });

    it("sets a first password on an OAuth-only account with no current one", async () => {
        const { userId, email } = await seedUser();
        await clearPassword(userId);
        const res = await authed(
            userId,
            "/me/password",
            jsonInit("POST", { password: "first-password" }),
        );
        expect(res.status).toBe(200);
        expect(((await res.json()) as UserBody).user.hasPassword).toBe(true);
        expect(
            (await request("/auth/login", jsonInit("POST", { email, password: "first-password" })))
                .status,
        ).toBe(200);
    });

    it("400s a password under the minimum length", async () => {
        const { userId, password } = await seedUser();
        const res = await authed(
            userId,
            "/me/password",
            jsonInit("POST", { current: password, password: "short" }),
        );
        expect(res.status).toBe(400);
    });

    it("403s an over-cap current password without hashing it", async () => {
        const { userId } = await seedUser();
        const res = await authed(
            userId,
            "/me/password",
            jsonInit("POST", { current: "x".repeat(500), password: "new-password-1" }),
        );
        expect(res.status).toBe(403);
    });

    it("401s without a session", async () => {
        const res = await request("/me/password", jsonInit("POST", { password: "new-password-1" }));
        expect(res.status).toBe(401);
    });
});

describe("/me/connections", () => {
    it("lists linked providers, newest link last", async () => {
        const { userId } = await seedUser();
        await link(userId);
        const res = await authed(userId, "/me/connections");
        expect(res.status).toBe(200);
        const { connections } = (await res.json()) as {
            connections: { provider: string; linkedAt: string }[];
        };
        expect(connections).toHaveLength(1);
        expect(connections[0]?.provider).toBe("google");
    });

    it("is empty for an account that never linked one", async () => {
        const { userId } = await seedUser();
        const { connections } = (await (await authed(userId, "/me/connections")).json()) as {
            connections: unknown[];
        };
        expect(connections).toEqual([]);
    });

    it("unlinks a provider while a password remains", async () => {
        const { userId } = await seedUser();
        await link(userId);
        const res = await authed(userId, "/me/connections/google", { method: "DELETE" });
        expect(res.status).toBe(200);
        const { connections } = (await (await authed(userId, "/me/connections")).json()) as {
            connections: unknown[];
        };
        expect(connections).toEqual([]);
    });

    it("409s on the last credential, so the account can't lock itself out", async () => {
        const { userId } = await seedUser();
        await clearPassword(userId);
        await link(userId);
        const res = await authed(userId, "/me/connections/google", { method: "DELETE" });
        expect(res.status).toBe(409);
        const { connections } = (await (await authed(userId, "/me/connections")).json()) as {
            connections: unknown[];
        };
        expect(connections).toHaveLength(1);
    });

    it("unlinks with no password when a second provider remains", async () => {
        const { userId } = await seedUser();
        await clearPassword(userId);
        await link(userId, "google", "sub-a");
        await link(userId, "github", "sub-b");
        expect((await authed(userId, "/me/connections/google", { method: "DELETE" })).status).toBe(
            200,
        );
    });

    it("404s an unlink for a provider that was never linked", async () => {
        const { userId } = await seedUser();
        expect((await authed(userId, "/me/connections/google", { method: "DELETE" })).status).toBe(
            404,
        );
    });
});

describe("PATCH /me/prefs", () => {
    it("stores the app theme and returns it on the next read", async () => {
        const { userId } = await seedUser();
        const res = await authed(userId, "/me/prefs", jsonInit("PATCH", { appTheme: "midnight" }));
        expect(res.status).toBe(200);
        expect(((await res.json()) as UserBody).user.prefs).toEqual({ appTheme: "midnight" });
        const { user } = (await (await authed(userId, "/me")).json()) as UserBody;
        expect(user.prefs).toEqual({ appTheme: "midnight" });
    });

    it("merges a patch instead of replacing the whole object", async () => {
        const { userId } = await seedUser();
        await authed(userId, "/me/prefs", jsonInit("PATCH", { appTheme: "midnight" }));
        const res = await authed(userId, "/me/prefs", jsonInit("PATCH", {}));
        expect(((await res.json()) as UserBody).user.prefs).toEqual({ appTheme: "midnight" });
    });

    it("clears a preference on an explicit null", async () => {
        const { userId } = await seedUser();
        await authed(userId, "/me/prefs", jsonInit("PATCH", { appTheme: "midnight" }));
        const res = await authed(userId, "/me/prefs", jsonInit("PATCH", { appTheme: null }));
        expect(((await res.json()) as UserBody).user.prefs).toEqual({});
    });

    it("drops unknown keys and wrong types rather than storing them", async () => {
        const { userId } = await seedUser();
        const res = await authed(
            userId,
            "/me/prefs",
            jsonInit("PATCH", { appTheme: 42, sneaky: "value" }),
        );
        expect(((await res.json()) as UserBody).user.prefs).toEqual({});
    });

    it("401s without a session", async () => {
        const res = await request("/me/prefs", jsonInit("PATCH", { appTheme: "midnight" }));
        expect(res.status).toBe(401);
    });
});

describe("GET /me/workspaces", () => {
    it("lists every membership with the caller's role in each", async () => {
        const owner = await seedUser();
        const guest = await seedUser();
        await db
            .insert(schema.members)
            .values({ workspaceId: owner.workspaceId, userId: guest.userId, role: "admin" });

        const { memberships } = (await (await authed(guest.userId, "/me/workspaces")).json()) as {
            memberships: { id: string; name: string; role: string }[];
        };
        expect(memberships).toHaveLength(2);
        expect(memberships.find((m) => m.id === guest.workspaceId)?.role).toBe("owner");
        expect(memberships.find((m) => m.id === owner.workspaceId)?.role).toBe("admin");
    });

    it("401s without a session", async () => {
        expect((await request("/me/workspaces")).status).toBe(401);
    });
});

describe("POST /workspace/leave", () => {
    it("leaves a named workspace that is not the active one", async () => {
        const owner = await seedUser();
        const guest = await seedUser();
        await db
            .insert(schema.members)
            .values({ workspaceId: owner.workspaceId, userId: guest.userId, role: "member" });

        const res = await authed(
            guest.userId,
            "/workspace/leave",
            jsonInit("POST", { workspaceId: owner.workspaceId }),
        );
        expect(res.status).toBe(200);
        const { memberships } = (await (await authed(guest.userId, "/me/workspaces")).json()) as {
            memberships: { id: string }[];
        };
        expect(memberships.map((m) => m.id)).toEqual([guest.workspaceId]);
    });

    it("400s when the caller owns the workspace they name", async () => {
        const { userId, workspaceId } = await seedUser();
        const res = await authed(userId, "/workspace/leave", jsonInit("POST", { workspaceId }));
        expect(res.status).toBe(400);
    });

    it("403s a workspace the caller is not a member of", async () => {
        const stranger = await seedUser();
        const other = await seedUser();
        const res = await authed(
            stranger.userId,
            "/workspace/leave",
            jsonInit("POST", { workspaceId: other.workspaceId }),
        );
        expect(res.status).toBe(403);
    });
});
