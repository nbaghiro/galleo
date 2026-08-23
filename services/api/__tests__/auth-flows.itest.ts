import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { monthlyGrantFor } from "@model/billing";
import { db } from "@services/db/client";
import { schema } from "@services/db/schema";
import { createAuthToken } from "@services/core/accounts";
import { appUrl } from "@services/utils/env";
import { authed, jsonInit, request, seedUser } from "@services/__tests__/harness";

interface AuthUser {
    id: string;
    email: string;
    name: string | null;
    hasPassword: boolean;
    emailVerified: boolean;
}
interface AuthBody {
    user: AuthUser;
}
interface ErrorBody {
    error: string;
}

// The auth routes share per-IP fixed-window limiters, so every request takes a fresh client IP via
// the trusted header — except the limiter test itself, which pins one.
let ipN = 0;
const freshIp = (): string => {
    ipN += 1;
    return `10.77.${Math.floor(ipN / 200)}.${(ipN % 200) + 1}`;
};
const asIp = (ip: string, init: RequestInit): RequestInit => {
    const headers = new Headers(init.headers);
    headers.set("cf-connecting-ip", ip);
    return { ...init, headers };
};
const limited = (init: RequestInit): RequestInit => asIp(freshIp(), init);

const signup = (body: unknown): Promise<Response> =>
    request("/auth/signup", limited(jsonInit("POST", body)));
const login = (body: unknown): Promise<Response> =>
    request("/auth/login", limited(jsonInit("POST", body)));
const reset = (body: unknown): Promise<Response> =>
    request("/auth/reset", limited(jsonInit("POST", body)));

const tokenRows = (userId: string) =>
    db.select().from(schema.authTokens).where(eq(schema.authTokens.userId, userId));

const userRow = async (id: string) => {
    const [u] = await db.select().from(schema.users).where(eq(schema.users.id, id));
    return u!;
};

describe("POST /auth/signup", () => {
    it("provisions the account, its workspace, and an owner seat with a funded credit window", async () => {
        const res = await signup({
            email: " Ada@Example.com ",
            password: "pw-12345678",
            name: "Ada",
        });
        expect(res.status).toBe(200);
        // No session until the address is confirmed: the account exists, nothing is reachable yet.
        const pending = (await res.json()) as { pending: boolean; email: string };
        expect(pending.pending).toBe(true);
        expect(pending.email).toBe("ada@example.com");
        expect(res.headers.get("set-cookie") ?? "").not.toContain("galleo_session=");

        const [user] = await db
            .select()
            .from(schema.users)
            .where(eq(schema.users.email, "ada@example.com"));
        expect(user!.passwordHash).not.toBeNull();
        expect(user!.emailVerifiedAt).toBeNull();

        const [member] = await db
            .select()
            .from(schema.members)
            .where(eq(schema.members.userId, user!.id));
        expect(member!.role).toBe("owner");
        const [ws] = await db
            .select()
            .from(schema.workspaces)
            .where(eq(schema.workspaces.id, member!.workspaceId));
        expect(ws!.name).toBe("Ada's Workspace");
        expect(ws!.plan).toBe("free");
        expect(ws!.ownerId).toBe(user!.id);
        expect(ws!.slug.startsWith("ada-")).toBe(true);
        // born funded and unlapsed, not waiting for a first roll
        expect(ws!.aiCreditsBalance).toBe(monthlyGrantFor({ plan: "free", seats: 1 }));
        expect(ws!.creditsResetAt.getTime()).toBeGreaterThan(Date.now());
    });

    it("mints a verification token even though mail is unconfigured", async () => {
        await signup({ email: "verify-me@example.com", password: "pw-12345678" });
        const [user] = await db
            .select()
            .from(schema.users)
            .where(eq(schema.users.email, "verify-me@example.com"));
        const tokens = await tokenRows(user!.id);
        expect(tokens).toHaveLength(1);
        expect(tokens[0]!.purpose).toBe("verify");
        expect(tokens[0]!.consumedAt).toBeNull();
        // 24h ttl, and only the hash is stored (sha-256 hex, never the raw link token)
        expect(tokens[0]!.expiresAt.getTime()).toBeGreaterThan(Date.now() + 23 * 60 * 60 * 1000);
        expect(tokens[0]!.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    });

    it("refuses a sign-in until the address is confirmed, then allows it", async () => {
        const email = "gated@example.com";
        await signup({ email, password: "pw-12345678" });

        const blocked = await login({ email, password: "pw-12345678" });
        expect(blocked.status).toBe(403);
        const body = (await blocked.json()) as { needsVerification?: boolean };
        expect(body.needsVerification).toBe(true);
        expect(blocked.headers.get("set-cookie") ?? "").not.toContain("galleo_session=");

        const [u] = await db.select().from(schema.users).where(eq(schema.users.email, email));
        await db
            .update(schema.users)
            .set({ emailVerifiedAt: new Date() })
            .where(eq(schema.users.id, u!.id));

        const ok = await login({ email, password: "pw-12345678" });
        expect(ok.status).toBe(200);
        expect(ok.headers.get("set-cookie")).toContain("galleo_session=");
    });

    // The gate applies from its own date forward, so accounts opened before it keep their access.
    it("lets an account created before the gate sign in unverified", async () => {
        const email = "grandfathered@example.com";
        await signup({ email, password: "pw-12345678" });
        await db
            .update(schema.users)
            .set({ createdAt: new Date("2026-08-01T00:00:00Z") })
            .where(eq(schema.users.email, email));

        const res = await login({ email, password: "pw-12345678" });
        expect(res.status).toBe(200);
        expect(res.headers.get("set-cookie")).toContain("galleo_session=");
    });

    it("rejects a missing password, a malformed email, and a short password", async () => {
        const missing = await signup({ email: "a@b.co" });
        expect(missing.status).toBe(400);

        const malformed = await signup({ email: "not-an-email", password: "pw-12345678" });
        expect(malformed.status).toBe(400);
        expect(((await malformed.json()) as ErrorBody).error).toContain("valid email");

        const short = await signup({ email: "a@b.co", password: "seven77" });
        expect(short.status).toBe(400);
        expect(((await short.json()) as ErrorBody).error).toContain("at least 8");
    });

    it("409s a duplicate email regardless of case", async () => {
        const { email } = await seedUser();
        const res = await signup({ email: ` ${email.toUpperCase()} `, password: "pw-12345678" });
        expect(res.status).toBe(409);
        expect(((await res.json()) as ErrorBody).error).toContain("already exists");
    });
});

describe("POST /auth/login hardening", () => {
    it("rejects an over-cap password with the same 401 as a wrong one", async () => {
        const { email } = await seedUser();
        const res = await login({ email, password: "x".repeat(201) });
        expect(res.status).toBe(401);
        expect((await res.json()) as ErrorBody).toEqual({ error: "invalid email or password" });
    });

    it("answers for an OAuth-only account exactly as for a wrong password", async () => {
        const { userId, email } = await seedUser();
        await db
            .update(schema.users)
            .set({ passwordHash: null })
            .where(eq(schema.users.id, userId));
        const res = await login({ email, password: "pw-12345678" });
        expect(res.status).toBe(401);
        expect((await res.json()) as ErrorBody).toEqual({ error: "invalid email or password" });
    });
});

describe("POST /auth/forgot", () => {
    it("answers ok for an unknown email and mints nothing", async () => {
        const res = await request(
            "/auth/forgot",
            limited(jsonInit("POST", { email: "nobody@example.com" })),
        );
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ ok: true });
        expect(await db.select().from(schema.authTokens)).toHaveLength(0);
    });

    it("mints one hashed reset token for a known email, same ok either way", async () => {
        const { userId, email } = await seedUser();
        const res = await request("/auth/forgot", limited(jsonInit("POST", { email })));
        expect(await res.json()).toEqual({ ok: true });
        const tokens = await tokenRows(userId);
        expect(tokens).toHaveLength(1);
        expect(tokens[0]!.purpose).toBe("reset");
        expect(tokens[0]!.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    });
});

describe("POST /auth/reset", () => {
    it("rotates the password, confirms the email, signs in, and consumes the token", async () => {
        const { userId, email, password } = await seedUser();
        const raw = await createAuthToken(userId, "reset", 3600);

        const res = await reset({ token: raw, password: "fresh-password-9" });
        expect(res.status).toBe(200);
        const { user } = (await res.json()) as AuthBody;
        expect(user.emailVerified).toBe(true);
        expect(res.headers.get("set-cookie")).toContain("galleo_session=");

        expect((await login({ email, password })).status).toBe(401);
        expect((await login({ email, password: "fresh-password-9" })).status).toBe(200);

        const u = await userRow(userId);
        expect(u.passwordChangedAt).not.toBeNull();
        const [token] = await tokenRows(userId);
        expect(token!.consumedAt).not.toBeNull();
    });

    it("is single-use: a replay of the same token 400s", async () => {
        const { userId } = await seedUser();
        const raw = await createAuthToken(userId, "reset", 3600);
        await reset({ token: raw, password: "fresh-password-9" });
        const replay = await reset({ token: raw, password: "other-password-9" });
        expect(replay.status).toBe(400);
        expect(((await replay.json()) as ErrorBody).error).toContain("invalid or has expired");
    });

    it("validates the new password before burning the token", async () => {
        const { userId } = await seedUser();
        const raw = await createAuthToken(userId, "reset", 3600);
        const short = await reset({ token: raw, password: "seven77" });
        expect(short.status).toBe(400);
        // the early 400 must not have consumed it
        expect((await reset({ token: raw, password: "fresh-password-9" })).status).toBe(200);
    });

    it("400s an expired token", async () => {
        const { userId } = await seedUser();
        const raw = await createAuthToken(userId, "reset", 0);
        expect((await reset({ token: raw, password: "fresh-password-9" })).status).toBe(400);
    });

    it("refuses a token minted for the other purpose, in both directions", async () => {
        const { userId } = await seedUser();
        const verifyToken = await createAuthToken(userId, "verify", 3600);
        expect((await reset({ token: verifyToken, password: "fresh-password-9" })).status).toBe(
            400,
        );

        const resetToken = await createAuthToken(userId, "reset", 3600);
        const res = await request(`/auth/verify?token=${resetToken}`);
        expect(res.headers.get("location")).toBe(appUrl("/login?authError=verify_invalid"));
    });

    it("400s when the token or password is missing", async () => {
        expect((await reset({ password: "fresh-password-9" })).status).toBe(400);
        expect((await reset({ token: "whatever" })).status).toBe(400);
    });
});

describe("GET /auth/verify", () => {
    it("confirms the email, redirects to the app, and cannot be replayed", async () => {
        const { userId } = await seedUser();
        const raw = await createAuthToken(userId, "verify", 3600);

        const res = await request(`/auth/verify?token=${raw}`);
        expect(res.status).toBe(302);
        expect(res.headers.get("location")).toBe(appUrl("/login?verified=1"));
        expect((await userRow(userId)).emailVerifiedAt).not.toBeNull();

        const replay = await request(`/auth/verify?token=${raw}`);
        expect(replay.headers.get("location")).toBe(appUrl("/login?authError=verify_invalid"));
    });

    it("redirects to the error destination when the token is absent", async () => {
        const res = await request("/auth/verify");
        expect(res.headers.get("location")).toBe(appUrl("/login?authError=verify_invalid"));
    });
});

describe("POST /auth/resend-verification", () => {
    it("401s without a session", async () => {
        const res = await request("/auth/resend-verification", limited({ method: "POST" }));
        expect(res.status).toBe(401);
    });

    it("mints a fresh verify token for an unverified user, none for a verified one", async () => {
        const unverified = await seedUser();
        // seedUser lands verified; this case is specifically about the unverified state
        await db
            .update(schema.users)
            .set({ emailVerifiedAt: null })
            .where(eq(schema.users.id, unverified.userId));
        const res = await authed(
            unverified.userId,
            "/auth/resend-verification",
            limited({ method: "POST" }),
        );
        expect(await res.json()).toEqual({ ok: true });
        expect(await tokenRows(unverified.userId)).toHaveLength(1);

        const verified = await seedUser();
        await db
            .update(schema.users)
            .set({ emailVerifiedAt: new Date() })
            .where(eq(schema.users.id, verified.userId));
        const noop = await authed(
            verified.userId,
            "/auth/resend-verification",
            limited({ method: "POST" }),
        );
        expect(await noop.json()).toEqual({ ok: true });
        expect(await tokenRows(verified.userId)).toHaveLength(0);
    });
});

describe("session invalidation", () => {
    it("rejects a session minted before passwordChangedAt", async () => {
        const { userId } = await seedUser();
        expect((await authed(userId, "/me")).status).toBe(200);
        await db
            .update(schema.users)
            .set({ passwordChangedAt: new Date(Date.now() + 5000) })
            .where(eq(schema.users.id, userId));
        expect((await authed(userId, "/me")).status).toBe(401);
    });
});

// last in the file: the login limiter's window outlives the other cases
describe("login rate limit", () => {
    it("429s the 11th attempt from one IP and leaves other IPs untouched", async () => {
        const { email } = await seedUser();
        const attacker = freshIp();
        let last: Response | null = null;
        for (let i = 0; i < 11; i++) {
            last = await request(
                "/auth/login",
                asIp(attacker, jsonInit("POST", { email, password: "wrong-password" })),
            );
        }
        expect(last!.status).toBe(429);
        expect(last!.headers.get("retry-after")).toMatch(/^\d+$/);
        expect(((await last!.json()) as ErrorBody).error).toContain("Too many attempts");

        const other = await login({ email, password: "wrong-password" });
        expect(other.status).toBe(401);
    });
});
