import { and, eq } from "drizzle-orm";
import type { ThemeInput, Tokens } from "@themes";
import { db } from "@services/db/client";
import { schema } from "@services/db/schema";

// Per-workspace custom themes; the built-in library lives in code (@themes).

const themeCols = {
    id: schema.themes.id,
    name: schema.themes.name,
    tokens: schema.themes.tokens,
    mood: schema.themes.mood,
    isDark: schema.themes.isDark,
};

export type CustomTheme = { [K in keyof typeof themeCols]: (typeof schema.themes.$inferSelect)[K] };

// artifacts.theme_id holds either a built-in's slug or a custom row's uuid, and themes.id is a uuid
// column, so asking it about "studio" is a Postgres error rather than an empty result
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The custom theme an artifact's `themeId` names, or null when it names a built-in. */
export async function themeById(themeId: string): Promise<CustomTheme | null> {
    if (!UUID_RE.test(themeId)) return null;
    const [t] = await db.select(themeCols).from(schema.themes).where(eq(schema.themes.id, themeId));
    return t ?? null;
}

export function listThemes(workspaceId: string): Promise<CustomTheme[]> {
    return db
        .select(themeCols)
        .from(schema.themes)
        .where(eq(schema.themes.workspaceId, workspaceId));
}

// Only the palette is required; every other field defaults below, so the signature says so rather
// than making the caller invent a name and a mood to satisfy the type.
export async function createTheme(
    workspaceId: string,
    input: Partial<ThemeInput> & { tokens: Tokens },
): Promise<CustomTheme | undefined> {
    const [t] = await db
        .insert(schema.themes)
        .values({
            workspaceId,
            name: (input.name ?? "Custom theme").trim() || "Custom theme",
            tokens: input.tokens,
            mood: input.mood ?? null,
            isDark: input.isDark ?? false,
        })
        .returning(themeCols);
    return t;
}

// Only the keys actually present are written, so a partial patch cannot blank the rest.
export async function updateTheme(
    workspaceId: string,
    id: string,
    input: Partial<ThemeInput>,
): Promise<CustomTheme | null> {
    const patch: Record<string, unknown> = {};
    if (input.name !== undefined) patch.name = input.name;
    if (input.tokens !== undefined) patch.tokens = input.tokens;
    if (input.mood !== undefined) patch.mood = input.mood;
    if (input.isDark !== undefined) patch.isDark = input.isDark;
    const [t] = await db
        .update(schema.themes)
        .set(patch)
        .where(and(eq(schema.themes.id, id), eq(schema.themes.workspaceId, workspaceId)))
        .returning(themeCols);
    return t ?? null;
}

export async function deleteTheme(workspaceId: string, id: string): Promise<void> {
    await db
        .delete(schema.themes)
        .where(and(eq(schema.themes.id, id), eq(schema.themes.workspaceId, workspaceId)));
}
