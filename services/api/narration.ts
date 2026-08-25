import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { z } from "zod";
import type { ArtifactContent } from "@model/artifact";
import { asContent } from "@model/artifact";
import { featuresFor } from "@model/billing";
import { gateShared, isResponse, requireWorkspace, type WorkspaceEnv } from "./middleware";
import { isArtifactContent } from "@services/core/artifacts";
import { audioFor, manifestFor, prepare, trackFor } from "@services/core/narration";
import {
    audioFor as bedAudio,
    composeForArtifact,
    ensurePreset,
    presets,
    rowToTrack,
    soundtrackFor,
} from "@services/core/soundtrack";
import { DEFAULT_PRESET } from "@model/speech";
import { DEFAULT_MS, MusicError, musicReady } from "@services/core/ai/music";
import { SpeechError, speechReady } from "@services/core/ai/speech";
import { VoiceError } from "@services/core/voices";
import { publicRead } from "@services/core/links";
import { ratesFor, reserve } from "@services/core/spend";
import { creditRefusal, readJson } from "@services/utils/http";
import { db } from "@services/db/client";
import { schema } from "@services/db/schema";
import { eq } from "drizzle-orm";

// Narration: preparing a piece's audio, and serving it back. Two read paths onto the same rows,
// because a signed-in member and an anonymous link viewer are gated differently and neither gate is
// reimplemented here: one goes through gateShared, the other through publicRead.

export const narration = new Hono<WorkspaceEnv>();

// a guard rather than a shape: the content carries fields this layer does not enumerate, and a
// plain z.object would strip them before the sections were read
const zPrepare = z.object({
    content: z.custom<ArtifactContent>(isArtifactContent).optional(),
    sectionIds: z.array(z.string()).optional(),
});

/**
 * The audio url a manifest hands out. `extra` carries the same access params the manifest request
 * came in with: an <audio> element sends no headers of ours, so a password-gated or token-scoped
 * link has to keep them in the url or every track would 404.
 */
const audioUrl =
    (base: string, extra: URLSearchParams = new URLSearchParams()) =>
    (sectionId: string, hash: string): string => {
        const q = new URLSearchParams(extra);
        q.set("v", hash);
        return `${base}/${encodeURIComponent(sectionId)}?${q}`;
    };

/** One unit is 1000 characters, so a run bills up to the nearest one and a cached run bills none. */
const unitsFor = (chars: number): number => (chars > 0 ? Math.ceil(chars / 1000) : 0);

/** Reads the stored content directly; the gate has already resolved who may see it. */
async function contentOf(artifactId: string): Promise<ArtifactContent> {
    const [row] = await db
        .select({ draftContent: schema.artifacts.draftContent })
        .from(schema.artifacts)
        .where(eq(schema.artifacts.id, artifactId));
    return asContent(row?.draftContent);
}

async function serveBed(trackId: string, artifactId: string): Promise<Response> {
    const row = await bedAudio(trackId, artifactId);
    if (!row) return new Response("not found", { status: 404 });
    return new Response(Buffer.from(row.data, "base64"), {
        status: 200,
        headers: {
            "content-type": row.mime,
            "cache-control": "public, max-age=31536000, immutable",
        },
    });
}

async function serveAudio(
    artifactId: string,
    sectionId: string,
    hash: string | undefined,
): Promise<Response> {
    if (!hash) return new Response("not found", { status: 404 });
    const row = await audioFor(artifactId, sectionId, hash);
    if (!row) return new Response("not found", { status: 404 });
    // the hash is in the url, so a re-render is a different url rather than a stale cache entry
    return new Response(Buffer.from(row.data, "base64"), {
        status: 200,
        headers: {
            "content-type": row.mime,
            "cache-control": "public, max-age=31536000, immutable",
        },
    });
}

narration.post("/artifacts/:id/narration", requireWorkspace, async (c) => {
    const id = c.req.param("id");
    if (!speechReady()) return c.json({ error: "narration is not configured on this server" }, 503);
    const gate = await gateShared(c, id, "edit");
    if (isResponse(gate)) return gate;
    // The ARTIFACT's workspace, not the caller's. gateShared admits a collaborator invited from
    // outside, and for them the two are different tenants: billing the caller would drain their
    // credits for someone else's deck and let their plan decide whether the owner's artifact may
    // narrate at all. The audio is cached on the owner's rows, so the owner pays and the owner's
    // plan governs. A grantee has no membership there, so they are capped as an ordinary member.
    const ws = gate.ws;
    const role = gate.role ?? "member";
    if (!featuresFor(ws).voiceNarration)
        return c.json(
            { error: "Narration needs a higher plan.", reason: "feature" as const, upgrade: true },
            402,
        );
    const body = await readJson(c, zPrepare);
    if (!body) return c.json({ error: "invalid body" }, 400);
    const content = body.content ?? (await contentOf(id));

    // The estimate is the work in front of us; the settle trues it up to what was really spoken, so a
    // deck that turns out to be mostly cached refunds nearly all of it.
    const pending = content.sections
        .filter((s) => !body.sectionIds?.length || body.sectionIds.includes(s.id))
        .reduce((n, s) => n + (s.notes?.spoken.trim().length ?? 0), 0);
    const held = await reserve(ws, c.get("user").id, "narrate-artifact", {
        size: { speechUnits: Math.max(1, unitsFor(pending)) },
        rates: ratesFor(ws, {}),
        role,
        surface: "direct",
    });
    if (!held.ok) return c.json(creditRefusal(ws, held), 402);

    return streamSSE(c, (stream) =>
        held.settle(async (billed) => {
            const send = (data: unknown): Promise<void> =>
                stream.writeSSE({ data: JSON.stringify(data) });
            let chars = 0;
            try {
                for await (const ev of prepare(id, content, gate.ws.id, body.sectionIds)) {
                    chars += ev.chars;
                    await send({ type: "section", ...ev });
                }
            } catch (e) {
                await send({
                    type: "error",
                    message: e instanceof Error ? e.message : "narration failed",
                });
            } finally {
                billed({ speech: unitsFor(chars) });
                await send({ type: "done", chars });
            }
        }),
    );
});

// One section, cached or synthesized on the spot. The player calls this for what it is about to
// speak and prefetches the next, which is why narration needs no separate "prepare" step.
narration.post("/artifacts/:id/narration/section/:sectionId", requireWorkspace, async (c) => {
    const id = c.req.param("id");
    if (!speechReady()) return c.json({ error: "narration is not configured on this server" }, 503);
    const gate = await gateShared(c, id, "edit");
    if (isResponse(gate)) return gate;
    // The ARTIFACT's workspace, not the caller's. gateShared admits a collaborator invited from
    // outside, and for them the two are different tenants: billing the caller would drain their
    // credits for someone else's deck and let their plan decide whether the owner's artifact may
    // narrate at all. The audio is cached on the owner's rows, so the owner pays and the owner's
    // plan governs. A grantee has no membership there, so they are capped as an ordinary member.
    const ws = gate.ws;
    const role = gate.role ?? "member";
    if (!featuresFor(ws).voiceNarration)
        return c.json(
            { error: "Narration needs a higher plan.", reason: "feature" as const, upgrade: true },
            402,
        );
    const body = await readJson(c, zPrepare);
    const content = body?.content ?? (await contentOf(id));
    const sectionId = c.req.param("sectionId");

    const chars =
        content.sections.find((s) => s.id === sectionId)?.notes?.spoken.trim().length ?? 0;
    const held = await reserve(ws, c.get("user").id, "narrate-artifact", {
        size: { speechUnits: Math.max(1, unitsFor(chars)) },
        rates: ratesFor(ws, {}),
        role,
        surface: "direct",
    });
    if (!held.ok) return c.json(creditRefusal(ws, held), 402);

    return held.settle(async (billed) => {
        try {
            const out = await trackFor(
                id,
                content,
                gate.ws.id,
                sectionId,
                audioUrl(`/api/artifacts/${id}/narration`),
            );
            // a cached hit reports zero characters, so replaying a section costs nothing
            billed({ speech: unitsFor(out?.chars ?? 0) });
            return c.json({ track: out?.track ?? null });
        } catch (e) {
            billed({ speech: 0 });
            // SpeechError and VoiceError carry the difference between "this server is misconfigured"
            // (503) and "the provider refused" (502); flattening both to 502 threw that away
            const status = e instanceof SpeechError || e instanceof VoiceError ? e.status : 502;
            const message = e instanceof Error ? e.message : "narration failed";
            return c.json({ error: message }, status);
        }
    });
});

narration.get("/artifacts/:id/narration", requireWorkspace, async (c) => {
    const id = c.req.param("id");
    const gate = await gateShared(c, id, "view");
    if (isResponse(gate)) return gate;
    const content = await contentOf(id);
    return c.json(
        await manifestFor(id, content, gate.ws.id, audioUrl(`/api/artifacts/${id}/narration`)),
    );
});

narration.get("/artifacts/:id/narration/:sectionId", requireWorkspace, async (c) => {
    const id = c.req.param("id");
    const gate = await gateShared(c, id, "view");
    if (isResponse(gate)) return gate;
    return await serveAudio(id, c.req.param("sectionId"), c.req.query("v"));
});

// The bed. Presets are generated once for the whole deployment and shared, so the common case costs
// one call ever; a custom bed is written from the piece and belongs to it.
narration.get("/music/presets", requireWorkspace, async (c) =>
    c.json({ presets: await presets() }),
);

const zBed = z.object({
    content: z.custom<ArtifactContent>(isArtifactContent).optional(),
    preset: z.string().optional(), // absent with `custom` false means the default preset
    custom: z.boolean().optional(),
    lengthMs: z.number().optional(), // the narration's total, so a narrated bed never has to loop
});

narration.post("/artifacts/:id/soundtrack", requireWorkspace, async (c) => {
    const id = c.req.param("id");
    if (!musicReady()) return c.json({ error: "music is not configured on this server" }, 503);
    const gate = await gateShared(c, id, "edit");
    if (isResponse(gate)) return gate;
    const ws = gate.ws; // the artifact's tenant pays, as narration already does
    if (!featuresFor(ws).backgroundMusic)
        return c.json(
            {
                error: "Background music needs a higher plan.",
                reason: "feature" as const,
                upgrade: true,
            },
            402,
        );
    const body = await readJson(c, zBed);
    if (!body) return c.json({ error: "invalid body" }, 400);

    const minutes = Math.max(1, Math.ceil((body.lengthMs || DEFAULT_MS) / 60_000));
    const held = await reserve(ws, c.get("user").id, "compose-soundtrack", {
        size: { musicMinutes: minutes },
        rates: ratesFor(ws, {}),
        role: gate.role ?? "member",
        surface: "direct",
    });
    if (!held.ok) return c.json(creditRefusal(ws, held), 402);

    return held.settle(async (billed) => {
        try {
            // The bed itself comes back, not just its id. The caller turns music on in its own
            // copy of the content and cannot read it back from here until that write lands, and
            // asking anyway is a race it loses often enough to look broken.
            const bedUrl = (t: string): string => `/api/artifacts/${id}/soundtrack/${t}`;
            if (body.custom) {
                const content = body.content ?? (await contentOf(id));
                const out = await composeForArtifact(id, content, body.lengthMs ?? DEFAULT_MS);
                // a cached bed reports zero, so asking twice for the same piece costs nothing
                billed({ music: out.ms ? Math.max(1, Math.ceil(out.ms / 60_000)) : 0 });
                return c.json({
                    trackId: out.row.id,
                    cached: !out.ms,
                    track: rowToTrack(out.row, bedUrl(out.row.id)),
                });
            }
            const out = await ensurePreset(body.preset ?? DEFAULT_PRESET);
            billed({ music: out.chars ? Math.max(1, Math.ceil(out.chars / 60_000)) : 0 });
            return c.json({
                trackId: out.row.id,
                cached: !out.chars,
                track: rowToTrack(out.row, bedUrl(out.row.id)),
            });
        } catch (e) {
            billed({ music: 0 });
            const status = e instanceof MusicError ? e.status : 502;
            return c.json({ error: e instanceof Error ? e.message : "music failed" }, status);
        }
    });
});

narration.get("/artifacts/:id/soundtrack", requireWorkspace, async (c) => {
    const id = c.req.param("id");
    const gate = await gateShared(c, id, "view");
    if (isResponse(gate)) return gate;
    const content = await contentOf(id);
    return c.json({
        track: await soundtrackFor(content, id, (t) => `/api/artifacts/${id}/soundtrack/${t}`),
    });
});

narration.get("/artifacts/:id/soundtrack/:trackId", requireWorkspace, async (c) => {
    const gate = await gateShared(c, c.req.param("id"), "view");
    if (isResponse(gate)) return gate;
    return await serveBed(c.req.param("trackId"), c.req.param("id"));
});

narration.get("/p/:slug/soundtrack", async (c) => {
    const read = await publicRead(c.req.param("slug"), {
        password: c.req.query("pw"),
        token: c.req.query("k"),
    });
    if (read.status !== 200) return c.json({ error: "not found" }, 404);
    const slug = encodeURIComponent(c.req.param("slug"));
    const access = new URLSearchParams();
    if (c.req.query("pw")) access.set("pw", c.req.query("pw")!);
    if (c.req.query("k")) access.set("k", c.req.query("k")!);
    const qs = access.toString();
    const content = await contentOf(read.artifactId);
    return c.json({
        track: await soundtrackFor(
            content,
            read.artifactId,
            (t) => `/api/p/${slug}/soundtrack/${t}${qs ? `?${qs}` : ""}`,
        ),
    });
});

narration.get("/p/:slug/soundtrack/:trackId", async (c) => {
    const read = await publicRead(c.req.param("slug"), {
        password: c.req.query("pw"),
        token: c.req.query("k"),
    });
    if (read.status !== 200) return new Response("not found", { status: 404 });
    return await serveBed(c.req.param("trackId"), read.artifactId);
});

// The public pair, behind the same read the words go through: a password or a recipient token
// protects the narration exactly as it protects the content.
narration.get("/p/:slug/narration", async (c) => {
    const pw = c.req.query("pw");
    const token = c.req.query("k");
    const read = await publicRead(c.req.param("slug"), { password: pw, token });
    if (read.status !== 200) return c.json({ error: "not found" }, 404);
    const content = await contentOf(read.artifactId);
    const access = new URLSearchParams();
    if (pw) access.set("pw", pw);
    if (token) access.set("k", token);
    return c.json(
        await manifestFor(
            read.artifactId,
            content,
            read.workspaceId,
            audioUrl(`/api/p/${encodeURIComponent(c.req.param("slug"))}/narration`, access),
        ),
    );
});

narration.get("/p/:slug/narration/:sectionId", async (c) => {
    const read = await publicRead(c.req.param("slug"), {
        password: c.req.query("pw"),
        token: c.req.query("k"),
    });
    if (read.status !== 200) return new Response("not found", { status: 404 });
    return await serveAudio(read.artifactId, c.req.param("sectionId"), c.req.query("v"));
});
