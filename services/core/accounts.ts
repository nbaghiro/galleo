import { randomBytes, randomInt, createHash } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { Google } from "arctic";

import type {
    AccountConnection,
    AuthProvider,
    User,
    UserPrefs,
    WorkspaceRole,
} from "@model/workspace";
import {
    asRole,
    DEV_CONFIRM_CODE,
    mergeUserPrefs,
    readUserPrefs,
    isEmail,
    VERIFY_CODE_LENGTH,
} from "@model/workspace";
import { db } from "@services/db/client";
import { freshCreditWindow, rollCreditWindow } from "./ledger";
import { schema } from "@services/db/schema";
import { hashPassword, readSessionPayload, verifyPassword } from "@services/utils/auth";
import { capture, identify } from "@services/utils/analytics";
import { appUrl, warn } from "@services/utils/env";
import { mailReady, sendEmail } from "./mail";

// Users, sessions, provisioning, and the OAuth link. Nothing here knows about HTTP: the routes in
// api/session.ts and api/oauth.ts turn these into responses.

export type WorkspaceRow = typeof schema.workspaces.$inferSelect;

// Single-sourced so currentUser and the auth routes project identically. The hash never leaves this
// function: the DTO carries only whether one exists, which is what the password form branches on.
export function toUser(u: {
    id: string;
    email: string;
    name: string | null;
    avatarUrl: string | null;
    createdAt: Date;
    emailVerifiedAt: Date | null;
    passwordHash: string | null;
    prefs: unknown;
}): User {
    return {
        id: u.id,
        email: u.email,
        name: u.name,
        avatarUrl: u.avatarUrl,
        emailVerified: u.emailVerifiedAt !== null,
        createdAt: u.createdAt.toISOString(),
        hasPassword: u.passwordHash !== null,
        prefs: readUserPrefs(u.prefs),
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
            createdAt: schema.users.createdAt,
            emailVerifiedAt: schema.users.emailVerifiedAt,
            passwordChangedAt: schema.users.passwordChangedAt,
            passwordHash: schema.users.passwordHash,
            prefs: schema.users.prefs,
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
// Also lazily rolls the monthly credit window on read, since there is no cron. The role rides along
// from the join that was already happening, so no route pays a second query to learn it.
export async function currentMembership(
    userId: string,
): Promise<{ ws: WorkspaceRow; role: WorkspaceRole } | null> {
    const rows = await db
        .select({
            ws: schema.workspaces,
            active: schema.users.activeWorkspaceId,
            role: schema.members.role,
        })
        .from(schema.members)
        .innerJoin(schema.workspaces, eq(schema.members.workspaceId, schema.workspaces.id))
        .innerJoin(schema.users, eq(schema.users.id, schema.members.userId))
        .where(eq(schema.members.userId, userId))
        .orderBy(schema.members.createdAt);
    const row = rows.find((r) => r.ws.id === r.active) ?? rows[0];
    if (!row) return null;
    const rolled = await rollCreditWindow(row.ws);
    if (rolled) Object.assign(row.ws, rolled);
    return { ws: row.ws, role: row.ws.ownerId === userId ? "owner" : asRole(row.role) };
}

/**
 * One named membership, for a caller that carries its own workspace rather than inheriting the
 * browser's. `users.activeWorkspaceId` is a mutable pointer written by the workspace switcher, so an
 * external client resolving through `currentMembership` would act on whatever tab the person last
 * used. Rolls the credit window on read for the same reason its sibling does: there is no cron.
 */
export async function membershipFor(
    userId: string,
    workspaceId: string,
): Promise<{ ws: WorkspaceRow; role: WorkspaceRole } | null> {
    const [row] = await db
        .select({ ws: schema.workspaces, role: schema.members.role })
        .from(schema.members)
        .innerJoin(schema.workspaces, eq(schema.members.workspaceId, schema.workspaces.id))
        .where(and(eq(schema.members.userId, userId), eq(schema.members.workspaceId, workspaceId)));
    if (!row) return null;
    const rolled = await rollCreditWindow(row.ws);
    if (rolled) Object.assign(row.ws, rolled);
    return { ws: row.ws, role: row.ws.ownerId === userId ? "owner" : asRole(row.role) };
}

export async function currentWorkspace(userId: string): Promise<WorkspaceRow | null> {
    return (await currentMembership(userId))?.ws ?? null;
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
    createdAt: Date;
    emailVerifiedAt: Date | null;
    passwordHash: string | null;
    prefs: UserPrefs | null;
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
        .values({
            name: opts.name,
            slug,
            ownerId: userId,
            plan: opts.plan ?? "free",
            ...freshCreditWindow(opts.plan),
        })
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
            createdAt: schema.users.createdAt,
            emailVerifiedAt: schema.users.emailVerifiedAt,
            passwordHash: schema.users.passwordHash,
            prefs: schema.users.prefs,
        });
    if (!user) throw new Error("failed to create user");
    const ws = await createWorkspaceForUser(user.id, {
        name: workspaceNameFor(input.name, email),
        slugBase: email.split("@")[0] ?? email,
    });
    // Every signup path lands here, so this cannot be missed by one of them. An invited person
    // signs up normally and accepts afterwards, so the invite is a pending row rather than
    // anything the signup itself carries.
    const method = input.passwordHash ? "password" : "google";
    const [pending] = await db
        .select({ id: schema.invites.id })
        .from(schema.invites)
        .where(and(eq(schema.invites.email, email), isNull(schema.invites.acceptedAt)))
        .limit(1);
    identify(user.id, {
        signup_method: method,
        signup_at: new Date().toISOString(),
        email_verified: !!input.emailVerified,
        workspaces_owned: 1,
        workspaces_member_of: 1,
    });
    capture({ userId: user.id, workspaceId: ws.id }, "signed_up", {
        method,
        invited: !!pending,
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

export { isEmail };

const MIN_PASSWORD = 8;
const MAX_PASSWORD = 200; // cap so an oversized input can't hog the event loop in synchronous scrypt

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
export async function authenticate(
    email: string,
    password: string,
): Promise<{ user: User; createdAt: Date } | null> {
    const [u] = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.email, email.trim().toLowerCase()));
    const valid = verifyPassword(password, u?.passwordHash ?? DUMMY_HASH);
    // createdAt rides along so the route can apply the verification gate without a second read
    return !u || !u.passwordHash || !valid ? null : { user: toUser(u), createdAt: u.createdAt };
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
    const [row] = await db
        .update(schema.users)
        .set({ emailVerifiedAt: new Date() })
        .where(eq(schema.users.id, userId))
        .returning({ createdAt: schema.users.createdAt });
    identify(userId, { email_verified: true });
    // Whether gating the signup grant on verification costs minutes or days, which is what decides
    // if that gate is acceptable at all.
    if (row)
        capture({ userId }, "email_verified", {
            hours_since_signup: Math.round((Date.now() - row.createdAt.getTime()) / 3_600_000),
        });
}

// The account surface: profile, password, linked providers, preferences. Every writer returns the
// re-read User, so a route answers with the same shape /me does and the client never re-fetches.

const USER_COLS = {
    id: schema.users.id,
    email: schema.users.email,
    name: schema.users.name,
    avatarUrl: schema.users.avatarUrl,
    createdAt: schema.users.createdAt,
    emailVerifiedAt: schema.users.emailVerifiedAt,
    passwordHash: schema.users.passwordHash,
    prefs: schema.users.prefs,
};

export async function updateProfile(userId: string, name: string | null): Promise<User | null> {
    const [u] = await db
        .update(schema.users)
        .set({ name })
        .where(eq(schema.users.id, userId))
        .returning(USER_COLS);
    return u ? toUser(u) : null;
}

export type PasswordChange =
    | { error: "no-account" }
    | { error: "wrong-password" }
    | { error: "current-required" }
    | { user: User };

// Setting the first password on an OAuth-only account takes no current one, since there is nothing
// to prove. Either way passwordChangedAt moves, which drops every session minted before now: the
// caller's own cookie has to be reissued by the route.
export async function changePassword(
    userId: string,
    current: string | undefined,
    next: string,
): Promise<PasswordChange> {
    const [existing] = await db
        .select({ passwordHash: schema.users.passwordHash })
        .from(schema.users)
        .where(eq(schema.users.id, userId));
    if (!existing) return { error: "no-account" };
    if (existing.passwordHash) {
        if (!current) return { error: "current-required" };
        if (!verifyPassword(current, existing.passwordHash)) return { error: "wrong-password" };
    }
    const [u] = await db
        .update(schema.users)
        .set({ passwordHash: hashPassword(next), passwordChangedAt: new Date() })
        .where(eq(schema.users.id, userId))
        .returning(USER_COLS);
    return u ? { user: toUser(u) } : { error: "no-account" };
}

export async function connectionsOf(userId: string): Promise<AccountConnection[]> {
    const rows = await db
        .select({
            provider: schema.oauthAccounts.provider,
            createdAt: schema.oauthAccounts.createdAt,
        })
        .from(schema.oauthAccounts)
        .where(eq(schema.oauthAccounts.userId, userId))
        .orderBy(schema.oauthAccounts.createdAt);
    return rows.map((r) => ({
        provider: r.provider as AuthProvider,
        linkedAt: r.createdAt.toISOString(),
    }));
}

export type LinkResult = "ok" | "already-linked" | "linked-elsewhere";

// The signed-in link path, as opposed to linkOAuthAccount's sign-in path: the session names the
// account, so the provider's email is free to differ from it and can never redirect the link
// somewhere else.
export async function linkProviderToUser(
    userId: string,
    provider: string,
    providerAccountId: string,
): Promise<LinkResult> {
    const [existing] = await db
        .select({ userId: schema.oauthAccounts.userId })
        .from(schema.oauthAccounts)
        .where(
            and(
                eq(schema.oauthAccounts.provider, provider),
                eq(schema.oauthAccounts.providerAccountId, providerAccountId),
            ),
        );
    if (existing) return existing.userId === userId ? "already-linked" : "linked-elsewhere";
    await db.insert(schema.oauthAccounts).values({ provider, providerAccountId, userId });
    return "ok";
}

export type UnlinkResult = "ok" | "not-linked" | "last-credential";

// Refuses the unlink that would lock the account out: with no password and no second provider, the
// link being dropped is the only way back in.
export async function unlinkProvider(userId: string, provider: string): Promise<UnlinkResult> {
    const [[account], links] = await Promise.all([
        db
            .select({ passwordHash: schema.users.passwordHash })
            .from(schema.users)
            .where(eq(schema.users.id, userId)),
        connectionsOf(userId),
    ]);
    if (!links.some((l) => l.provider === provider)) return "not-linked";
    if (!account?.passwordHash && links.length < 2) return "last-credential";
    await db
        .delete(schema.oauthAccounts)
        .where(
            and(
                eq(schema.oauthAccounts.userId, userId),
                eq(schema.oauthAccounts.provider, provider),
            ),
        );
    return "ok";
}

export async function updatePrefs(userId: string, patch: unknown): Promise<User | null> {
    const [existing] = await db
        .select({ prefs: schema.users.prefs })
        .from(schema.users)
        .where(eq(schema.users.id, userId));
    if (!existing) return null;
    const [u] = await db
        .update(schema.users)
        .set({ prefs: mergeUserPrefs(readUserPrefs(existing.prefs), patch) })
        .where(eq(schema.users.id, userId))
        .returning(USER_COLS);
    return u ? toUser(u) : null;
}

export async function signUp(
    email: string,
    password: string,
    name: string | null,
): Promise<ProvisionedUser> {
    return provisionUser({ email, name, passwordHash: hashPassword(password) });
}

// Short, because the code is typed rather than clicked: nobody leaves a signup half-finished for a
// day, and a narrow window is most of what makes a 6-digit secret defensible.
const VERIFY_TTL = 15 * 60; // 15m
const RESET_TTL = 60 * 60; // 1h

// A code rather than a link, so confirming happens in the tab the person is already in. The tradeoff
// is that 6 digits is guessable where a 32-byte token is not, and the hash in the row does not change
// that (10^6 SHA-256s is seconds). What defends it is the rest of the shape: one live code per
// account, a 15-minute window, an attempt limit on the route, and a code that is only accepted for
// the account whose session presents it.
export async function createVerifyCode(userId: string): Promise<string> {
    // supersede rather than accumulate: "send it again" must not leave five working codes behind
    await supersedeVerifyCodes(userId);
    const code = randomInt(0, 1_000_000).toString().padStart(VERIFY_CODE_LENGTH, "0");
    await db.insert(schema.authTokens).values({
        userId,
        purpose: "verify",
        tokenHash: codeHash(userId, code),
        expiresAt: new Date(Date.now() + VERIFY_TTL * 1000),
    });
    return code;
}

const supersedeVerifyCodes = (userId: string): Promise<unknown> =>
    db
        .update(schema.authTokens)
        .set({ consumedAt: new Date() })
        .where(
            and(
                eq(schema.authTokens.userId, userId),
                eq(schema.authTokens.purpose, "verify"),
                isNull(schema.authTokens.consumedAt),
            ),
        );

// Salted with the user id: tokenHash is unique, and two accounts holding the same 6 digits at once is
// ordinary rather than rare, so an unsalted hash would collide and fail the insert.
const codeHash = (userId: string, code: string): string => hashToken(`verify:${userId}:${code}`);

// The bypass, and the one thing that decides whether it exists. NODE_ENV is what Render sets and
// what playwright.config.ts sets for the e2e server, so both run without it; anywhere else (a dev
// server, a unit or integration run) it is live. Keyed on production being present rather than on dev
// being present, so an environment that forgets to say what it is gets the safe answer.
export const devConfirmCodeLive = (): boolean => process.env.NODE_ENV !== "production";

// Said at boot, because the failure that matters is this shipping enabled. A deploy that loses
// NODE_ENV would otherwise accept 123456 for every account and look completely normal doing it.
export function checkAuthConfig(): void {
    if (devConfirmCodeLive())
        warn(`NODE_ENV is not production: ${DEV_CONFIRM_CODE} confirms any account`);
}

/** True when the code was live for this account; consumes it either way it is spent. */
export async function confirmEmailWithCode(userId: string, code: string): Promise<boolean> {
    if (code === DEV_CONFIRM_CODE && devConfirmCodeLive()) {
        await supersedeVerifyCodes(userId);
        await markEmailVerified(userId);
        return true;
    }
    const [consumed] = await db
        .update(schema.authTokens)
        .set({ consumedAt: new Date() })
        .where(
            and(
                eq(schema.authTokens.tokenHash, codeHash(userId, code)),
                eq(schema.authTokens.userId, userId),
                eq(schema.authTokens.purpose, "verify"),
                isNull(schema.authTokens.consumedAt),
                gt(schema.authTokens.expiresAt, new Date()),
            ),
        )
        .returning({ id: schema.authTokens.id });
    if (!consumed) return false;
    await markEmailVerified(userId);
    return true;
}

/**
 * True when a provider actually took it. With no key the message is written to the log instead, and
 * saying "sent" then would be a lie the confirm step repeats to the person waiting for it.
 */
export async function sendVerifyEmail(userId: string, email: string): Promise<boolean> {
    const code = await createVerifyCode(userId);
    await sendEmail({
        to: email,
        subject: `${code} is your Galleo confirmation code`,
        text: `Your Galleo confirmation code is ${code}\n\nEnter it on the screen you left open. It expires in 15 minutes.\n\nIf you did not sign up for Galleo, you can ignore this.`,
        html: `<p>Your Galleo confirmation code is</p>\n<p style="font-size:30px;font-weight:600;letter-spacing:0.12em;margin:16px 0">${code}</p>\n<p>Enter it on the screen you left open. It expires in 15 minutes.</p>\n<p style="color:#6b7280;font-size:13px">If you did not sign up for Galleo, you can ignore this.</p>`,
    });
    return mailReady();
}

// Silent when the address is unknown, so the caller can always answer ok without revealing it.
export async function sendResetEmail(email: string): Promise<void> {
    const [u] = await db
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(eq(schema.users.email, email));
    if (!u) return;
    // Only for an address that exists. The route deliberately answers the same either way, and an
    // event for an unknown address would be a way to ask whether one is registered.
    capture({ userId: u.id }, "password_reset_requested", {});
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

// Drive access limited to files this app creates; the Slides export and (later) import both ride it.
export const GOOGLE_DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";

const TOKEN_SKEW_MS = 60_000; // treat a token expiring within a minute as already expired

export type GoogleTokenState = "ok" | "not-connected" | "expired" | "missing-scope";

export function googleTokenState(
    row: { accessToken: string | null; accessTokenExpiresAt: Date | null; scopes: string | null },
    now: Date = new Date(),
): GoogleTokenState {
    if (!row.accessToken || !row.accessTokenExpiresAt) return "not-connected";
    if (!(row.scopes ?? "").split(" ").includes(GOOGLE_DRIVE_SCOPE)) return "missing-scope";
    if (row.accessTokenExpiresAt.getTime() - TOKEN_SKEW_MS <= now.getTime()) return "expired";
    return "ok";
}

/** True when the user had a live Drive grant before this one (a reconnect, not a first connect). */
export async function saveGoogleTokens(
    userId: string,
    token: { accessToken: string; expiresAt: Date; scopes: string[] },
): Promise<boolean> {
    const [prev] = await db
        .select({
            accessToken: schema.oauthAccounts.accessToken,
            accessTokenExpiresAt: schema.oauthAccounts.accessTokenExpiresAt,
            scopes: schema.oauthAccounts.scopes,
        })
        .from(schema.oauthAccounts)
        .where(
            and(
                eq(schema.oauthAccounts.userId, userId),
                eq(schema.oauthAccounts.provider, "google"),
            ),
        );
    await db
        .update(schema.oauthAccounts)
        .set({
            accessToken: token.accessToken,
            accessTokenExpiresAt: token.expiresAt,
            scopes: token.scopes.join(" "),
        })
        .where(
            and(
                eq(schema.oauthAccounts.userId, userId),
                eq(schema.oauthAccounts.provider, "google"),
            ),
        );
    return !!prev && googleTokenState(prev) !== "not-connected";
}

/** The live Drive-scoped access token, or the state that explains why there is none. */
export async function googleDriveToken(
    userId: string,
): Promise<{ state: "ok"; token: string } | { state: Exclude<GoogleTokenState, "ok"> }> {
    const [row] = await db
        .select({
            accessToken: schema.oauthAccounts.accessToken,
            accessTokenExpiresAt: schema.oauthAccounts.accessTokenExpiresAt,
            scopes: schema.oauthAccounts.scopes,
        })
        .from(schema.oauthAccounts)
        .where(
            and(
                eq(schema.oauthAccounts.userId, userId),
                eq(schema.oauthAccounts.provider, "google"),
            ),
        );
    if (!row) return { state: "not-connected" };
    const state = googleTokenState(row);
    return state === "ok" ? { state, token: row.accessToken! } : { state };
}
