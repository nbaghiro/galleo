import { and, count, eq, isNotNull, isNull } from "drizzle-orm";
import { db } from "@services/db/client";
import { schema } from "@services/db/schema";
import type { OnboardingState, OnboardingStep } from "@model/workspace";
import { readUserPrefs } from "@model/workspace";

// The first session: the activation checklist.
//
// The checklist is DERIVED from rows on every read rather than stored as four booleans. That keeps it
// right for accounts that predate it, makes it impossible to drift from what the workspace actually
// contains, and means no write path has to remember to tick anything. Only the two things we cannot
// recompute live in users.prefs: the format answer and the dismissal.

/**
 * Every step answered from rows the product already writes.
 *
 * `theme` counts a workspace theme rather than an artifact's theme id, because picking one of the
 * built-in themes is a two-click browse and authoring one is the act we actually want to see.
 */
export async function onboardingState(
    workspaceId: string,
    prefsRaw: unknown,
): Promise<OnboardingState> {
    const prefs = readUserPrefs(prefsRaw).onboarding;
    const live = and(
        eq(schema.artifacts.workspaceId, workspaceId),
        isNull(schema.artifacts.trashedAt),
    );

    const [[made], [withAi], [themed], [sent]] = await Promise.all([
        db.select({ n: count() }).from(schema.artifacts).where(live),
        db
            .select({ n: count() })
            .from(schema.artifacts)
            .where(and(live, isNotNull(schema.artifacts.aiMeta))),
        db
            .select({ n: count() })
            .from(schema.themes)
            .where(eq(schema.themes.workspaceId, workspaceId)),
        db
            .select({ n: count() })
            .from(schema.links)
            .innerJoin(schema.artifacts, eq(schema.links.artifactId, schema.artifacts.id))
            .where(eq(schema.artifacts.workspaceId, workspaceId)),
    ]);

    const artifacts = Number(made?.n ?? 0);
    const done: OnboardingStep[] = [];
    if (artifacts > 0) done.push("make");
    if (Number(withAi?.n ?? 0) > 0) done.push("ai");
    if (Number(themed?.n ?? 0) > 0) done.push("theme");
    if (Number(sent?.n ?? 0) > 0) done.push("send");

    return {
        needed: !prefs?.startedAt && artifacts === 0,
        done,
        dismissed: prefs?.dismissed === true,
        format: prefs?.format,
    };
}
