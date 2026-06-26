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
} from "drizzle-orm/pg-core";

// v1-core tables. Full 29-table model documented in docs/data-model.md.

export const users = pgTable("users", {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull().unique(),
    name: text("name"),
    avatarUrl: text("avatar_url"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const workspaces = pgTable("workspaces", {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    ownerId: uuid("owner_id")
        .notNull()
        .references(() => users.id),
    plan: text("plan").notNull().default("free"),
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
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const versions = pgTable("versions", {
    id: uuid("id").primaryKey().defaultRandom(),
    artifactId: uuid("artifact_id")
        .notNull()
        .references(() => artifacts.id),
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
    source: text("source").notNull().default("upload"), // upload | ai
    url: text("url").notNull(),
    width: integer("width"),
    height: integer("height"),
    bytes: bigint("bytes", { mode: "number" }),
    alt: text("alt"),
    meta: jsonb("meta"),
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

export const links = pgTable("links", {
    id: uuid("id").primaryKey().defaultRandom(),
    artifactId: uuid("artifact_id")
        .notNull()
        .references(() => artifacts.id),
    slug: text("slug").notNull().unique(),
    visibility: text("visibility").notNull().default("private"),
    password: text("password"),
    publishedVersionId: uuid("published_version_id").references(() => versions.id),
    createdAt: timestamp("created_at").notNull().defaultNow(),
});

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
