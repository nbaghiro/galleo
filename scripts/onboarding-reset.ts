import "dotenv/config";
import { eq } from "drizzle-orm";
import { and, count, isNull } from "drizzle-orm";
import { db } from "@services/db/client";
import { schema } from "@services/db/schema";
import { makeSession, SESSION_COOKIE } from "@services/utils/auth";

/**
 * Put an account back to its first-run state so the onboarding flow can be walked again.
 *
 *   pnpm onboarding:reset                     demo@galleo.app
 *   pnpm onboarding:reset you@example.com
 *
 * Clears prefs.onboarding through the product's own PATCH /me/prefs rather than by writing the column,
 * so it exercises mergeUserPrefs the same way the app does and cannot store a shape the reader would
 * reject. Needs `pnpm api` running.
 *
 * It does NOT delete artifacts. `needed` is `no recorded format answer AND an empty workspace`, so if
 * the active workspace still holds anything this prints what is in the way and leaves it alone: which
 * artifacts to trash is a judgement call, and a dev script should not make it for you.
 */

const API = process.env.PROBE_API ?? "http://localhost:8601";
const email = process.argv[2] ?? "demo@galleo.app";
const out = (s: string): void => {
    process.stdout.write(`${s}\n`);
};

async function main(): Promise<void> {
    const [user] = await db
        .select({
            id: schema.users.id,
            email: schema.users.email,
            wsId: schema.users.activeWorkspaceId,
        })
        .from(schema.users)
        .where(eq(schema.users.email, email));
    if (!user) {
        out(`no account for ${email}`);
        process.exit(1);
    }

    const cookie = `${SESSION_COOKIE}=${makeSession(user.id)}`;
    const res = await fetch(`${API}/api/me/prefs`, {
        method: "PATCH",
        headers: { Cookie: cookie, "Content-Type": "application/json" },
        body: JSON.stringify({ onboarding: null }),
    }).catch(() => null);
    if (!res || !res.ok) {
        out(
            `could not clear prefs (${res ? `HTTP ${res.status}` : "API unreachable"}); is pnpm api running?`,
        );
        process.exit(1);
    }
    out(`cleared prefs.onboarding for ${user.email}`);

    if (!user.wsId) {
        out("no active workspace, so nothing else to check");
        return;
    }
    const [ws] = await db
        .select({ name: schema.workspaces.name })
        .from(schema.workspaces)
        .where(eq(schema.workspaces.id, user.wsId));
    const [live] = await db
        .select({ n: count() })
        .from(schema.artifacts)
        .where(
            and(eq(schema.artifacts.workspaceId, user.wsId), isNull(schema.artifacts.trashedAt)),
        );
    const n = Number(live?.n ?? 0);

    out(`active workspace: ${ws?.name ?? user.wsId} · ${n} live artifact(s)`);
    out(
        n === 0
            ? "ready: opening the library will redirect to /welcome"
            : `not ready: trash those ${n} artifact(s), or switch to an empty workspace, then reload`,
    );
}

main()
    .then(() => process.exit(0))
    .catch((e: unknown) => {
        process.stderr.write(`${String(e)}\n`);
        process.exit(1);
    });
