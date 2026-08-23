import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import { z } from "zod";
import { appUrl, warn } from "@services/utils/env";
import {
    BAD_BODY,
    readJson,
    setSessionCookie,
    clearSessionCookie,
    rateLimit,
} from "@services/utils/http";
import { capture } from "@services/utils/analytics";
import { readSession, SESSION_COOKIE } from "@services/utils/auth";
import {
    authenticate,
    consumeAuthToken,
    emailTaken,
    isEmail,
    markEmailVerified,
    overPasswordCap,
    passwordError,
    resetPassword,
    sendResetEmail,
    sendVerifyEmail,
    signUp,
} from "@services/core/accounts";
import { releaseSignupGrant } from "@services/core/onboarding";
import { requireUser, type AuthedEnv } from "./middleware";

export const session = new Hono<AuthedEnv>();

// Per-IP guards: login is the password-guessing target, signup/forgot the account-spam targets.
const loginLimiter = rateLimit({ name: "login", limit: 10, windowMs: 5 * 60_000 });
const signupLimiter = rateLimit({ name: "signup", limit: 5, windowMs: 15 * 60_000 });
const forgotLimiter = rateLimit({ name: "forgot", limit: 5, windowMs: 15 * 60_000 });
const resetLimiter = rateLimit({ name: "reset", limit: 10, windowMs: 15 * 60_000 });
const resendLimiter = rateLimit({ name: "resend", limit: 5, windowMs: 15 * 60_000 });

// Fields stay optional so a well-formed body missing one still gets the route's own message; the
// schema is here to reject a body that is not an object, or a field that is not a string.
const zSignup = z.object({
    email: z.string().optional(),
    password: z.string().optional(),
    name: z.string().optional(),
});
const zLogin = z.object({ email: z.string().optional(), password: z.string().optional() });
const zForgot = z.object({ email: z.string().optional() });
const zReset = z.object({ token: z.string().optional(), password: z.string().optional() });

// Verification became a gate on 2026-08-22. Accounts opened before it keep the access they already
// had, so the rule applies going forward rather than reaching back and locking out people who signed
// up under the old contract. A date rather than a per-account flag: it needs no migration and it is
// self-documenting about when the rule changed.
const VERIFY_GATE_FROM = new Date("2026-08-22T00:00:00Z");

export const mustVerify = (u: { emailVerified: boolean; createdAt: Date | string }): boolean =>
    !u.emailVerified && new Date(u.createdAt) >= VERIFY_GATE_FROM;

session.post("/auth/signup", signupLimiter, async (c) => {
    const body = await readJson(c, zSignup);
    if (!body) return c.json(BAD_BODY, 400);
    const { email, password, name } = body;
    const cleanEmail = (email ?? "").trim().toLowerCase();
    if (!cleanEmail || !password) return c.json({ error: "email and password are required" }, 400);
    if (!isEmail(cleanEmail)) return c.json({ error: "enter a valid email address" }, 400);
    const pwErr = passwordError(password);
    if (pwErr) return c.json({ error: pwErr }, 400);
    if (await emailTaken(cleanEmail))
        return c.json({ error: "an account with this email already exists" }, 409);

    let user;
    try {
        user = await signUp(cleanEmail, password, name?.trim() || null);
    } catch {
        // unique(email) violation from a concurrent signup that raced past the check above
        return c.json({ error: "an account with this email already exists" }, 409);
    }
    // No session yet: the account exists, but nothing is reachable until the address is confirmed.
    // Never swallow the send, either: a verification mail that does not arrive is the difference
    // between an account someone can finish and one they cannot, and it was silent while it was broken.
    const sent = await sendVerifyEmail(user.id, user.email).catch((e: unknown) => {
        warn(
            `verify email failed for ${user.email}: ${e instanceof Error ? e.message : String(e)}`,
        );
        return false;
    });
    return c.json({ pending: true, email: user.email, sent: sent === true });
});

session.post("/auth/login", loginLimiter, async (c) => {
    const body = await readJson(c, zLogin);
    if (!body) return c.json(BAD_BODY, 400);
    const { email, password } = body;
    if (!email || !password) return c.json({ error: "email and password are required" }, 400);
    // cap before scrypt: an over-cap password can't match any stored hash, so reject without hashing
    if (overPasswordCap(password)) return c.json({ error: "invalid email or password" }, 401);
    const found = await authenticate(email, password);
    if (!found) return c.json({ error: "invalid email or password" }, 401);
    const user = found.user;
    if (mustVerify({ emailVerified: user.emailVerified, createdAt: found.createdAt }))
        return c.json(
            {
                error: "Confirm your email before signing in.",
                needsVerification: true,
                email: user.email,
            },
            403,
        );
    setSessionCookie(c, user.id);
    capture({ userId: user.id }, "logged_in", { method: "password" });
    return c.json({ user });
});

session.post("/auth/logout", (c) => {
    // Read before clearing: the route has no requireUser, and after the clear there is nobody to
    // attribute the event to.
    const userId = readSession(getCookie(c, SESSION_COOKIE));
    clearSessionCookie(c);
    if (userId) capture({ userId }, "logged_out", {});
    return c.json({ ok: true });
});

// Always returns ok, never revealing whether the email exists.
session.post("/auth/forgot", forgotLimiter, async (c) => {
    const body = await readJson(c, zForgot);
    if (!body) return c.json(BAD_BODY, 400);
    const { email } = body;
    const clean = (email ?? "").trim().toLowerCase();
    if (clean) await sendResetEmail(clean);
    return c.json({ ok: true });
});

session.post("/auth/reset", resetLimiter, async (c) => {
    const body = await readJson(c, zReset);
    if (!body) return c.json(BAD_BODY, 400);
    const { token, password } = body;
    if (!token || !password) return c.json({ error: "token and password are required" }, 400);
    const pwErr = passwordError(password);
    if (pwErr) return c.json({ error: pwErr }, 400);
    const userId = await consumeAuthToken(token, "reset");
    if (!userId) return c.json({ error: "This reset link is invalid or has expired." }, 400);
    const user = await resetPassword(userId, password);
    if (!user) return c.json({ error: "account not found" }, 400);
    // Consuming a link we mailed proves control of the address, which is the same thing the verify
    // link proves. Marking it here keeps the gate coherent: otherwise a reset would hand out a
    // session to an account the sign-in route would then refuse.
    if (!user.emailVerified) {
        await markEmailVerified(userId);
        await releaseSignupGrant(userId).catch(() => false);
    }
    setSessionCookie(c, userId);
    return c.json({ user: { ...user, emailVerified: true } });
});

// No session required: the single-use token in the emailed link is the proof.
session.get("/auth/verify", async (c) => {
    const userId = await consumeAuthToken(c.req.query("token"), "verify");
    if (!userId) return c.redirect(appUrl("/login?authError=verify_invalid"));
    await markEmailVerified(userId);
    // the grant is the reason verification is worth doing; grantOnce means a re-used link cannot re-pay
    await releaseSignupGrant(userId).catch(() => false);
    return c.redirect(appUrl("/login?verified=1"));
});

session.post("/auth/resend-verification", resendLimiter, requireUser, async (c) => {
    const u = c.get("user");
    if (!u.emailVerified)
        await sendVerifyEmail(u.id, u.email).catch((e: unknown) => {
            warn(
                `resend verify failed for ${u.email}: ${e instanceof Error ? e.message : String(e)}`,
            );
            return false;
        });
    return c.json({ ok: true });
});
