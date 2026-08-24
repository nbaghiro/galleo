import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { monthlyGrantFor } from "@model/billing";
import { db } from "@services/db/client";
import { schema } from "@services/db/schema";
import { createAuthToken, createVerifyCode } from "@services/core/accounts";
import { DEV_CONFIRM_CODE } from "@model/workspace";
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
const confirm = (userId: string, code: string): Promise<Response> =>
    authed(userId, "/auth/confirm", limited(jsonInit("POST", { code })));

const tokenRows = (userId: string) =>
    db.select().from(schema.authTokens).where(eq(schema.authTokens.userId, userId));

const userRow = async (id: string) => {
    const [u] = await db.select().from(schema.users).where(eq(schema.users.id, id));
    return u!;
};

// seedUser lands verified, which is right for every other suite; the confirm route is the one place
// that needs an account still waiting.
const unverified = async (): Promise<{ userId: string }> => {
    const { userId } = await seedUser();
    await db
        .update(schema.users)
        .set({ emailVerifiedAt: null, createdAt: new Date() })
        .where(eq(schema.users.id, userId));
    return { userId };
};

describe("POST /auth/signup", () => {
    it("provisions the account, its workspace, and an owner seat with a funded credit window", async () => {
        const res = await signup({
            email: " Ada@Example.com ",
            password: "pw-12345678",
            name: "Ada",
        });
        expect(res.status).toBe(200);
        // A session, but a gated one: it exists so the app can open on the onboarding surface, and
        // requireUser/requireWorkspace refuse it until the address is confirmed.
        const body = (await res.json()) as { user: { email: string }; sent: boolean };
        expect(body.user.email).toBe("ada@example.com");
        expect(res.headers.get("set-cookie")).toContain("galleo_session=");

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

    it("mints a confirmation code even though mail is unconfigured", async () => {
        await signup({ email: "verify-me@example.com", password: "pw-12345678" });
        const [user] = await db
            .select()
            .from(schema.users)
            .where(eq(schema.users.email, "verify-me@example.com"));
        const tokens = await tokenRows(user!.id);
        expect(tokens).toHaveLength(1);
        expect(tokens[0]!.purpose).toBe("verify");
        expect(tokens[0]!.consumedAt).toBeNull();
        // 15m ttl, short because the code is typed in the tab that is already open
        expect(tokens[0]!.expiresAt.getTime()).toBeGreaterThan(Date.now() + 13 * 60 * 1000);
        expect(tokens[0]!.expiresAt.getTime()).toBeLessThan(Date.now() + 16 * 60 * 1000);
        // the code itself is never stored, only a hash salted with the account it belongs to
        expect(tokens[0]!.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    });

    // The code is typed into a session, so refusing sign-in to an unconfirmed account would be a dead
    // end: no session, and no other way to make one. The gate holds it after the door instead.
    it("signs an unconfirmed account in, and the session it gets still reaches nothing", async () => {
        const email = "gated@example.com";
        await signup({ email, password: "pw-12345678" });

        const res = await login({ email, password: "pw-12345678" });
        expect(res.status).toBe(200);
        const cookie = (res.headers.get("set-cookie") ?? "").split(";")[0]!;
        expect(cookie).toContain("galleo_session=");

        const guarded = await request("/artifacts", { headers: { Cookie: cookie } });
        expect(guarded.status).toBe(403);
        expect(((await guarded.json()) as { needsVerification?: boolean }).needsVerification).toBe(
            true,
        );
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

    // The session signup hands out reaches nothing until the address is confirmed. This is the whole
    // security of the gate: without it, an unconfirmed account would simply be a normal account.
    it("hands out a session that every guarded route refuses", async () => {
        const email = "gated-session@example.com";
        const res = await signup({ email, password: "pw-12345678" });
        const cookie = (res.headers.get("set-cookie") ?? "").split(";")[0]!;

        for (const path of ["/artifacts", "/themes", "/folders"]) {
            const r = await request(path, { headers: { Cookie: cookie } });
            expect(r.status, `${path} must refuse an unconfirmed session`).toBe(403);
            expect(((await r.json()) as { needsVerification?: boolean }).needsVerification).toBe(
                true,
            );
        }

        // but it can read itself and ask for another mail, which is all the confirm step needs
        expect((await request("/me", { headers: { Cookie: cookie } })).status).toBe(200);
        const again = await request(
            "/auth/resend-verification",
            limited({ method: "POST", headers: { Cookie: cookie } }),
        );
        expect(again.status).toBe(200);
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

    it("refuses a token minted for the other purpose", async () => {
        const { userId } = await seedUser();
        const verifyToken = await createAuthToken(userId, "verify", 3600);
        expect((await reset({ token: verifyToken, password: "fresh-password-9" })).status).toBe(
            400,
        );

        // The other direction has no test because it has no path: a confirmation code is six digits,
        // so a reset token is refused on shape before the purpose column is ever read.
    });

    it("400s when the token or password is missing", async () => {
        expect((await reset({ password: "fresh-password-9" })).status).toBe(400);
        expect((await reset({ token: "whatever" })).status).toBe(400);
    });
});

describe("POST /auth/confirm", () => {
    it("401s without a session", async () => {
        const res = await request("/auth/confirm", limited(jsonInit("POST", { code: "123456" })));
        expect(res.status).toBe(401);
    });

    it("confirms the address, and the same code cannot be spent twice", async () => {
        const { userId } = await unverified();
        const code = await createVerifyCode(userId);

        const res = await confirm(userId, code);
        expect(res.status).toBe(200);
        expect(((await res.json()) as AuthBody).user.emailVerified).toBe(true);
        expect((await userRow(userId)).emailVerifiedAt).not.toBeNull();

        // already verified, so the route answers with the user rather than spending anything
        const replay = await confirm(userId, code);
        expect(replay.status).toBe(200);
    });

    it("opens the routes the gate was refusing", async () => {
        const { userId } = await unverified();
        expect((await authed(userId, "/artifacts")).status).toBe(403);
        await confirm(userId, await createVerifyCode(userId));
        expect((await authed(userId, "/artifacts")).status).toBe(200);
    });

    it("400s a wrong code, an expired one, and one minted for another account", async () => {
        const { userId } = await unverified();
        const code = await createVerifyCode(userId);
        const wrong = String((Number(code) + 1) % 1_000_000).padStart(6, "0");
        expect((await confirm(userId, wrong)).status).toBe(400);

        const other = await unverified();
        expect((await confirm(other.userId, code)).status).toBe(400);

        await db
            .update(schema.authTokens)
            .set({ expiresAt: new Date(Date.now() - 1000) })
            .where(eq(schema.authTokens.userId, userId));
        expect((await confirm(userId, code)).status).toBe(400);
    });

    it("400s a code that is not six digits, without touching the row", async () => {
        const { userId } = await unverified();
        const code = await createVerifyCode(userId);
        for (const bad of ["", "12345", "1234567", "abcdef"])
            expect((await confirm(userId, bad)).status).toBe(400);
        expect((await confirm(userId, code)).status).toBe(200);
    });

    // "send it again" must not leave the earlier codes working, or the guess budget multiplies
    it("supersedes the previous code when a new one is issued", async () => {
        const { userId } = await unverified();
        const first = await createVerifyCode(userId);
        const second = await createVerifyCode(userId);
        expect(second).not.toBe(first);
        expect((await confirm(userId, first)).status).toBe(400);
        expect((await confirm(userId, second)).status).toBe(200);
    });

    // The bypass and, more to the point, its off switch. NODE_ENV is what Render sets, so this is the
    // assertion that stands between a convenience and 123456 confirming every account in production.
    it("takes the dev code, and refuses it once NODE_ENV says production", async () => {
        const dev = await unverified();
        expect((await confirm(dev.userId, DEV_CONFIRM_CODE)).status).toBe(200);
        expect((await userRow(dev.userId)).emailVerifiedAt).not.toBeNull();

        const prod = await unverified();
        const was = process.env.NODE_ENV;
        process.env.NODE_ENV = "production";
        try {
            expect((await confirm(prod.userId, DEV_CONFIRM_CODE)).status).toBe(400);
            expect((await userRow(prod.userId)).emailVerifiedAt).toBeNull();
        } finally {
            if (was === undefined) delete process.env.NODE_ENV;
            else process.env.NODE_ENV = was;
        }
        // and it is a bypass, not a skeleton key: the real code still works
        expect((await confirm(prod.userId, await createVerifyCode(prod.userId))).status).toBe(200);
    });

    // it must not leave the codes it skipped past still standing
    it("supersedes a live code when the dev code is used", async () => {
        const { userId } = await unverified();
        const real = await createVerifyCode(userId);
        expect((await confirm(userId, DEV_CONFIRM_CODE)).status).toBe(200);
        const rows = await tokenRows(userId);
        expect(rows.every((r) => r.consumedAt !== null)).toBe(true);
        expect(real).not.toBe(DEV_CONFIRM_CODE);
    });

    // 6 digits is only defensible with a ceiling on guesses
    it("stops guessing after the attempt limit", async () => {
        const { userId } = await unverified();
        await createVerifyCode(userId);
        const ip = freshIp();
        const guess = (): Promise<Response> =>
            authed(userId, "/auth/confirm", asIp(ip, jsonInit("POST", { code: "000000" })));
        const codes: number[] = [];
        for (let i = 0; i < 10; i++) codes.push((await guess()).status);
        expect(codes.filter((s) => s === 429).length).toBeGreaterThan(0);
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
