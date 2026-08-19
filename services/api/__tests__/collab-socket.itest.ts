import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { defineWebSocketHelper, WSContext, type WSEvents } from "hono/ws";
import type { ServerMessage } from "@model/collab";
import { db } from "@services/db/client";
import { schema } from "@services/db/schema";
import { SESSION_COOKIE, makeSession } from "@services/utils/auth";
import { collabRouter } from "@services/api/collab";
import { seedUser } from "@services/__tests__/harness";

// The upgrade path with a stand-in transport: `defineWebSocketHelper` is Hono's own way to build an
// UpgradeWebSocket, so the route is exercised exactly as it runs in the server, minus the socket.

let events: WSEvents | null = null;

// 101 is not constructible through the Response initializer, so the stand-in answers 200 with a
// marker: what is under test is the route's gate, not the transport's status line.
const UPGRADED = "x-upgraded";

// Node 22 (what CI and Render both run) has no CloseEvent global; it landed in 23. The handler
// never reads the event, so a minimal Event subclass carrying the three extra fields stands in.
class TestCloseEvent extends Event {
    readonly code = 1000;
    readonly reason = "";
    readonly wasClean = true;
}
const upgrade = defineWebSocketHelper((_c, evts) => {
    events = evts;
    return new Response(null, { status: 200, headers: { [UPGRADED]: "1" } });
});

const app = new Hono();
app.route("/", collabRouter(upgrade));

const call = (userId: string | null, path: string): Promise<Response> =>
    Promise.resolve(
        app.request(
            path,
            userId ? { headers: { Cookie: `${SESSION_COOKIE}=${makeSession(userId)}` } } : {},
        ),
    );

const frames: ServerMessage[] = [];
const socket = (): WSContext =>
    new WSContext({
        readyState: 1,
        send: (data) => {
            if (typeof data === "string") frames.push(JSON.parse(data) as ServerMessage);
        },
        close: () => undefined,
    });

const makeArtifact = async (workspaceId: string, createdBy: string): Promise<string> => {
    const [a] = await db
        .insert(schema.artifacts)
        .values({
            workspaceId,
            createdBy,
            title: "Live deck",
            formatId: "deck",
            themeId: "studio",
            draftContent: {
                format: "deck",
                theme: "studio",
                sections: [{ id: "s1", root: { type: "group", id: "g1", data: { children: [] } } }],
            },
        })
        .returning({ id: schema.artifacts.id });
    return a!.id;
};

let host: Awaited<ReturnType<typeof seedUser>>;
let outsider: Awaited<ReturnType<typeof seedUser>>;
let artifactId: string;

beforeEach(async () => {
    events = null;
    frames.length = 0;
    host = await seedUser();
    outsider = await seedUser();
    artifactId = await makeArtifact(host.workspaceId, host.userId);
});

describe("the collaboration upgrade", () => {
    it("refuses an anonymous caller before any socket exists", async () => {
        const res = await call(null, `/artifacts/${artifactId}/collab`);
        expect(res.status).toBe(401);
        expect(events).toBeNull();
    });

    it("hides an artifact the caller has no access to behind a 404", async () => {
        const res = await call(outsider.userId, `/artifacts/${artifactId}/collab`);
        expect(res.status).toBe(404);
        expect(events).toBeNull();
    });

    it("404s an artifact that does not exist", async () => {
        const res = await call(
            host.userId,
            "/artifacts/00000000-0000-0000-0000-000000000000/collab",
        );
        expect(res.status).toBe(404);
    });

    it("upgrades for someone who may open the artifact, and welcomes them into the room", async () => {
        const res = await call(host.userId, `/artifacts/${artifactId}/collab`);
        expect(res.headers.get(UPGRADED)).toBe("1");
        expect(events).not.toBeNull();
        const ws = socket();
        events?.onOpen?.(new Event("open"), ws);
        const welcome = frames.find((f) => f.t === "welcome");
        expect(welcome).toBeDefined();
        expect(welcome?.t === "welcome" && welcome.self.canEdit).toBe(true);
        events?.onClose?.(new TestCloseEvent("close"), ws);
    });

    it("upgrades an invited collaborator from another workspace, at their granted level", async () => {
        await db.insert(schema.artifactGrants).values({
            artifactId,
            workspaceId: host.workspaceId,
            email: outsider.email,
            userId: outsider.userId,
            access: "comment",
        });
        const res = await call(outsider.userId, `/artifacts/${artifactId}/collab`);
        expect(res.headers.get(UPGRADED)).toBe("1");
        const ws = socket();
        events?.onOpen?.(new Event("open"), ws);
        const welcome = frames.find((f) => f.t === "welcome");
        expect(welcome?.t === "welcome" && welcome.self.canEdit).toBe(false);
        events?.onClose?.(new TestCloseEvent("close"), ws);
    });

    it("ignores a frame that is not JSON, and one the protocol does not know", async () => {
        await call(host.userId, `/artifacts/${artifactId}/collab`);
        const ws = socket();
        events?.onOpen?.(new Event("open"), ws);
        const before = frames.length;
        events?.onMessage?.(new MessageEvent("message", { data: "{{{" }), ws);
        events?.onMessage?.(new MessageEvent("message", { data: '{"t":"nope"}' }), ws);
        expect(frames).toHaveLength(before);
        events?.onClose?.(new TestCloseEvent("close"), ws);
    });

    it("applies a real op batch and acks it with the artifact's new seq", async () => {
        await call(host.userId, `/artifacts/${artifactId}/collab`);
        const ws = socket();
        events?.onOpen?.(new Event("open"), ws);
        events?.onMessage?.(
            new MessageEvent("message", {
                data: JSON.stringify({
                    t: "ops",
                    tag: "t1",
                    ops: [
                        {
                            kind: "set",
                            section: {
                                id: "s1",
                                root: {
                                    type: "group",
                                    id: "g1",
                                    data: {
                                        children: [
                                            { type: "text", id: "e1", data: { text: "live" } },
                                        ],
                                    },
                                },
                            },
                        },
                    ],
                }),
            }),
            ws,
        );
        await new Promise((r) => setTimeout(r, 50));
        const ack = frames.find((f) => f.t === "ack");
        expect(ack?.t === "ack" && ack.seq).toBeGreaterThan(0);
        const [row] = await db
            .select({ seq: schema.artifacts.seq, draftContent: schema.artifacts.draftContent })
            .from(schema.artifacts)
            .where(eq(schema.artifacts.id, artifactId));
        expect(ack?.t === "ack" && ack.seq).toBe(row!.seq);
        expect(JSON.stringify(row!.draftContent)).toContain("live");
        events?.onClose?.(new TestCloseEvent("close"), ws);
    });
});
