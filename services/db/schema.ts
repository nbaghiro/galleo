import type { ModelSpan } from "@model/ai";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import {
    pgTable,
    uuid,
    text,
    timestamp,
    integer,
    bigint,
    boolean,
    customType,
    check,
    index,
    jsonb,
    primaryKey,
    unique,
    uniqueIndex,
    vector,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import type { GenMeta, ArtifactDigest, ArtifactAccess } from "@model/artifact";
import type { CommentAnchor } from "@model/comments";
import type { FeatureOverrides, Interval, ScheduledChange } from "@model/billing";
import type { Usage } from "@model/credits";
import type { SpeechAlignment, VoiceLabels } from "@model/speech";
import type { ArtifactContent } from "@model/artifact";
import type { EvalCheck, EvalConfig, EvalJudgement, EvalStatus } from "@model/eval";
import type { PublishPolicy, UserPrefs } from "@model/workspace";
import type { AssetMeta } from "@model/media";

// Drizzle has no tsvector type; the column is generated from title + search_text, never written by hand
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
    // per-account settings; client-written, so every read normalizes through readUserPrefs
    prefs: jsonb("prefs").$type<UserPrefs>(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
});

// a user can have both a password and linked providers; linking by email requires a verified address
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
        // Connect-scope grant (Drive export). Sign-in leaves all three null. Access token only by
        // design: expiry re-runs the consent popup instead of this row holding a refresh token.
        accessToken: text("access_token"),
        accessTokenExpiresAt: timestamp("access_token_expires_at"),
        scopes: text("scopes"), // space-separated, as granted
    },
    (t) => [unique().on(t.provider, t.providerAccountId)],
);

// only the SHA-256 hash is stored, so a DB leak can't replay the emailed token
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
    // month | year while subscribed, synced by the webhook; decides which path grants credits
    // (monthly = the cycle invoice, annual = the lazy roll). Null = no subscription.
    planInterval: text("plan_interval").$type<Interval>(),
    stripeCustomerId: text("stripe_customer_id"),
    stripeSubscriptionId: text("stripe_subscription_id"),
    planStatus: text("plan_status").notNull().default("active"), // active | past_due | canceled
    planPeriodEnd: timestamp("plan_period_end"),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false), // scheduled downgrade to Free at planPeriodEnd
    seats: integer("seats").notNull().default(1), // plan's included seats + the seat add-on's quantity
    aiCreditsBalance: integer("ai_credits_balance").notNull().default(0),
    // The only credit counter, and a balance rather than a usage tally: the monthly grant is added
    // at the roll and unspent credits carry, so a one-off purchase is just another addition and
    // nothing has to survive a reset that no longer happens.
    // Pack credits still in the bank. Grants clip against ROLLOVER_CAP_MONTHS x the monthly grant
    // and this floor exempts purchases; re-clamped to the balance at each grant, since spends draw
    // granted credits first by convention.
    purchasedCredits: integer("purchased_credits").notNull().default(0),
    creditsResetAt: timestamp("credits_reset_at").notNull().defaultNow(),
    // when the current credit window opened; every writer of credits_reset_at sets both
    creditsStartedAt: timestamp("credits_started_at").notNull().defaultNow(),
    // a downgrade waiting at period end (Stripe subscription schedule); null = none
    scheduledChange: jsonb("scheduled_change").$type<ScheduledChange>(),
    // per-workspace grants that override the plan; see @model/billing
    featureOverrides: jsonb("feature_overrides").$type<FeatureOverrides>(),
    // what a member gets on an artifact that sets no level of its own (@model/artifact accessFor)
    defaultArtifactAccess: text("default_artifact_access")
        .$type<ArtifactAccess>()
        .notNull()
        .default("edit"),
    publishPolicy: text("publish_policy").$type<PublishPolicy>().notNull().default("members"),
    // per member, per credit window; null = uncapped. Owners and admins are never capped.
    memberCreditCap: integer("member_credit_cap"),
    // Off unless asked for: it writes scripts and records audio for pieces nobody has played yet,
    // which is real credit spend with nobody watching it happen.
    prepareAudio: boolean("prepare_audio").notNull().default(false),
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

// only the token's SHA-256 hash is stored (like auth_tokens); acceptance is possession-based
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
        draftContent: jsonb("draft_content").notNull().default({}),
        // The content is the only place a piece's format and theme are stored. These are the
        // queryable view of it, generated by Postgres, so a list can filter and sort without
        // reading a single tree back and the two can no longer disagree: they used to be ordinary
        // columns passed by hand at each write, and the collaboration room did not pass them, so a
        // format switch left the library saying DECK on a piece that opened as a site. A write to
        // either is now an error rather than a divergence. The fallbacks match what a create with
        // no content used to default to.
        formatId: text("format_id")
            .notNull()
            .generatedAlwaysAs(sql`coalesce(draft_content->>'format', 'deck')`),
        themeId: text("theme_id")
            .notNull()
            .generatedAlwaysAs(sql`coalesce(draft_content->>'theme', 'studio')`),
        status: text("status").notNull().default("draft"),
        trashedAt: timestamp("trashed_at"), // soft delete: null = live, set = in Trash
        createdBy: uuid("created_by").references(() => users.id),
        // this artifact's own level for plain members; null inherits the workspace default
        memberAccess: text("member_access").$type<ArtifactAccess>(),
        createdAt: timestamp("created_at").notNull().defaultNow(),
        updatedAt: timestamp("updated_at").notNull().defaultNow(),
        // derived from draft_content on every write (@model/artifact), so lists never read the trees back
        digest: jsonb("digest").$type<ArtifactDigest>(),
        searchText: text("search_text"),
        // provenance for AI-generated artifacts: the brief and the model behind each step
        aiMeta: jsonb("ai_meta").$type<GenMeta>(),
        // monotonic revision counter, bumped inside the transaction of every content write; the
        // collab room orders its broadcasts by it and a reconnecting client catches up from it
        seq: bigint("seq", { mode: "number" }).notNull().default(0),
        searchTsv: tsvector("search_tsv").generatedAlwaysAs(
            sql`setweight(to_tsvector('english', coalesce(title, '')), 'A') || setweight(to_tsvector('english', coalesce(search_text, '')), 'B')`,
        ),
    },
    (t) => [
        index("artifacts_search_tsv_idx").using("gin", t.searchTsv),
        index("artifacts_ws_updated_idx").on(t.workspaceId, t.updatedAt.desc()),
    ],
);

// Per-person access to one artifact, independent of workspace membership: this is what lets someone
// outside the workspace open it at all. Keyed by email rather than user id so an invite can go to an
// address that has no account yet; user_id binds on acceptance. A grant never lowers a member's
// level — effective access is the higher of the membership-derived level and this one.
export const artifactGrants = pgTable(
    "artifact_grants",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        artifactId: uuid("artifact_id")
            .notNull()
            .references(() => artifacts.id, { onDelete: "cascade" }),
        // the artifact's workspace, denormalized so a "shared with me" list needs no second join
        workspaceId: uuid("workspace_id")
            .notNull()
            .references(() => workspaces.id, { onDelete: "cascade" }),
        email: text("email").notNull(),
        userId: uuid("user_id").references(() => users.id), // null until claimed
        access: text("access").$type<ArtifactAccess>().notNull().default("edit"),
        invitedBy: uuid("invited_by").references(() => users.id),
        // only the SHA-256 hash, like invites: the raw token lives in the emailed link
        tokenHash: text("token_hash"),
        acceptedAt: timestamp("accepted_at"),
        createdAt: timestamp("created_at").notNull().defaultNow(),
    },
    (t) => [
        unique().on(t.artifactId, t.email),
        index("artifact_grants_user_idx").on(t.userId),
        index("artifact_grants_email_idx").on(t.email),
    ],
);

// What a user reached for, per (user, kind, ref): artifact opens (the read clock behind "Recent" —
// updated_at is an edit clock) and template uses (catalog popularity = sum of uses across everyone).
// ref is an artifacts.id or a template id from the code catalog — no FK since it spans two parents;
// core deletes rows with their artifact (the chunks pattern).
export const visits = pgTable(
    "visits",
    {
        userId: uuid("user_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        kind: text("kind").notNull(), // "artifact" | "template"
        ref: text("ref").notNull(),
        uses: integer("uses").notNull().default(1),
        seenAt: timestamp("seen_at").notNull().defaultNow(),
    },
    (t) => [
        primaryKey({ columns: [t.userId, t.kind, t.ref] }),
        index("visits_kind_ref_idx").on(t.kind, t.ref),
    ],
);

// A thread is a root comment plus flat replies (parent_id = the root); resolution lives on the root.
// Comments sit outside the content tree, so undo never creates or destroys one. section_id is a
// content id, not a row id: it collides across artifacts, so every read also keys on artifact_id.
// author_id is nullable to leave room for a link recipient authoring one without a user row.
export const comments = pgTable(
    "comments",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        workspaceId: uuid("workspace_id")
            .notNull()
            .references(() => workspaces.id),
        artifactId: uuid("artifact_id")
            .notNull()
            .references(() => artifacts.id, { onDelete: "cascade" }),
        sectionId: text("section_id").notNull(),
        anchor: jsonb("anchor").$type<CommentAnchor>().notNull(),
        quote: text("quote"), // what the anchor covered when written, for a degraded thread
        parentId: uuid("parent_id").references((): AnyPgColumn => comments.id, {
            onDelete: "cascade",
        }),
        authorId: uuid("author_id").references(() => users.id),
        body: text("body").notNull(),
        resolvedAt: timestamp("resolved_at"),
        resolvedBy: uuid("resolved_by").references(() => users.id),
        createdAt: timestamp("created_at").notNull().defaultNow(),
        updatedAt: timestamp("updated_at").notNull().defaultNow(),
    },
    (t) => [index("comments_artifact_idx").on(t.artifactId, t.createdAt)],
);

// custom themes only — the built-in library lives in code (@themes)
export const themes = pgTable("themes", {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
        .notNull()
        .references(() => workspaces.id),
    name: text("name").notNull(),
    tokens: jsonb("tokens").notNull(),
    mood: text("mood"),
    isDark: boolean("is_dark").notNull().default(false),
});

// Every media reference in artifact content resolves to a row here, so the library is complete by
// construction rather than by scanning. The reference is always `/api/media/asset/:id`; `origin`
// holds the external url the bytes still live at, and is null once we hold them ourselves.
export const assets = pgTable(
    "assets",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        workspaceId: uuid("workspace_id")
            .notNull()
            .references(() => workspaces.id, { onDelete: "cascade" }),
        kind: text("kind").notNull(), // image | video
        source: text("source").notNull().default("upload"), // upload | generated | stock | link
        origin: text("origin"), // external url; null once the bytes are stored here
        data: text("data"), // base64 bytes; null when `origin` serves them
        sha256: text("sha256"), // hex digest of the bytes: set with `data`, deduped per workspace
        mime: text("mime"),
        bytes: bigint("bytes", { mode: "number" }), // only stored rows count against the plan cap
        width: integer("width"),
        height: integer("height"),
        alt: text("alt"), // accessibility text, never a filename
        meta: jsonb("meta").$type<AssetMeta>(),
        createdAt: timestamp("created_at").notNull().defaultNow(),
        // bumped on every pick; the library orders by this, so recency never rewrites creation time
        usedAt: timestamp("used_at").notNull().defaultNow(),
    },
    (t) => [
        index("assets_ws_used_idx").on(t.workspaceId, t.usedAt.desc()),
        // One row per external url and per distinct file, so adopting the same picture twice or
        // uploading the same logo twice reuses the row instead of stacking (and re-charging) it.
        uniqueIndex("assets_ws_origin_key")
            .on(t.workspaceId, t.origin)
            .where(sql`${t.origin} IS NOT NULL`),
        uniqueIndex("assets_ws_sha_key")
            .on(t.workspaceId, t.sha256)
            .where(sql`${t.sha256} IS NOT NULL`),
        // bytes and their digest arrive together, and a row nothing can serve is not an asset
        check("assets_bytes_hashed", sql`(${t.data} IS NULL) = (${t.sha256} IS NULL)`),
        check("assets_servable", sql`${t.data} IS NOT NULL OR ${t.origin} IS NOT NULL`),
    ],
);

// The reverse index: which assets an artifact references. Replaced wholesale on every content
// write, so "used in N artifacts" and unreferenced-asset collection are both plain queries.
export const artifactAssets = pgTable(
    "artifact_assets",
    {
        artifactId: uuid("artifact_id")
            .notNull()
            .references(() => artifacts.id, { onDelete: "cascade" }),
        assetId: uuid("asset_id")
            .notNull()
            .references(() => assets.id, { onDelete: "cascade" }),
    },
    (t) => [
        primaryKey({ columns: [t.artifactId, t.assetId] }),
        index("artifact_assets_asset_idx").on(t.assetId),
    ],
);

// public = slug only, protected = slug + password hash, private = per-recipient token; none = unpublished
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

// one row per viewer session (a daily rotating key dedups reloads); owner previews are never logged
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

// each invited email gets an unguessable token: possession-based access, no viewer login
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

export const credits = pgTable(
    "credits",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        workspaceId: uuid("workspace_id")
            .notNull()
            .references(() => workspaces.id),
        // who initiated the spend; null = system (monthly resets, webhook grants)
        userId: uuid("user_id").references(() => users.id),
        delta: integer("delta").notNull(),
        reason: text("reason").notNull(),
        // the Stripe object a webhook grant keys on (checkout session / invoice id): unique, so a
        // redelivered event finds its row and cannot re-grant; null on ordinary spend/refund rows
        key: text("key").unique(),
        // the units of work this charge was for, so history can say what it bought and not just
        // which tool ran; null on grants and resets
        usage: jsonb("usage").$type<Usage>(),
        balanceAfter: integer("balance_after").notNull(),
        createdAt: timestamp("created_at").notNull().defaultNow(),
    },
    (t) => [index("credits_ws_created_idx").on(t.workspaceId, t.createdAt.desc())],
);

// postgres(url) is lazy, so importing this for `drizzle-kit generate` stays connection-free
// The context library: reusable, workspace-shared grounding for generation + chat

// a named, reusable collection of grounding material; workspace-scoped = shared with the team
export const contexts = pgTable(
    "contexts",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        workspaceId: uuid("workspace_id")
            .notNull()
            .references(() => workspaces.id),
        name: text("name").notNull(),
        description: text("description"),
        createdBy: uuid("created_by").references(() => users.id),
        createdAt: timestamp("created_at").notNull().defaultNow(),
        updatedAt: timestamp("updated_at").notNull().defaultNow(),
    },
    (t) => [index("contexts_ws_idx").on(t.workspaceId, t.updatedAt.desc())],
);

// one source inside a context; `body` is the extracted text and stays the chunks' source of truth
export const contextItems = pgTable(
    "context_items",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        contextId: uuid("context_id")
            .notNull()
            .references(() => contexts.id, { onDelete: "cascade" }),
        kind: text("kind").notNull(), // "file" | "link" | "artifact" | "template" | "text"
        title: text("title").notNull(),
        ref: text("ref"), // the url (link) or artifact/template id; absent for file/text
        body: text("body").notNull(),
        chars: integer("chars").notNull(),
        // server-extracted binaries keep their original (base64), so the inspector can render
        // the real file — a PDF in the browser's viewer, an image as an image
        original: text("original"),
        originalMime: text("original_mime"),
        addedBy: uuid("added_by").references(() => users.id),
        createdAt: timestamp("created_at").notNull().defaultNow(),
    },
    (t) => [index("context_items_ctx_idx").on(t.contextId)],
);

// ONE vector store for every retrievable text: context items and conversation memory side by side.
// refId points at a context_item or a chat_message; no FK since it spans two parents — the core
// deletes chunks with their parent.
export const chunks = pgTable(
    "chunks",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        workspaceId: uuid("workspace_id")
            .notNull()
            .references(() => workspaces.id),
        scope: text("scope").notNull(), // "context" | "chat"
        refId: uuid("ref_id").notNull(),
        seq: integer("seq").notNull(),
        text: text("text").notNull(),
        embedding: vector("embedding", { dimensions: 768 }).notNull(),
        createdAt: timestamp("created_at").notNull().defaultNow(),
    },
    (t) => [
        index("chunks_embedding_idx").using("hnsw", t.embedding.op("vector_cosine_ops")),
        index("chunks_ws_scope_idx").on(t.workspaceId, t.scope),
        index("chunks_ref_idx").on(t.refId),
    ],
);

// the chat thread's durable record; rows chunk into `chunks` (scope "chat") for recall
export const chatMessages = pgTable(
    "chat_messages",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        workspaceId: uuid("workspace_id")
            .notNull()
            .references(() => workspaces.id),
        artifactId: uuid("artifact_id"), // no FK: chat runs against drafts that may never persist
        role: text("role").notNull(), // "user" | "assistant"
        text: text("text").notNull(),
        createdAt: timestamp("created_at").notNull().defaultNow(),
    },
    (t) => [index("chat_messages_ws_art_idx").on(t.workspaceId, t.artifactId, t.createdAt.desc())],
);

// A traced generation: the run's config, every model call it made, and what it cost. Written only
// when a run asks to be traced, so this never grows on ordinary user turns.
export const evalRuns = pgTable(
    "eval_runs",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        workspaceId: uuid("workspace_id")
            .notNull()
            .references(() => workspaces.id),
        userId: uuid("user_id").references(() => users.id),
        // one authoring session; the studio's turns fold into a single run
        sessionId: text("session_id"),
        artifactId: uuid("artifact_id"), // no FK: a run may be abandoned before the draft is saved
        config: jsonb("config").$type<EvalConfig>().notNull(),
        spans: jsonb("spans").$type<ModelSpan[]>().notNull(),
        checks: jsonb("checks").$type<EvalCheck[]>(),
        content: jsonb("content").$type<ArtifactContent>(),
        judgements: jsonb("judgements").$type<EvalJudgement[]>(),
        status: text("status").$type<EvalStatus>().notNull(),
        error: text("error"),
        tokensIn: integer("tokens_in").notNull(),
        tokensOut: integer("tokens_out").notNull(),
        credits: integer("credits").notNull(),
        ms: integer("ms").notNull(),
        createdAt: timestamp("created_at").notNull().defaultNow(),
    },
    (t) => [index("eval_runs_ws_created_idx").on(t.workspaceId, t.createdAt.desc())],
);

// Voices we can speak with. Adoption is install-wide rather than per workspace: a community voice is
// unusable until it has been added to the calling ElevenLabs account, that add is rate-limited per
// month on the one account serving every workspace, and adopting the same popular voice per tenant
// would spend the allowance on duplicates. Keyed on external_id so the add happens at most once.
export const voices = pgTable(
    "voices",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        externalId: text("external_id").notNull().unique(), // what THIS account speaks with
        // The community id we adopted from, which the add may exchange for a different account-local
        // one. Dedup keys on this, not on external_id: a caller holds the community id, so keying on
        // the id we got back would miss the cache and spend the monthly add budget twice.
        // Unique, but nullable: Postgres treats NULLs as distinct, so every designed voice (which has
        // no community origin) coexists while no community voice is ever adopted twice.
        libraryId: text("library_id").unique(),
        source: text("source").notNull(), // library | designed | seeded
        ownerId: text("owner_id"), // library only: the public_owner_id the add needed
        name: text("name").notNull(),
        description: text("description"),
        labels: jsonb("labels").$type<VoiceLabels>(),
        previewUrl: text("preview_url"), // library: the provider's own free sample
        previewData: text("preview_data"), // designed: base64, since a designed voice has no url
        adoptedAt: timestamp("adopted_at").notNull().defaultNow(),
    },
    (t) => [index("voices_source_idx").on(t.source)],
);

/**
 * A workspace's music shelf, the same shape its voice shelf has and for the same reason: the catalog
 * row is shared (a house preset belongs to the deployment), so what a workspace did with one, named
 * it, made it the default, is a fact about the pairing rather than about the bed.
 */
export const workspaceSoundtracks = pgTable(
    "workspace_soundtracks",
    {
        workspaceId: uuid("workspace_id")
            .notNull()
            .references(() => workspaces.id, { onDelete: "cascade" }),
        soundtrackId: uuid("soundtrack_id")
            .notNull()
            .references(() => soundtracks.id, { onDelete: "cascade" }),
        name: text("name"), // a per-workspace rename, e.g. "Our opener"
        isDefault: boolean("is_default").notNull().default(false),
        addedAt: timestamp("added_at").notNull().defaultNow(),
    },
    (t) => [
        primaryKey({ columns: [t.workspaceId, t.soundtrackId] }),
        // exactly one default per workspace, enforced by the database rather than by the UI
        uniqueIndex("workspace_soundtracks_default_key")
            .on(t.workspaceId)
            .where(sql`${t.isDefault}`),
    ],
);

// The shelf: which voices a workspace has saved, and which one narrates by default.
export const workspaceVoices = pgTable(
    "workspace_voices",
    {
        workspaceId: uuid("workspace_id")
            .notNull()
            .references(() => workspaces.id, { onDelete: "cascade" }),
        voiceId: uuid("voice_id")
            .notNull()
            .references(() => voices.id, { onDelete: "cascade" }),
        name: text("name"), // a per-workspace rename, e.g. "Our narrator"
        isDefault: boolean("is_default").notNull().default(false),
        addedAt: timestamp("added_at").notNull().defaultNow(),
    },
    (t) => [
        primaryKey({ columns: [t.workspaceId, t.voiceId] }),
        // exactly one default per workspace, enforced by the database rather than by the UI
        uniqueIndex("workspace_voices_default_key")
            .on(t.workspaceId)
            .where(sql`${t.isDefault}`),
    ],
);

// Narration audio, cached per section and keyed by the text that produced it. Derived, not an asset:
// it is regenerated from the notes at any time, so it never counts against the storage cap and never
// appears in the media picker.
export const narrations = pgTable(
    "narrations",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        artifactId: uuid("artifact_id")
            .notNull()
            .references(() => artifacts.id, { onDelete: "cascade" }),
        sectionId: text("section_id").notNull(),
        hash: text("hash").notNull(), // sha256(spoken + voice + model + format)
        voiceId: text("voice_id").notNull(), // the provider id that actually spoke
        modelId: text("model_id").notNull(),
        mime: text("mime").notNull(),
        data: text("data").notNull(), // base64 bytes, as assets.data already does
        bytes: bigint("bytes", { mode: "number" }).notNull(),
        ms: integer("ms").notNull(), // measured duration; what auto-advance is timed from
        alignment: jsonb("alignment").$type<SpeechAlignment>(),
        chars: integer("chars").notNull(), // what we billed
        createdAt: timestamp("created_at").notNull().defaultNow(),
    },
    (t) => [
        uniqueIndex("narrations_section_hash_key").on(t.artifactId, t.sectionId, t.hash),
        index("narrations_artifact_idx").on(t.artifactId),
    ],
);

// Galleo as an OAuth 2.1 authorization server, for the MCP endpoint. Distinct from `oauthAccounts`,
// which is the opposite direction: Galleo as a client of Google.
export const oauthClients = pgTable("oauth_clients", {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: text("client_id").notNull().unique(),
    name: text("name").notNull(),
    redirectUris: jsonb("redirect_uris").$type<string[]>().notNull(),
    // dynamic (RFC 7591) | metadata (client id metadata document) | static (pre-registered)
    // | machine (an integration credential, which authenticates with a secret and has no browser)
    source: text("source").notNull(),
    // Machine clients only. A browser flow learns who the person is by asking them; a machine has
    // nobody to ask, so the workspace it acts in and the member it acts as are fixed at issue and
    // the ledger has a real user to attribute to rather than a synthetic one.
    secretHash: text("secret_hash"),
    workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }),
    actorId: uuid("actor_id").references(() => users.id),
    revokedAt: timestamp("revoked_at"),
    lastUsedAt: timestamp("last_used_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
});

// One row per authorization code. Single use: `consumedAt` makes a replay visible rather than only
// impossible, and the granted workspaces ride along so the token inherits what the consent screen said.
export const oauthAuthorizations = pgTable(
    "oauth_authorizations",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        codeHash: text("code_hash").notNull().unique(),
        clientId: text("client_id").notNull(),
        userId: uuid("user_id")
            .notNull()
            .references(() => users.id),
        workspaceIds: jsonb("workspace_ids").$type<string[]>().notNull(),
        defaultWorkspaceId: uuid("default_workspace_id").notNull(),
        scopes: jsonb("scopes").$type<string[]>().notNull(),
        resource: text("resource").notNull(),
        codeChallenge: text("code_challenge").notNull(),
        redirectUri: text("redirect_uri").notNull(),
        expiresAt: timestamp("expires_at").notNull(),
        consumedAt: timestamp("consumed_at"),
        createdAt: timestamp("created_at").notNull().defaultNow(),
    },
    (t) => [index("oauth_authorizations_user_idx").on(t.userId)],
);

// Revoked by timestamp rather than deleted, so a credential that was used stays explainable.
export const oauthTokens = pgTable(
    "oauth_tokens",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        clientId: text("client_id").notNull(),
        userId: uuid("user_id")
            .notNull()
            .references(() => users.id),
        workspaceIds: jsonb("workspace_ids").$type<string[]>().notNull(),
        defaultWorkspaceId: uuid("default_workspace_id").notNull(),
        scopes: jsonb("scopes").$type<string[]>().notNull(),
        // One consent, however many rotations later. Presenting a refresh token that was already
        // spent means the credential leaked, so the whole family dies rather than that one row.
        familyId: uuid("family_id").notNull().defaultRandom(),
        // the audience this token was minted for, carried from the authorization it came from
        resource: text("resource").notNull().default(""),
        accessHash: text("access_hash").notNull().unique(),
        refreshHash: text("refresh_hash").unique(),
        expiresAt: timestamp("expires_at").notNull(),
        revokedAt: timestamp("revoked_at"),
        lastUsedAt: timestamp("last_used_at"),
        createdAt: timestamp("created_at").notNull().defaultNow(),
    },
    (t) => [
        index("oauth_tokens_user_idx").on(t.userId),
        index("oauth_tokens_family_idx").on(t.familyId),
    ],
);

// Instrumental beds, cached by what produced them. Two kinds of row in one table because they are
// the same thing with different owners: a preset is generated once for the install and shared by
// every workspace, a custom bed belongs to one artifact and dies with it.
export const soundtracks = pgTable(
    "soundtracks",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        source: text("source").notNull(), // preset | workspace | custom
        preset: text("preset"), // the preset's stable id; null on a custom bed
        artifactId: uuid("artifact_id").references(() => artifacts.id, { onDelete: "cascade" }),
        // set on a `workspace` bed: composed from a description someone typed, and reusable
        workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }),
        prompt: text("prompt").notNull(), // what produced it, so a listener can see why it sounds so
        hash: text("hash").notNull(), // sha256(prompt + length + model + format)
        modelId: text("model_id").notNull(),
        mime: text("mime").notNull(),
        data: text("data").notNull(), // base64, as narrations and assets already do
        bytes: bigint("bytes", { mode: "number" }).notNull(),
        ms: integer("ms").notNull(),
        createdAt: timestamp("created_at").notNull().defaultNow(),
    },
    (t) => [
        // one row per preset for the whole deployment, which is what makes the common case free.
        // Unpredicated on purpose: NULLs are distinct, so custom rows never collide here, and a
        // partial index cannot be an ON CONFLICT target without repeating its predicate.
        uniqueIndex("soundtracks_preset_key").on(t.preset),
        uniqueIndex("soundtracks_artifact_key").on(t.artifactId, t.hash),
        index("soundtracks_artifact_idx").on(t.artifactId),
    ],
);

export const schema = {
    users,
    oauthAccounts,
    authTokens,
    workspaces,
    members,
    invites,
    folders,
    artifacts,
    artifactGrants,
    visits,
    comments,
    themes,
    assets,
    artifactAssets,
    links,
    linkRecipients,
    linkViews,
    credits,
    contexts,
    contextItems,
    chunks,
    chatMessages,
    evalRuns,
    voices,
    workspaceVoices,
    workspaceSoundtracks,
    narrations,
    oauthClients,
    oauthAuthorizations,
    oauthTokens,
    soundtracks,
};
