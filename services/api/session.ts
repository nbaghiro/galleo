import { randomBytes } from "node:crypto";
import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { getCookie } from "hono/cookie";
import type { LoginBody, SignupBody, ForgotBody, ResetBody } from "@model/workspace";
import { db, schema } from "../schema";
import { verifyPassword, hashPassword, SESSION_COOKIE } from "../auth";
import { provisionUser } from "../provision";
import { createAuthToken, consumeAuthToken } from "../tokens";
import { sendEmail } from "../mail/send";
import { appUrl } from "../app-url";
import { currentUser, readJson, setSessionCookie, clearSessionCookie, toUser } from "./context";
import { rateLimit } from "./ratelimit";

export const session = new Hono();

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const MIN_PASSWORD = 8;
const MAX_PASSWORD = 200; // cap so an oversized input can't hog the event loop in synchronous scrypt

// A well-formed hash of a random secret. Login runs scrypt against this when there's no password to check,
// so a missing / OAuth-only account takes the same time as a wrong password (no timing enumeration).
const DUMMY_HASH = hashPassword(randomBytes(16).toString("hex"));

// Per-IP guards: login is the password-guessing target, signup/forgot the account-spam targets.
const loginLimiter = rateLimit({ name: "login", limit: 10, windowMs: 5 * 60_000 });
const signupLimiter = rateLimit({ name: "signup", limit: 5, windowMs: 15 * 60_000 });
const forgotLimiter = rateLimit({ name: "forgot", limit: 5, windowMs: 15 * 60_000 });
const resetLimiter = rateLimit({ name: "reset", limit: 10, windowMs: 15 * 60_000 });
const resendLimiter = rateLimit({ name: "resend", limit: 5, windowMs: 15 * 60_000 });

function passwordError(pw: string): string | null {
    if (pw.length < MIN_PASSWORD) return `password must be at least ${MIN_PASSWORD} characters`;
    if (pw.length > MAX_PASSWORD) return `password must be at most ${MAX_PASSWORD} characters`;
    return null;
}

const VERIFY_TTL = 60 * 60 * 24; // 24h
const RESET_TTL = 60 * 60; // 1h

// Mint a verification token and email its confirmation link. Best-effort — callers don't block success
// on delivery (a send failure shouldn't fail signup); the user can re-request from the in-app banner.
async function sendVerifyEmail(userId: string, email: string): Promise<void> {
    const raw = await createAuthToken(userId, "verify", VERIFY_TTL);
    const url = appUrl(`/api/auth/verify?token=${raw}`);
    await sendEmail({
        to: email,
        subject: "Confirm your email for Galleo",
        text: `Confirm your email to finish setting up Galleo:\n\n${url}\n\nThis link expires in 24 hours.`,
        html: `<p>Confirm your email to finish setting up Galleo:</p>\n<p><a href="${url}">Verify email</a></p>\n<p>This link expires in 24 hours.</p>`,
    });
}

session.post("/auth/signup", signupLimiter, async (c) => {
    const { email, password, name } = await readJson<SignupBody>(c);
    const cleanEmail = (email ?? "").trim().toLowerCase();
    if (!cleanEmail || !password) return c.json({ error: "email and password are required" }, 400);
    if (!EMAIL_RE.test(cleanEmail)) return c.json({ error: "enter a valid email address" }, 400);
    const pwErr = passwordError(password);
    if (pwErr) return c.json({ error: pwErr }, 400);

    const [existing] = await db
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(eq(schema.users.email, cleanEmail));
    if (existing) return c.json({ error: "an account with this email already exists" }, 409);

    let user;
    try {
        user = await provisionUser({
            email: cleanEmail,
            name: name?.trim() || null,
            passwordHash: hashPassword(password),
        });
    } catch {
        // unique(email) violation from a concurrent signup that raced past the check above
        return c.json({ error: "an account with this email already exists" }, 409);
    }
    setSessionCookie(c, user.id);
    await sendVerifyEmail(user.id, user.email).catch(() => {});
    return c.json({ user: { ...user, emailVerified: false } });
});

session.post("/auth/login", loginLimiter, async (c) => {
    const { email, password } = await readJson<LoginBody>(c);
    if (!email || !password) return c.json({ error: "email and password are required" }, 400);
    // cap before scrypt: an over-cap password can't match any stored hash (signup/reset enforce the cap),
    // so reject with the generic error without paying the synchronous hashing cost
    if (password.length > MAX_PASSWORD) return c.json({ error: "invalid email or password" }, 401);
    const [u] = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.email, email.trim().toLowerCase()));
    // Always run one scrypt (against a dummy hash when there's no stored password) and return one generic
    // message — so a missing account or an OAuth-only account can't be enumerated by wording or by timing.
    const valid = verifyPassword(password, u?.passwordHash ?? DUMMY_HASH);
    if (!u || !u.passwordHash || !valid) return c.json({ error: "invalid email or password" }, 401);
    setSessionCookie(c, u.id);
    return c.json({ user: toUser(u) });
});

session.post("/auth/logout", (c) => {
    clearSessionCookie(c);
    return c.json({ ok: true });
});

// Password reset — request leg. Always returns ok (never reveals whether the email exists) and emails a
// single-use reset link only when it does. Rate-limited to blunt enumeration + mail-spam.
session.post("/auth/forgot", forgotLimiter, async (c) => {
    const { email } = await readJson<ForgotBody>(c);
    const clean = (email ?? "").trim().toLowerCase();
    if (clean) {
        const [u] = await db
            .select({ id: schema.users.id })
            .from(schema.users)
            .where(eq(schema.users.email, clean));
        if (u) {
            const raw = await createAuthToken(u.id, "reset", RESET_TTL);
            const url = appUrl(`/login?reset=${raw}`);
            await sendEmail({
                to: clean,
                subject: "Reset your Galleo password",
                text: `Choose a new password:\n\n${url}\n\nThis link expires in 1 hour. If you didn't request it, ignore this email.`,
                html: `<p>Choose a new password:</p>\n<p><a href="${url}">Reset password</a></p>\n<p>This link expires in 1 hour. If you didn't request it, ignore this email.</p>`,
            }).catch(() => {});
        }
    }
    return c.json({ ok: true });
});

// Password reset — completion leg. Consumes the token, sets the new password (which also confirms the
// email, since they proved inbox control), and signs them in.
session.post("/auth/reset", resetLimiter, async (c) => {
    const { token, password } = await readJson<ResetBody>(c);
    if (!token || !password) return c.json({ error: "token and password are required" }, 400);
    const pwErr = passwordError(password);
    if (pwErr) return c.json({ error: pwErr }, 400);
    const userId = await consumeAuthToken(token, "reset");
    if (!userId) return c.json({ error: "This reset link is invalid or has expired." }, 400);
    // Bump passwordChangedAt so sessions issued before now are rejected (currentUser checks the token's iat
    // against it) — a stolen cookie can't survive the reset meant to lock the attacker out.
    await db
        .update(schema.users)
        .set({
            passwordHash: hashPassword(password),
            emailVerifiedAt: new Date(),
            passwordChangedAt: new Date(),
        })
        .where(eq(schema.users.id, userId));
    setSessionCookie(c, userId);
    const [u] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
    if (!u) return c.json({ error: "account not found" }, 400);
    return c.json({ user: toUser(u) });
});

// Email verification — the confirmation link lands here (a top-level GET). No session required; the
// single-use token is the proof.
session.get("/auth/verify", async (c) => {
    const userId = await consumeAuthToken(c.req.query("token"), "verify");
    if (!userId) return c.redirect(appUrl("/login?authError=verify_invalid"));
    await db
        .update(schema.users)
        .set({ emailVerifiedAt: new Date() })
        .where(eq(schema.users.id, userId));
    return c.redirect(appUrl("/login?verified=1"));
});

// Re-send the verification email for the signed-in user (the in-app banner's "Resend" action).
session.post("/auth/resend-verification", resendLimiter, async (c) => {
    const u = await currentUser(getCookie(c, SESSION_COOKIE));
    if (!u) return c.json({ error: "unauthorized" }, 401);
    if (!u.emailVerified) await sendVerifyEmail(u.id, u.email).catch(() => {});
    return c.json({ ok: true });
});

session.get("/me", async (c) => {
    const u = await currentUser(getCookie(c, SESSION_COOKIE));
    if (!u) return c.json({ error: "unauthorized" }, 401);
    return c.json({ user: u });
});
