import { Hono } from "hono";
import { z } from "zod";
import { featuresFor } from "@model/billing";
import { BAD_BODY, readJson } from "@services/utils/http";
import { warn } from "@services/utils/env";
import { googleDriveToken } from "@services/core/accounts";
import { driveUploadPresentation } from "@services/core/google";
import { requireWorkspace, type WorkspaceEnv } from "./middleware";

export const google = new Hono<WorkspaceEnv>();

// the client reads 428 as "run the connect popup, then retry"; every other failure is terminal
const NEEDS_CONNECT = { error: "Connect Google Drive to continue.", reason: "google" } as const;

// raster decks run a few hundred KB per slide; 60MB of pptx ≈ 80MB base64
const MAX_B64 = 84_000_000;

const zSlides = z.object({
    data: z.string().min(1).max(MAX_B64), // base64 pptx bytes
    name: z.string().optional(),
});

google.post("/google/slides", requireWorkspace, async (c) => {
    const ws = c.get("ws");
    if (!featuresFor(ws).exportFormats.includes("slides"))
        return c.json(
            { error: "Google Slides export needs a paid plan.", reason: "feature", upgrade: true },
            402,
        );
    const body = await readJson(c, zSlides);
    if (!body) return c.json(BAD_BODY, 400);

    const token = await googleDriveToken(c.get("user").id);
    if (token.state !== "ok") return c.json(NEEDS_CONNECT, 428);

    let bytes: Buffer;
    try {
        bytes = Buffer.from(body.data, "base64");
    } catch {
        return c.json(BAD_BODY, 400);
    }
    if (bytes.byteLength === 0) return c.json(BAD_BODY, 400);

    const name = (body.name ?? "").trim().slice(0, 200) || "Galleo deck";
    const up = await driveUploadPresentation(token.token, name, new Uint8Array(bytes));
    if ("error" in up) {
        if (up.error === "unauthorized") return c.json(NEEDS_CONNECT, 428);
        warn(`drive upload failed: ${up.detail ?? "unknown"}`);
        return c.json({ error: "The upload to Google Drive failed. Try again." }, 502);
    }
    return c.json({ url: up.url });
});
