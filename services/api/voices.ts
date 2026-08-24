import { Hono } from "hono";
import { z } from "zod";
import type { VoiceQuery } from "@model/speech";
import { requireWorkspace, type WorkspaceEnv } from "./middleware";
import { featuresFor } from "@model/billing";
import {
    adopt,
    design,
    keepDesigned,
    makeDefault,
    renameShelved,
    searchLibrary,
    shelfFor,
    shelve,
    unshelve,
    VoiceError,
    voiceFor,
} from "@services/core/voices";
import { synthesize } from "@services/core/ai/speech";
import { ratesFor, reserve } from "@services/core/spend";
import { OUT_OF_CREDITS, OVER_MEMBER_CAP, rateLimit, readJson } from "@services/utils/http";
import type { WorkspaceRow } from "@services/core/accounts";

// The voice surface: browsing the provider's community library, saving to a workspace's shelf, and
// hearing a candidate read a real line. Adoption and the shelf rules are core/voices.ts; synthesis
// is core/ai/speech.ts. This file is HTTP only.

export const voices = new Hono<WorkspaceEnv>();

const denied = (ws: WorkspaceRow, held: { remaining: number; capped?: number }) =>
    held.capped == null
        ? OUT_OF_CREDITS(ws, held.remaining)
        : OVER_MEMBER_CAP(held.capped, held.remaining);

const fail = (e: unknown): { error: string; status: 402 | 502 | 503 } =>
    e instanceof VoiceError
        ? { error: e.message, status: e.status }
        : { error: "the voice service failed", status: 502 };

// browsing costs us nothing and returns provider-hosted previews, so it is unmetered and only
// rate-limited, the same shape /media/search already has
const browseLimiter = rateLimit({ name: "voice-library", limit: 40, windowMs: 60_000 });

voices.get("/voices", requireWorkspace, async (c) =>
    c.json({ voices: await shelfFor(c.get("ws").id) }),
);

voices.get("/voices/library", requireWorkspace, browseLimiter, async (c) => {
    const q: VoiceQuery = {
        search: c.req.query("search"),
        gender: c.req.query("gender"),
        age: c.req.query("age"),
        accent: c.req.query("accent"),
        language: c.req.query("language"),
        useCase: c.req.query("useCase"),
        descriptive: c.req.query("descriptive"),
        page: Number(c.req.query("page")) || undefined,
    };
    try {
        return c.json({ voices: await searchLibrary(q) });
    } catch (e) {
        const f = fail(e);
        return c.json({ error: f.error }, f.status);
    }
});

const zSave = z.object({
    externalId: z.string(),
    ownerId: z.string(),
    name: z.string(),
    description: z.string().optional(),
    previewUrl: z.string().optional(),
    labels: z.record(z.string(), z.string()).optional(),
    makeDefault: z.boolean().optional(),
});

voices.post("/voices", requireWorkspace, async (c) => {
    const body = await readJson(c, zSave);
    if (!body) return c.json({ error: "invalid body" }, 400);
    const feats = featuresFor(c.get("ws"));
    const shelf = await shelfFor(c.get("ws").id);
    if (feats.maxWorkspaceVoices >= 0 && shelf.length >= feats.maxWorkspaceVoices)
        return c.json(
            { error: "This workspace has as many voices as its plan allows.", upgrade: true },
            402,
        );
    try {
        const row = await adopt(body);
        await shelve(c.get("ws").id, row.id, { makeDefault: body.makeDefault });
        return c.json({ voices: await shelfFor(c.get("ws").id) });
    } catch (e) {
        const f = fail(e);
        return c.json({ error: f.error }, f.status);
    }
});

const zPatch = z.object({ name: z.string().optional(), isDefault: z.boolean().optional() });

voices.patch("/voices/:id", requireWorkspace, async (c) => {
    const body = await readJson(c, zPatch);
    if (!body) return c.json({ error: "invalid body" }, 400);
    const wsId = c.get("ws").id;
    if (body.name !== undefined) await renameShelved(wsId, c.req.param("id"), body.name.trim());
    if (body.isDefault) await makeDefault(wsId, c.req.param("id"));
    return c.json({ voices: await shelfFor(wsId) });
});

voices.delete("/voices/:id", requireWorkspace, async (c) => {
    try {
        await unshelve(c.get("ws").id, c.req.param("id"));
        return c.json({ voices: await shelfFor(c.get("ws").id) });
    } catch (e) {
        const f = fail(e);
        return c.json({ error: f.error }, f.status);
    }
});

const zDesign = z.object({
    description: z.string().optional(),
    sampleText: z.string().optional(),
});

// 20..1000 is the provider's own range for a description; a shorter one produces noise
const DESC_MIN = 20;
const DESC_MAX = 1000;

voices.post("/voices/design", requireWorkspace, async (c) => {
    const ws = c.get("ws");
    if (!featuresFor(ws).voiceDesign)
        return c.json({ error: "Designing a voice needs a higher plan.", upgrade: true }, 402);
    const body = await readJson(c, zDesign);
    const description = body?.description?.trim() ?? "";
    if (description.length < DESC_MIN || description.length > DESC_MAX)
        return c.json(
            { error: `Describe the voice in ${DESC_MIN} to ${DESC_MAX} characters.` },
            400,
        );

    const held = await reserve(
        ws,
        c.get("user").id,
        "design-voice",
        {},
        ratesFor(ws, {}),
        false,
        c.get("role"),
    );
    if (!held.ok) return c.json(denied(ws, held), 402);

    return held.settle(async (billed) => {
        try {
            const candidates = await design(description, body?.sampleText?.trim()?.slice(0, 1000));
            // TODO(measure): the provider documents no price for a design call. Until it is measured
            // against a real account this settles at one unit and the ceiling holds three.
            billed({ speech: candidates.length ? 1 : 0 });
            return c.json({ candidates });
        } catch (e) {
            const f = fail(e);
            return c.json({ error: f.error }, f.status);
        }
    });
});

const zKeep = z.object({
    generatedVoiceId: z.string(),
    name: z.string(),
    description: z.string().optional(),
    preview: z.string().optional(),
    makeDefault: z.boolean().optional(),
});

voices.post("/voices/design/keep", requireWorkspace, async (c) => {
    const ws = c.get("ws");
    const feats = featuresFor(ws);
    if (!feats.voiceDesign)
        return c.json({ error: "Designing a voice needs a higher plan.", upgrade: true }, 402);
    const body = await readJson(c, zKeep);
    if (!body?.generatedVoiceId || !body.name.trim())
        return c.json({ error: "a candidate and a name are required" }, 400);

    // the workspace's own cap, which is a plan limit and has an upgrade to offer
    const shelf = await shelfFor(ws.id);
    if (feats.maxWorkspaceVoices >= 0 && shelf.length >= feats.maxWorkspaceVoices)
        return c.json(
            { error: "This workspace has as many voices as its plan allows.", upgrade: true },
            402,
        );

    try {
        // the install ceiling is ours and has no upgrade, so keepDesigned raises its own message
        const row = await keepDesigned(
            body.generatedVoiceId,
            body.name.trim(),
            body.description?.trim() ?? "",
            body.preview,
        );
        await shelve(ws.id, row.id, { makeDefault: body.makeDefault });
        return c.json({ voices: await shelfFor(ws.id) });
    } catch (e) {
        const f = fail(e);
        return c.json({ error: f.error }, f.status);
    }
});

// A sample is capped here rather than in the client: the point of an audition is to hear a line, and
// an uncapped one would be a way to synthesize a whole script at a flat price.
const AUDITION_CHARS = 200;
const zAudition = z.object({ voiceId: z.string().optional(), text: z.string().optional() });
const SAMPLE = "Here is how this voice sounds reading a line from your work.";

voices.post("/voices/audition", requireWorkspace, async (c) => {
    const ws = c.get("ws");
    const body = await readJson(c, zAudition);
    if (!body) return c.json({ error: "invalid body" }, 400);
    const text = (body.text?.trim() || SAMPLE).slice(0, AUDITION_CHARS);

    // an id off this workspace's shelf, or its default; never an arbitrary provider id from a client
    const voice = await voiceFor(ws.id, body.voiceId);
    if (!voice) return c.json({ error: "this workspace has no voices yet" }, 404);

    const held = await reserve(
        ws,
        c.get("user").id,
        "audition-voice",
        {},
        ratesFor(ws, {}),
        false,
        c.get("role"),
    );
    if (!held.ok) return c.json(denied(ws, held), 402);

    return held.settle(async () => {
        try {
            const out = await synthesize(text, voice.externalId);
            return c.json({
                audio: `data:${out.mime};base64,${out.audio.toString("base64")}`,
                ms: out.ms,
            });
        } catch (e) {
            const f = fail(e);
            return c.json({ error: f.error }, f.status);
        }
    });
});
