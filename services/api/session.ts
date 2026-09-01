import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import { z } from "zod";
import { warn } from "@services/utils/env";
import {
    BAD_BODY,
    readJson,
    setSessionCookie,
    clearSessionCookie,
    rateLimit,
} from "@services/utils/http";
import { verifyCodeError } from "@model/workspace";
import { capture } from "@services/utils/analytics";
import { readSession, SESSION_COOKIE } from "@services/utils/auth";
import {
    authenticate,
    confirmEmailWithCode,
    consumeAuthToken,
    currentUser,
    emailTaken,
    isEmail,
    markEmailVerified,
    overPasswordCap,
    passwordError,
    resetPassword,
    sendResetEmail,
    sendVerifyEmail,
    signUp,
    toUser,
} from "@services/core/accounts";
import { domainAcceptsMail } from "@services/core/mail";
import { requireSession, type AuthedEnv } from "./middleware";

export const session = new Hono<AuthedEnv>();

// Per-IP guards: login is the password-guessing target, signup/forgot the account-spam targets.
const loginLimiter = rateLimit({ name: "login", limit: 10, windowMs: 5 * 60_000 });
const signupLimiter = rateLimit({ name: "signup", limit: 5, windowMs: 15 * 60_000 });
// 6 digits is only defensible with a ceiling on guesses. Per session rather than per IP: the code is
// bound to one account, so the caller worth counting is the session presenting it.
const confirmLimiter = rateLimit({
    name: "confirm",
    limit: 8,
    windowMs: 15 * 60_000,
    by: (c) => getCookie(c, SESSION_COOKIE) ?? null,
});
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
const zConfirm = z.object({ code: z.string().optional() });
const zReset = z.object({ token: z.string().optional(), password: z.string().optional() });

session.post("/auth/signup", signupLimiter, async (c) => {
    const body = await readJson(c, zSignup);
    if (!body) return c.json(BAD_BODY, 400);
    const { email, password, name } = body;
    const cleanEmail = (email ?? "").trim().toLowerCase();
    if (!cleanEmail || !password) return c.json({ error: "email and password are required" }, 400);
    if (!isEmail(cleanEmail)) return c.json({ error: "enter a valid email address" }, 400);
    // The field checks the shape; this checks the domain can receive at all, so a typo'd host is
    // refused here rather than becoming an account nobody can confirm.
    if (!(await domainAcceptsMail(cleanEmail)))
        return c.json(
            { error: "That email domain does not accept mail. Check the spelling." },
            400,
        );
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
    // A session, but a gated one: requireUser and requireWorkspace refuse an unconfirmed account, so
    // the only thing it can reach is the onboarding surface telling it to go and confirm. The account
    // lands somewhere that explains itself rather than on a form it has already filled in.
    // Never swallow the send: a verification mail that does not arrive is the difference between an
    // account someone can finish and one they cannot, and it was silent while it was broken.
    const sent = await sendVerifyEmail(user.id, user.email).catch((e: unknown) => {
        warn(
            `verify email failed for ${user.email}: ${e instanceof Error ? e.message : String(e)}`,
        );
        return false;
    });
    setSessionCookie(c, user.id);
    return c.json({ user: toUser(user), sent: sent === true });
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
    // Signing in unconfirmed is allowed, and the session it makes reaches exactly one screen. Refusing
    // here was the pre-gate design and, now that the code is typed into a session, it is a dead end:
    // close the tab and there is no way back in, since sign-in was the only way to get a session and
    // a session is the only place to enter a code.
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
    // Consuming a link we mailed proves control of the address, which is the same thing the
    // confirmation code proves. Marking it here keeps the gate coherent: otherwise someone who reset
    // their password would land on the confirm step with nothing left to prove.
    if (!user.emailVerified) await markEmailVerified(userId);
    setSessionCookie(c, userId);
    return c.json({ user: { ...user, emailVerified: true } });
});

// No session required: the single-use token in the emailed link is the proof.
// requireSession, not requireUser: an unconfirmed account is exactly who calls this, and requireUser
// is the gate that refuses it.
session.post("/auth/confirm", confirmLimiter, requireSession, async (c) => {
    const body = await readJson(c, zConfirm);
    if (!body) return c.json(BAD_BODY, 400);
    const u = c.get("user");
    const code = (body.code ?? "").replace(/\s+/g, "");
    if (u.emailVerified) return c.json({ user: u });
    const codeErr = verifyCodeError(code);
    if (codeErr) return c.json({ error: codeErr }, 400);
    if (!(await confirmEmailWithCode(u.id, code)))
        return c.json({ error: "That code is wrong or has expired. Send a new one." }, 400);
    const fresh = await currentUser(getCookie(c, SESSION_COOKIE));
    return c.json({ user: fresh ?? { ...u, emailVerified: true } });
});

session.post("/auth/resend-verification", resendLimiter, requireSession, async (c) => {
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
