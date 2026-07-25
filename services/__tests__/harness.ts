import { Hono } from "hono";
import { db, schema } from "../schema";
export { resetDb } from "./reset-db";
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

// Kept in sync with server.ts's router list by hand.
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

export const request = (path: string, init?: RequestInit): Promise<Response> =>
    Promise.resolve(app.request(path, init));

export const authed = (userId: string, path: string, init: RequestInit = {}): Promise<Response> => {
    const headers = new Headers(init.headers);
    headers.set("Cookie", `${SESSION_COOKIE}=${makeSession(userId)}`);
    return Promise.resolve(app.request(path, { ...init, headers }));
};

export const jsonInit = (method: string, body: unknown): RequestInit => ({
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
});

let seq = 0;

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
