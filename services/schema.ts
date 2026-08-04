import {
    pgTable,
    uuid,
    text,
    timestamp,
    integer,
    bigint,
    boolean,
    customType,
    index,
    jsonb,
    primaryKey,
    unique,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import type { ArtifactDigest } from "@model/artifact";
import type { FeatureOverrides } from "@model/features";

// Postgres FTS vector. Drizzle has no native type and the value is never written by hand — it is a
// generated column derived from `title` + `search_text`, so the index can't drift from the row.
const tsvector = customType<{ data: string; driverData: string }>({
    dataType: () => "tsvector",
});

export const users = pgTable("users", {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull().unique(),
    name: text("name"),
    avatarUrl: text("avatar_url"),
    passwordHash: text("password_hash"), // null = OAuth-only account
    emailVerifiedAt: timestamp("email_verified_at"), // null = email not yet confirmed
    // sessions issued before this instant are rejected — bumped on password reset (revokes stolen cookies)
    passwordChangedAt: timestamp("password_changed_at"),
    // which membership the app opens (no FK — workspaces is declared below; validated on read)
    activeWorkspaceId: uuid("active_workspace_id"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Linked OAuth identities (Google). One row per (provider, provider account) → the local user it
// authenticates. `password_hash` stays null for accounts created purely via OAuth; a user can have both
// a password and one or more linked providers (matched on a verified email).
export const oauthAccounts = pgTable(
    "oauth_accounts",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        userId: uuid("user_id")
            .notNull()
            .references(() => users.id),
        provider: text("provider").notNull(), // google
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
    cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false), // scheduled downgrade to Free at planPeriodEnd
    seats: integer("seats").notNull().default(1), // subscription quantity; synced from Stripe
    aiCreditsUsed: integer("ai_credits_used").notNull().default(0),
    aiCreditsBonus: integer("ai_credits_bonus").notNull().default(0), // purchased top-ups; spent after the pool, never reset
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

// Pending workspace invitations. Only a SHA-256 hash of the token is stored (the raw value lives in
// the emailed link, like auth_tokens); acceptance is possession-based. One live invite per
// (workspace, email); accepted_at set = consumed.
export const invites = pgTable(
    "invites",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        workspaceId: uuid("workspace_id")
            .notNull()
            .references(() => workspaces.id, { onDelete: "cascade" }),
        email: text("email").notNull(),
        role: text("role").notNull().default("editor"),
        tokenHash: text("token_hash").notNull().unique(),
        invitedBy: uuid("invited_by")
            .notNull()
            .references(() => users.id),
        expiresAt: timestamp("expires_at").notNull(),
        acceptedAt: timestamp("accepted_at"),
        createdAt: timestamp("created_at").notNull().defaultNow(),
    },
    (t) => [unique().on(t.workspaceId, t.email)],
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

export const artifacts = pgTable(
    "artifacts",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        workspaceId: uuid("workspace_id")
            .notNull()
            .references(() => workspaces.id),
        folderId: uuid("folder_id").references(() => folders.id),
        title: text("title").notNull().default("Untitled"),
        formatId: text("format_id").notNull(),
        themeId: text("theme_id").notNull(),
        draftContent: jsonb("draft_content").notNull().default({}),
        status: text("status").notNull().default("draft"),
        trashedAt: timestamp("trashed_at"), // soft delete: null = live, set = in Trash
        createdBy: uuid("created_by").references(() => users.id),
        createdAt: timestamp("created_at").notNull().defaultNow(),
        updatedAt: timestamp("updated_at").notNull().defaultNow(),
        // both derived from draft_content on every write (@model/digest), so listing and searching a
        // library never have to read the content trees back
        digest: jsonb("digest").$type<ArtifactDigest>(),
        searchText: text("search_text"),
        searchTsv: tsvector("search_tsv").generatedAlwaysAs(
            sql`setweight(to_tsvector('english', coalesce(title, '')), 'A') || setweight(to_tsvector('english', coalesce(search_text, '')), 'B')`,
        ),
    },
    (t) => [
        index("artifacts_search_tsv_idx").using("gin", t.searchTsv),
        index("artifacts_ws_updated_idx").on(t.workspaceId, t.updatedAt.desc()),
    ],
);

// Per-user open log for the library + ⌘K "Recent" list. `updated_at` is an edit clock, not a read clock,
// so recency has to be recorded separately; one row per (user, artifact), upserted on open.
export const artifactVisits = pgTable(
    "artifact_visits",
    {
        userId: uuid("user_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        artifactId: uuid("artifact_id")
            .notNull()
            .references(() => artifacts.id, { onDelete: "cascade" }),
        views: integer("views").notNull().default(1),
        viewedAt: timestamp("viewed_at").notNull().defaultNow(),
    },
    (t) => [
        primaryKey({ columns: [t.userId, t.artifactId] }),
        index("artifact_visits_user_viewed_idx").on(t.userId, t.viewedAt.desc()),
    ],
);

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

// public = slug only; protected = slug + hashed password; private = per-recipient token (link_recipients).
// An artifact can have many links (one per audience/channel, each with its own analytics); none = unpublished.
export const links = pgTable("links", {
    id: uuid("id").primaryKey().defaultRandom(),
    artifactId: uuid("artifact_id")
        .notNull()
        .references(() => artifacts.id, { onDelete: "cascade" }),
    slug: text("slug").notNull().unique(),
    name: text("name"), // owner-facing label ("Investor update", "Twitter") — never shown to viewers
    visibility: text("visibility").notNull().default("public"), // public | protected | private
    password: text("password"), // scrypt hash, only for `protected`
    createdAt: timestamp("created_at").notNull().defaultNow(),
});

// view log, one row per viewer session (daily-rotating cookieless key dedups reloads); owner previews are never logged
export const linkViews = pgTable(
    "link_views",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        linkId: uuid("link_id")
            .notNull()
            .references(() => links.id, { onDelete: "cascade" }),
        recipientId: uuid("recipient_id").references(() => linkRecipients.id, {
            onDelete: "set null",
        }), // private links: who viewed
        sessionKey: text("session_key"), // sha of day|ip|ua|link — null only on pre-analytics rows
        referrer: text("referrer"), // referrer hostname, or "direct"
        device: text("device"), // desktop | mobile
        country: text("country"), // from proxy geo headers (cf/vercel); null in dev
        viewedAt: timestamp("viewed_at").notNull().defaultNow(),
        lastSeenAt: timestamp("last_seen_at"), // bumped by the viewer heartbeat → session duration
        maxUnit: integer("max_unit"), // furthest slide/section index reached (0-based)
        unitTotal: integer("unit_total"), // total slides/sections in that session → completion %
    },
    (t) => [unique().on(t.linkId, t.sessionKey)],
);

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

// Idempotency ledger for Stripe webhooks: the event id is claimed before handling so a redelivery
// (Stripe retries until 2xx) can't re-apply the same effect — e.g. re-zero a workspace's credits.
export const stripeEvents = pgTable("stripe_events", {
    id: text("id").primaryKey(), // Stripe event id (evt_…)
    type: text("type").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
});

// `postgres(url)` is lazy (connects on first query, not import), so importing this for `drizzle-kit generate` stays connection-free
export const schema = {
    users,
    oauthAccounts,
    authTokens,
    workspaces,
    members,
    invites,
    folders,
    artifacts,
    artifactVisits,
    themes,
    assets,
    shares,
    links,
    linkRecipients,
    linkViews,
    credits,
    stripeEvents,
};

const url = process.env.DATABASE_URL;
if (url === undefined || url === "") {
    throw new Error("DATABASE_URL is not set");
}

// prepare:false → works on Neon's pooled endpoint (PgBouncer transaction mode rejects prepared statements)
// and scales past one instance; harmless on direct/local. Migrations still run against the direct endpoint.
export const db = drizzle(postgres(url, { prepare: false }), { schema });
