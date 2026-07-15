import {
    pgTable,
    uuid,
    text,
    timestamp,
    integer,
    bigint,
    boolean,
    jsonb,
    primaryKey,
    unique,
} from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import type { FeatureOverrides } from "@model/features";

export const users = pgTable("users", {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull().unique(),
    name: text("name"),
    avatarUrl: text("avatar_url"),
    passwordHash: text("password_hash"), // null = OAuth-only account
    emailVerifiedAt: timestamp("email_verified_at"), // null = email not yet confirmed
    // sessions issued before this instant are rejected — bumped on password reset (revokes stolen cookies)
    passwordChangedAt: timestamp("password_changed_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Linked OAuth identities (Google / Microsoft). One row per (provider, provider account) → the local
// user it authenticates. `password_hash` stays null for accounts created purely via OAuth; a user can
// have both a password and one or more linked providers (matched on a verified email).
export const oauthAccounts = pgTable(
    "oauth_accounts",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        userId: uuid("user_id")
            .notNull()
            .references(() => users.id),
        provider: text("provider").notNull(), // google | microsoft
        providerAccountId: text("provider_account_id").notNull(), // the provider's stable subject id
        createdAt: timestamp("created_at").notNull().defaultNow(),
    },
    (t) => [unique().on(t.provider, t.providerAccountId)],
);

// Short-lived, single-use tokens for email verification + password reset. Only a SHA-256 hash of the
// token is stored — the raw value lives solely in the emailed link, so a DB leak can't be replayed.
// `purpose` separates the two flows; `consumedAt` makes it one-time; `expiresAt` bounds its lifetime.
export const authTokens = pgTable("auth_tokens", {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
        .notNull()
        .references(() => users.id),
    purpose: text("purpose").notNull(), // verify | reset
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at").notNull(),
    consumedAt: timestamp("consumed_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const workspaces = pgTable("workspaces", {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    ownerId: uuid("owner_id")
        .notNull()
        .references(() => users.id),
    plan: text("plan").notNull().default("free"), // free | pro | premium (see @model/billing)
    stripeCustomerId: text("stripe_customer_id"),
    stripeSubscriptionId: text("stripe_subscription_id"),
    planStatus: text("plan_status").notNull().default("active"), // active | past_due | canceled
    planPeriodEnd: timestamp("plan_period_end"),
    seats: integer("seats").notNull().default(1), // subscription quantity; synced from Stripe
    aiCreditsUsed: integer("ai_credits_used").notNull().default(0),
    creditsResetAt: timestamp("credits_reset_at").notNull().defaultNow(),
    // per-workspace grants that override the plan; see @model/features
    featureOverrides: jsonb("feature_overrides").$type<FeatureOverrides>(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const members = pgTable(
    "members",
    {
        workspaceId: uuid("workspace_id")
            .notNull()
            .references(() => workspaces.id),
        userId: uuid("user_id")
            .notNull()
            .references(() => users.id),
        role: text("role").notNull().default("editor"),
        createdAt: timestamp("created_at").notNull().defaultNow(),
    },
    (t) => [primaryKey({ columns: [t.workspaceId, t.userId] })],
);

export const folders = pgTable("folders", {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
        .notNull()
        .references(() => workspaces.id),
    parentId: uuid("parent_id"),
    name: text("name").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const artifacts = pgTable("artifacts", {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
        .notNull()
        .references(() => workspaces.id),
    folderId: uuid("folder_id").references(() => folders.id),
    title: text("title").notNull().default("Untitled"),
    formatId: text("format_id").notNull(),
    themeId: text("theme_id").notNull(),
    draftContent: jsonb("draft_content").notNull().default({}),
    publishedVersionId: uuid("published_version_id"),
    status: text("status").notNull().default("draft"),
    trashedAt: timestamp("trashed_at"), // soft delete: null = live, set = in Trash
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const versions = pgTable("versions", {
    id: uuid("id").primaryKey().defaultRandom(),
    artifactId: uuid("artifact_id")
        .notNull()
        .references(() => artifacts.id, { onDelete: "cascade" }),
    content: jsonb("content").notNull(),
    label: text("label"),
    authorId: uuid("author_id").references(() => users.id),
    createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const themes = pgTable("themes", {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").references(() => workspaces.id), // null = system theme
    name: text("name").notNull(),
    tokens: jsonb("tokens").notNull(),
    mood: text("mood"),
    isDark: boolean("is_dark").notNull().default(false),
});

export const assets = pgTable("assets", {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
        .notNull()
        .references(() => workspaces.id),
    kind: text("kind").notNull(),
    source: text("source").notNull().default("upload"), // upload | generated | stock
    url: text("url").notNull(), // stock → provider CDN url; stored → /api/media/asset/:id
    width: integer("width"),
    height: integer("height"),
    bytes: bigint("bytes", { mode: "number" }),
    alt: text("alt"),
    meta: jsonb("meta"), // { provider, author, authorUrl, sourceUrl, downloadLocation, prompt, style }
    data: text("data"), // base64 bytes for stored media (generated / uploaded); null for stock (url only)
    mime: text("mime"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const shares = pgTable("shares", {
    id: uuid("id").primaryKey().defaultRandom(),
    artifactId: uuid("artifact_id")
        .notNull()
        .references(() => artifacts.id),
    subjectType: text("subject_type").notNull(), // user | link | workspace
    subjectId: text("subject_id").notNull(),
    role: text("role").notNull().default("viewer"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
});

// public = slug only; protected = slug + hashed password; private = per-recipient token (link_recipients). No row = unpublished.
export const links = pgTable("links", {
    id: uuid("id").primaryKey().defaultRandom(),
    artifactId: uuid("artifact_id")
        .notNull()
        .references(() => artifacts.id, { onDelete: "cascade" }),
    slug: text("slug").notNull().unique(),
    visibility: text("visibility").notNull().default("public"), // public | protected | private
    password: text("password"), // scrypt hash, only for `protected`
    publishedVersionId: uuid("published_version_id").references(() => versions.id),
    createdAt: timestamp("created_at").notNull().defaultNow(),
});

// per-recipient grants for a private link: each invited email gets an unguessable token → possession-based access (no viewer login)
export const linkRecipients = pgTable(
    "link_recipients",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        linkId: uuid("link_id")
            .notNull()
            .references(() => links.id, { onDelete: "cascade" }),
        email: text("email").notNull(),
        token: text("token").notNull().unique(),
        message: text("message"), // optional note included in the invite email
        invitedAt: timestamp("invited_at").notNull().defaultNow(),
        lastViewedAt: timestamp("last_viewed_at"), // populated by view analytics
    },
    (t) => [unique().on(t.linkId, t.email)],
);

export const credits = pgTable("credits", {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
        .notNull()
        .references(() => workspaces.id),
    delta: integer("delta").notNull(),
    reason: text("reason").notNull(),
    balanceAfter: integer("balance_after").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
});

// `postgres(url)` is lazy (connects on first query, not import), so importing this for `drizzle-kit generate` stays connection-free
export const schema = {
    users,
    oauthAccounts,
    authTokens,
    workspaces,
    members,
    folders,
    artifacts,
    versions,
    themes,
    assets,
    shares,
    links,
    linkRecipients,
    credits,
};

const url = process.env.DATABASE_URL;
if (url === undefined || url === "") {
    throw new Error("DATABASE_URL is not set");
}

// prepare:false → works on Neon's pooled endpoint (PgBouncer transaction mode rejects prepared statements)
// and scales past one instance; harmless on direct/local. Migrations still run against the direct endpoint.
export const db = drizzle(postgres(url, { prepare: false }), { schema });
