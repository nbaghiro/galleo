import { Hono } from "hono";
import { sql } from "drizzle-orm";
import { db, schema } from "../schema";
import { SESSION_COOKIE, hashPassword, makeSession } from "../auth";
import { session } from "../api/session";
import { artifacts } from "../api/artifacts";
import { folders } from "../api/folders";
import { themes } from "../api/themes";
import { templates } from "../api/templates";
import { billing } from "../api/billing";
import { features } from "../api/features";
import { media } from "../api/media";
import { ai } from "../api/ai";
import { links } from "../api/links";

// Integration test harness (see .docs/test-integration-plan.md). A test build of the API app — mirrors
// services/server.ts's router mounting, minus the network listener — plus DB reset + fixture + request
// helpers. Everything (SQL, auth, validation, gating, shaping) runs for real against `galleo_test`; only
// the external services (LLM/Stripe/mail/clock) get faked per test.

// Kept in sync with server.ts's router list by hand — a router added there is added here.
export const app = new Hono();
for (const r of [
    session,
    artifacts,
    folders,
    themes,
    templates,
    billing,
    features,
    media,
    ai,
    links,
])
    app.route("/", r);

// Drive a route with no network listener (Hono's in-process request).
export const request = (path: string, init?: RequestInit): Promise<Response> =>
    Promise.resolve(app.request(path, init));

// Same, carrying a valid session cookie for `userId`.
export const authed = (userId: string, path: string, init: RequestInit = {}): Promise<Response> => {
    const headers = new Headers(init.headers);
    headers.set("Cookie", `${SESSION_COOKIE}=${makeSession(userId)}`);
    return Promise.resolve(app.request(path, { ...init, headers }));
};

// JSON POST/PATCH body + header in one place.
export const jsonInit = (method: string, body: unknown): RequestInit => ({
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
});

// Truncate every public table (CASCADE) — full isolation between tests without per-table wiring.
export async function resetDb(): Promise<void> {
    const rows = (await db.execute(
        sql`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`,
    )) as unknown as Array<{ tablename: string }>;
    const names = rows.map((r) => `"${r.tablename}"`);
    if (names.length)
        await db.execute(sql.raw(`TRUNCATE ${names.join(", ")} RESTART IDENTITY CASCADE`));
}

let seq = 0;

// Seed a session-ready user + workspace + membership. Returns the ids + a ready Cookie header value.
export async function seedUser(opts: { plan?: string; password?: string } = {}): Promise<{
    userId: string;
    workspaceId: string;
    email: string;
    password: string;
    cookie: string;
}> {
    seq += 1;
    const email = `u${seq}@test.local`;
    const password = opts.password ?? "pw-12345678";
    const [u] = await db
        .insert(schema.users)
        .values({ email, passwordHash: hashPassword(password) })
        .returning();
    const [w] = await db
        .insert(schema.workspaces)
        .values({ name: "Test WS", slug: `ws-${seq}`, ownerId: u!.id, plan: opts.plan ?? "free" })
        .returning();
    await db.insert(schema.members).values({ workspaceId: w!.id, userId: u!.id, role: "owner" });
    return {
        userId: u!.id,
        workspaceId: w!.id,
        email,
        password,
        cookie: `${SESSION_COOKIE}=${makeSession(u!.id)}`,
    };
}
