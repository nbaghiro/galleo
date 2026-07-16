import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db, schema } from "./schema";

// New-account provisioning (signup, OAuth, and the seed). The one place that wires a user + workspace +
// owner membership together — a fresh user needs all three before any artifact query.

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

// A short random tail so workspace slugs stay unique without a collision-prone counter.
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

// Generate a slug that isn't already taken. Checks a handful of candidates, then falls back to a long
// random tail (astronomically unlikely to collide) so this always terminates.
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

// Create a workspace owned by `userId` plus its owner membership. `slug` is generated unless pinned
// (the seed pins "demo"). Returns the new workspace's id + slug.
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

// Insert a fresh user and their first workspace + owner membership. The caller must have already
// confirmed the email is free (signup returns 409, OAuth links to the existing user instead).
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

// Resolve an OAuth identity to a local user, linking to an existing (provider, providerAccountId) row,
// else an existing account by email, else a fresh OAuth-only user. Linking by email requires the provider
// to have VERIFIED the address (`emailVerified`) — otherwise a provider that asserts an address it doesn't
// control could take over an existing account by email. Returns "email_taken" when an unverified provider
// email collides with an existing account, so the caller refuses the sign-in.
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
        // Existing account whose email was NEVER confirmed: its password + any prior links were set by
        // someone who never proved inbox control (a possible pre-hijack seed). The now-proven owner
        // reclaims it — mark verified, drop the untrusted password, and clear those links (only the
        // verified provider linked just below survives).
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
