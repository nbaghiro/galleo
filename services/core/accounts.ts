import { randomBytes, createHash } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { Google } from "arctic";
import { creditLimitFor } from "@model/billing";
import type { User } from "@model/workspace";
import { db } from "../db/client";
import { schema } from "../db/schema";
import { hashPassword, readSessionPayload, verifyPassword } from "../utils/auth";
import { appUrl } from "../utils/env";
import { sendEmail } from "./mail";

// Users, sessions, provisioning, and the OAuth link. Nothing here knows about HTTP: the routes in
// api/session.ts and api/oauth.ts turn these into responses.

export type WorkspaceRow = typeof schema.workspaces.$inferSelect;

// Single-sourced so currentUser and the auth routes project identically.
export function toUser(u: {
    id: string;
    email: string;
    name: string | null;
    avatarUrl: string | null;
    emailVerifiedAt: Date | null;
}): User {
    return {
        id: u.id,
        email: u.email,
        name: u.name,
        avatarUrl: u.avatarUrl,
        emailVerified: u.emailVerifiedAt !== null,
    };
}

export async function currentUser(token: string | undefined): Promise<User | null> {
    const payload = readSessionPayload(token);
    if (!payload) return null;
    const [u] = await db
        .select({
            id: schema.users.id,
            email: schema.users.email,
            name: schema.users.name,
            avatarUrl: schema.users.avatarUrl,
            emailVerifiedAt: schema.users.emailVerifiedAt,
            passwordChangedAt: schema.users.passwordChangedAt,
        })
        .from(schema.users)
        .where(eq(schema.users.id, payload.uid));
    if (!u) return null;
    // Reject any session minted before the last password reset. Second granularity: makeSession floors
    // iat, so the reset's own freshly minted session (same second) must not be rejected.
    if (u.passwordChangedAt && payload.iat < Math.floor(u.passwordChangedAt.getTime() / 1000))
        return null;
    return toUser(u);
}

export async function firstWorkspaceId(userId: string): Promise<string | null> {
    const ws = await currentWorkspace(userId);
    return ws?.id ?? null;
}

// The user's chosen membership when it's still real, else the oldest (their own, created at signup).
// Also lazily rolls the monthly credit window on read, since there is no cron.
export async function currentWorkspace(userId: string) {
    const rows = await db
        .select({ ws: schema.workspaces, active: schema.users.activeWorkspaceId })
        .from(schema.members)
        .innerJoin(schema.workspaces, eq(schema.members.workspaceId, schema.workspaces.id))
        .innerJoin(schema.users, eq(schema.users.id, schema.members.userId))
        .where(eq(schema.members.userId, userId))
        .orderBy(schema.members.createdAt);
    const ws = rows.find((r) => r.ws.id === r.active)?.ws ?? rows[0]?.ws;
    if (!ws) return null;
    if (ws.creditsResetAt.getTime() <= Date.now()) {
        const next = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        await db
            .update(schema.workspaces)
            .set({ aiCreditsUsed: 0, creditsResetAt: next })
            .where(eq(schema.workspaces.id, ws.id));
        if (ws.aiCreditsUsed > 0)
            await db.insert(schema.credits).values({
                workspaceId: ws.id,
                delta: ws.aiCreditsUsed,
                reason: "monthly-reset",
                balanceAfter: creditLimitFor(ws),
            });
        ws.aiCreditsUsed = 0;
        ws.creditsResetAt = next;
    }
    return ws;
}

export interface ProvisionInput {
    email: string;
    name?: string | null;
    avatarUrl?: string | null;
    passwordHash?: string | null; // null for OAuth-only accounts
    emailVerified?: boolean; // true for OAuth (provider-verified email); false for password signup
}

export interface ProvisionedUser {
    id: string;
    email: string;
    name: string | null;
    avatarUrl: string | null;
}

const SLUG_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

// a random tail keeps workspace slugs unique without a collision-prone counter
function randomSuffix(len: number): string {
    const bytes = randomBytes(len);
    let out = "";
    for (const b of bytes) out += SLUG_ALPHABET.charAt(b % SLUG_ALPHABET.length);
    return out;
}

function slugRoot(base: string): string {
    const cleaned = base
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 32);
    return cleaned || "workspace";
}

// a handful of candidates, then a long random tail, so this always terminates
async function uniqueSlug(base: string): Promise<string> {
    const root = slugRoot(base);
    for (let i = 0; i < 6; i++) {
        const candidate = `${root}-${randomSuffix(5)}`;
        const [existing] = await db
            .select({ id: schema.workspaces.id })
            .from(schema.workspaces)
            .where(eq(schema.workspaces.slug, candidate));
        if (!existing) return candidate;
    }
    return `${root}-${randomSuffix(12)}`;
}

function workspaceNameFor(name: string | null | undefined, email: string): string {
    const who = (name ?? email.split("@")[0] ?? "").trim() || "My";
    return `${who}'s Workspace`;
}

// slug is generated unless pinned (the seed pins "demo")
export async function createWorkspaceForUser(
    userId: string,
    opts: { name: string; slug?: string; slugBase?: string; plan?: string },
): Promise<{ id: string; slug: string }> {
    const slug = opts.slug ?? (await uniqueSlug(opts.slugBase ?? opts.name));
    const [ws] = await db
        .insert(schema.workspaces)
        .values({ name: opts.name, slug, ownerId: userId, plan: opts.plan ?? "free" })
        .returning({ id: schema.workspaces.id, slug: schema.workspaces.slug });
    if (!ws) throw new Error("failed to create workspace");
    await db.insert(schema.members).values({ workspaceId: ws.id, userId, role: "owner" });
    return ws;
}

// the caller must have confirmed the email is free (signup 409s, OAuth links to the existing user)
export async function provisionUser(input: ProvisionInput): Promise<ProvisionedUser> {
    const email = input.email.trim().toLowerCase();
    const [user] = await db
        .insert(schema.users)
        .values({
            email,
            name: input.name ?? null,
            avatarUrl: input.avatarUrl ?? null,
            passwordHash: input.passwordHash ?? null,
            emailVerifiedAt: input.emailVerified ? new Date() : null,
        })
        .returning({
            id: schema.users.id,
            email: schema.users.email,
            name: schema.users.name,
            avatarUrl: schema.users.avatarUrl,
        });
    if (!user) throw new Error("failed to create user");
    await createWorkspaceForUser(user.id, {
        name: workspaceNameFor(input.name, email),
        slugBase: email.split("@")[0] ?? email,
    });
    return user;
}

export interface OAuthProfile {
    email: string;
    name?: string | null;
    avatarUrl?: string | null;
}

// linking by email requires a provider-VERIFIED address: otherwise a provider asserting an address it
// doesn't control could take over the account, so an unverified collision returns "email_taken"
export async function linkOAuthAccount(
    provider: string,
    providerAccountId: string,
    profile: OAuthProfile,
    emailVerified: boolean,
): Promise<{ userId: string } | { error: "email_taken" }> {
    const [linked] = await db
        .select({ userId: schema.oauthAccounts.userId })
        .from(schema.oauthAccounts)
        .where(
            and(
                eq(schema.oauthAccounts.provider, provider),
                eq(schema.oauthAccounts.providerAccountId, providerAccountId),
            ),
        );
    if (linked) return { userId: linked.userId };

    const email = profile.email.trim().toLowerCase();
    const [byEmail] = await db
        .select({
            id: schema.users.id,
            name: schema.users.name,
            avatarUrl: schema.users.avatarUrl,
            emailVerifiedAt: schema.users.emailVerifiedAt,
            passwordHash: schema.users.passwordHash,
        })
        .from(schema.users)
        .where(eq(schema.users.email, email));

    let userId: string;
    if (byEmail) {
        if (!emailVerified) return { error: "email_taken" }; // only merge a provider-verified email (see above)
        userId = byEmail.id;
        const patch: {
            name?: string;
            avatarUrl?: string;
            emailVerifiedAt?: Date;
            passwordHash?: null;
        } = {};
        if (!byEmail.name && profile.name) patch.name = profile.name;
        if (!byEmail.avatarUrl && profile.avatarUrl) patch.avatarUrl = profile.avatarUrl;
        // an unconfirmed account's password + links were set by someone who never proved inbox
        // control, so the now-proven owner reclaims it: drop that password, clear those links
        if (!byEmail.emailVerifiedAt) {
            patch.emailVerifiedAt = new Date();
            if (byEmail.passwordHash) patch.passwordHash = null;
            await db.delete(schema.oauthAccounts).where(eq(schema.oauthAccounts.userId, userId));
        }
        if (Object.keys(patch).length > 0)
            await db.update(schema.users).set(patch).where(eq(schema.users.id, userId));
    } else {
        const created = await provisionUser({
            email,
            name: profile.name ?? null,
            avatarUrl: profile.avatarUrl ?? null,
            passwordHash: null,
            emailVerified,
        });
        userId = created.id;
    }

    await db.insert(schema.oauthAccounts).values({ provider, providerAccountId, userId });
    return { userId };
}

// the raw token goes only into the emailed link; storing its SHA-256 makes a DB leak unreplayable

export type TokenPurpose = "verify" | "reset";

function hashToken(raw: string): string {
    return createHash("sha256").update(raw).digest("hex");
}

// returns the RAW token for the link; only its hash is stored
export async function createAuthToken(
    userId: string,
    purpose: TokenPurpose,
    ttlSeconds: number,
): Promise<string> {
    const raw = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
    await db
        .insert(schema.authTokens)
        .values({ userId, purpose, tokenHash: hashToken(raw), expiresAt });
    return raw;
}

// validate + consume in one atomic UPDATE, so a token can't be replayed under a double-submit
export async function consumeAuthToken(
    raw: string | undefined,
    purpose: TokenPurpose,
): Promise<string | null> {
    if (!raw) return null;
    const [consumed] = await db
        .update(schema.authTokens)
        .set({ consumedAt: new Date() })
        .where(
            and(
                eq(schema.authTokens.tokenHash, hashToken(raw)),
                eq(schema.authTokens.purpose, purpose),
                isNull(schema.authTokens.consumedAt),
                gt(schema.authTokens.expiresAt, new Date()),
            ),
        )
        .returning({ userId: schema.authTokens.userId });
    return consumed?.userId ?? null;
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const MIN_PASSWORD = 8;
const MAX_PASSWORD = 200; // cap so an oversized input can't hog the event loop in synchronous scrypt

export const isEmail = (v: string): boolean => EMAIL_RE.test(v);

export function passwordError(pw: string): string | null {
    if (pw.length < MIN_PASSWORD) return `password must be at least ${MIN_PASSWORD} characters`;
    if (pw.length > MAX_PASSWORD) return `password must be at most ${MAX_PASSWORD} characters`;
    return null;
}

export const overPasswordCap = (pw: string): boolean => pw.length > MAX_PASSWORD;

// Login runs scrypt against this when there's no stored password, so a missing or OAuth-only account
// takes the same time as a wrong password.
const DUMMY_HASH = hashPassword(randomBytes(16).toString("hex"));

export async function emailTaken(email: string): Promise<boolean> {
    const [existing] = await db
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(eq(schema.users.email, email));
    return !!existing;
}

// Always runs one scrypt and returns one null, so a missing or OAuth-only account can't be
// enumerated by wording or by timing.
export async function authenticate(email: string, password: string): Promise<User | null> {
    const [u] = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.email, email.trim().toLowerCase()));
    const valid = verifyPassword(password, u?.passwordHash ?? DUMMY_HASH);
    return !u || !u.passwordHash || !valid ? null : toUser(u);
}

// Bumps passwordChangedAt so sessions minted before now are rejected: a stolen cookie dies here.
// Consuming the reset token also proves inbox control, so the email is confirmed at the same time.
export async function resetPassword(userId: string, password: string): Promise<User | null> {
    await db
        .update(schema.users)
        .set({
            passwordHash: hashPassword(password),
            emailVerifiedAt: new Date(),
            passwordChangedAt: new Date(),
        })
        .where(eq(schema.users.id, userId));
    const [u] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
    return u ? toUser(u) : null;
}

export async function markEmailVerified(userId: string): Promise<void> {
    await db
        .update(schema.users)
        .set({ emailVerifiedAt: new Date() })
        .where(eq(schema.users.id, userId));
}

export async function signUp(
    email: string,
    password: string,
    name: string | null,
): Promise<ProvisionedUser> {
    return provisionUser({ email, name, passwordHash: hashPassword(password) });
}

const VERIFY_TTL = 60 * 60 * 24; // 24h
const RESET_TTL = 60 * 60; // 1h

// Best-effort: callers don't block signup on delivery, and the user can re-request from the banner.
export async function sendVerifyEmail(userId: string, email: string): Promise<void> {
    const raw = await createAuthToken(userId, "verify", VERIFY_TTL);
    const url = appUrl(`/api/auth/verify?token=${raw}`);
    await sendEmail({
        to: email,
        subject: "Confirm your email for Galleo",
        text: `Confirm your email to finish setting up Galleo:\n\n${url}\n\nThis link expires in 24 hours.`,
        html: `<p>Confirm your email to finish setting up Galleo:</p>\n<p><a href="${url}">Verify email</a></p>\n<p>This link expires in 24 hours.</p>`,
    });
}

// Silent when the address is unknown, so the caller can always answer ok without revealing it.
export async function sendResetEmail(email: string): Promise<void> {
    const [u] = await db
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(eq(schema.users.email, email));
    if (!u) return;
    const raw = await createAuthToken(u.id, "reset", RESET_TTL);
    const url = appUrl(`/login?reset=${raw}`);
    await sendEmail({
        to: email,
        subject: "Reset your Galleo password",
        text: `Choose a new password:\n\n${url}\n\nThis link expires in 1 hour. If you didn't request it, ignore this email.`,
        html: `<p>Choose a new password:</p>\n<p><a href="${url}">Reset password</a></p>\n<p>This link expires in 1 hour. If you didn't request it, ignore this email.</p>`,
    }).catch(() => {});
}

// built lazily from env and memoized; null when unconfigured, so routes degrade instead of crashing
// (the redirect URI to register is ${APP_URL}/api/auth/google/callback)

export const OAUTH_SCOPES = ["openid", "profile", "email"];

function env(name: string): string | undefined {
    const v = process.env[name];
    return v && v.trim() ? v.trim() : undefined;
}

let google: Google | null | undefined;
export function googleProvider(): Google | null {
    if (google === undefined) {
        const id = env("GOOGLE_OAUTH_CLIENT_ID");
        const secret = env("GOOGLE_OAUTH_CLIENT_SECRET");
        google = id && secret ? new Google(id, secret, appUrl("/api/auth/google/callback")) : null;
    }
    return google;
}

// the auth page enables only the ready buttons
export function oauthProvidersReady(): { google: boolean } {
    return { google: googleProvider() !== null };
}
