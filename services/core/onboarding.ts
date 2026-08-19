import { and, asc, count, eq, isNotNull, isNull } from "drizzle-orm";
import { db } from "@services/db/client";
import { schema } from "@services/db/schema";
import { SIGNUP_GRANT_CREDITS } from "@model/billing";
import type { OnboardingState, OnboardingStep } from "@model/workspace";
import { readUserPrefs } from "@model/workspace";
import { grantOnce } from "./ledger";

// The first session: the one-time signup grant, and the activation checklist.
//
// The checklist is DERIVED from rows on every read rather than stored as four booleans. That keeps it
// right for accounts that predate it, makes it impossible to drift from what the workspace actually
// contains, and means no write path has to remember to tick anything. Only the two things we cannot
// recompute live in users.prefs: the format answer and the dismissal.

const signupKey = (userId: string): string => `signup:${userId}`;

/**
 * One grant per USER, ever, keyed on the user id rather than the workspace. A user can own several
 * workspaces, so keying on the workspace would pay the grant again for every one they create; the
 * credits.key column is unique, so this key makes a second attempt a no-op at the database.
 *
 * Released on verification rather than at signup: it gives email verification a job it otherwise does
 * not have and puts the cheapest abuse behind a real mailbox. The monthly allowance already landed
 * when the workspace opened, so an unverified account is ungranted, never blocked.
 *
 * Returns whether this call is the one that paid it, so a caller can report honestly.
 */
export async function releaseSignupGrant(userId: string): Promise<boolean> {
    return db.transaction(async (tx) => {
        const [first] = await tx
            .select({
                id: schema.workspaces.id,
                aiCreditsBalance: schema.workspaces.aiCreditsBalance,
            })
            .from(schema.workspaces)
            .where(eq(schema.workspaces.ownerId, userId))
            .orderBy(asc(schema.workspaces.createdAt))
            .limit(1)
            .for("update");
        if (!first) return false; // owns nothing yet: nothing to grant against
        return grantOnce(tx, first, {
            key: signupKey(userId),
            delta: SIGNUP_GRANT_CREDITS,
            reason: "signup-grant",
        });
    });
}

/**
 * Every step answered from rows the product already writes.
 *
 * `theme` counts a workspace theme rather than an artifact's theme id, because picking one of the
 * built-in themes is a two-click browse and authoring one is the act we actually want to see.
 */
export async function onboardingState(
    workspaceId: string,
    userId: string,
    prefsRaw: unknown,
): Promise<OnboardingState> {
    const prefs = readUserPrefs(prefsRaw).onboarding;
    const live = and(
        eq(schema.artifacts.workspaceId, workspaceId),
        isNull(schema.artifacts.trashedAt),
    );

    const [[made], [withAi], [themed], [sent], [granted]] = await Promise.all([
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
        db
            .select({ n: count() })
            .from(schema.credits)
            .where(eq(schema.credits.key, signupKey(userId))),
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
        grantReleased: Number(granted?.n ?? 0) > 0,
    };
}
