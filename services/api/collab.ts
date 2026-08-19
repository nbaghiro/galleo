import { Hono } from "hono";
import type { UpgradeWebSocket, WSContext, WSEvents } from "hono/ws";
import { randomUUID } from "node:crypto";
import type { ServerMessage } from "@model/collab";
import { readClientMessage } from "@model/collab";
import type { User } from "@model/workspace";
import { isSectionOp } from "@services/core/artifacts";
import { closeIfEmpty, roomFor, type RoomConnection } from "@services/core/collab";
import type { ArtifactStanding } from "@services/core/collaborators";
import { gateShared, isResponse, requireUser, type AuthedEnv } from "./middleware";

// The socket surface. Everything above the transport is in core/collab.ts, so this file only
// authenticates the upgrade, turns frames into messages, and hands them to the room.
//
// A frame is untrusted input under the same rule as a request body: it is read through the model's
// guard and dropped when it does not match, never cast.

/** Bigger than any single section batch, small enough that a hostile client cannot buffer us out. */
const MAX_FRAME_BYTES = 1_000_000;
/** Cursor traffic runs at about 30Hz, so this is a wide margin over the honest ceiling. */
const MAX_FRAMES_PER_WINDOW = 240;
const RATE_WINDOW_MS = 1_000;

// A factory rather than a module-level router: `createNodeWebSocket` needs the app it is upgrading
// on, and the app is built in server.ts. The composition stays in the one entry point that is
// allowed to have it.
export function collabRouter(upgradeWebSocket: UpgradeWebSocket): Hono<AuthedEnv> {
    const collab = new Hono<AuthedEnv>();

    // Auth and the artifact gate run before the upgrade, so a caller with no access gets an ordinary
    // 401/403/404 rather than a socket that closes on them a moment later. The gate's result is
    // handed to the upgrade through the closure rather than the context bag, which is untyped there.
    collab.get("/artifacts/:id/collab", requireUser, async (c, next) => {
        const gate = await gateShared(c, c.req.param("id"), "view");
        if (isResponse(gate)) return gate;
        return upgradeWebSocket(() => eventsFor(gate, c.get("user")))(c, next);
    });

    return collab;
}

function eventsFor(standing: ArtifactStanding, user: User): WSEvents {
    const connId = randomUUID();
    const room = roomFor(
        { artifactId: standing.artifact.id, workspaceId: standing.ws.id },
        standing.artifact.seq,
    );
    let frames = 0;
    let windowAt = 0;
    let joined = false;

    const connFor = (ws: WSContext): RoomConnection => ({
        send: (msg: ServerMessage) => ws.send(JSON.stringify(msg)),
        close: () => ws.close(),
    });

    const overRate = (): boolean => {
        const now = Date.now();
        if (now - windowAt > RATE_WINDOW_MS) {
            windowAt = now;
            frames = 0;
        }
        frames += 1;
        return frames > MAX_FRAMES_PER_WINDOW;
    };

    const part = (): void => {
        if (!joined) return;
        joined = false;
        room.leave(connId);
        closeIfEmpty(standing.artifact.id);
    };

    return {
        onOpen: (_evt, ws) => {
            joined = true;
            room.join({
                connId,
                user: { id: user.id, name: user.name, avatarUrl: user.avatarUrl },
                access: standing.access,
                conn: connFor(ws),
            });
        },
        onMessage: (evt, ws) => {
            if (typeof evt.data !== "string" || evt.data.length > MAX_FRAME_BYTES) return;
            if (overRate()) {
                ws.close();
                part();
                return;
            }
            let raw: unknown;
            try {
                raw = JSON.parse(evt.data);
            } catch {
                return; // a frame that is not JSON is not a message
            }
            const msg = readClientMessage(raw, isSectionOp);
            if (msg) room.handle(connId, msg);
        },
        onClose: part,
        onError: part,
    };
}
