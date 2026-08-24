import { Hono } from "hono";
import { db } from "@services/db/client";
import { freshCreditWindow } from "@services/core/ledger";
import { schema } from "@services/db/schema";
export { resetDb } from "./reset-db";
import { SESSION_COOKIE, hashPassword, makeSession } from "@services/utils/auth";
import { session } from "@services/api/session";
import { account } from "@services/api/account";
import { oauth } from "@services/api/oauth";
import { workspace } from "@services/api/workspace";
import { artifacts } from "@services/api/artifacts";
import { comments } from "@services/api/comments";
import { collaborators } from "@services/api/collaborators";
import { folders } from "@services/api/folders";
import { themes } from "@services/api/themes";
import { templates } from "@services/api/templates";
import { plan } from "@services/api/billing";
import { features } from "@services/api/features";
import { media } from "@services/api/media";
import { ai } from "@services/api/ai";
import { links } from "@services/api/links";
import { narration } from "@services/api/narration";
import { voices } from "@services/api/voices";
import { search } from "@services/api/search";
import { context } from "@services/api/context";
import { onboarding } from "@services/api/onboarding";
import { authorize } from "@services/api/authorize";
import { mcp } from "@services/api/mcp";

// Kept in sync with server.ts's router list by hand.
export const app = new Hono();
app.route("/", session);
app.route("/", account);
app.route("/", oauth);
app.route("/", artifacts);
app.route("/", comments);
app.route("/", collaborators);
app.route("/", folders);
app.route("/", themes);
app.route("/", templates);
app.route("/", plan);
app.route("/", features);
app.route("/", workspace);
app.route("/", media);
app.route("/", ai);
app.route("/", links);
app.route("/", narration);
app.route("/", voices);
app.route("/", search);
app.route("/", context);
app.route("/", onboarding);
app.route("/", authorize);
app.route("/", mcp);

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
        // Verified: a seeded account stands in for an established user, and the sign-in gate would
        // otherwise refuse every one of them. A test that wants the gate builds its own unverified row.
        .values({ email, passwordHash: hashPassword(password), emailVerifiedAt: new Date() })
        .returning();
    const [w] = await db
        .insert(schema.workspaces)
        .values({
            name: "Test WS",
            slug: `ws-${seq}`,
            ownerId: u!.id,
            plan: opts.plan ?? "free",
            ...freshCreditWindow(),
        })
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
