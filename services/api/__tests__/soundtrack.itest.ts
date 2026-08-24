import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { ArtifactContent } from "@model/artifact";
import type { MusicPresetInfo, Soundtrack } from "@model/speech";
import { authed, jsonInit, request, seedUser } from "@services/__tests__/harness";
import { db } from "@services/db/client";
import { schema } from "@services/db/schema";

let savedKey: string | undefined;
let realFetch: typeof fetch;
let calls: number;

beforeEach(() => {
    savedKey = process.env.ELEVENLABS_API_KEY;
    process.env.ELEVENLABS_API_KEY = "test-key";
    calls = 0;
    realFetch = globalThis.fetch;
    // the routes compose through the global, having no seam of their own
    globalThis.fetch = ((url: string) => {
        if (!String(url).includes("/v1/music")) return realFetch(url);
        calls += 1;
        return Promise.resolve(new Response(Buffer.from("fake-mp3")));
    }) as typeof fetch;
});
afterEach(() => {
    globalThis.fetch = realFetch;
    if (savedKey === undefined) delete process.env.ELEVENLABS_API_KEY;
    else process.env.ELEVENLABS_API_KEY = savedKey;
});

const content = (music?: ArtifactContent["music"]): ArtifactContent => ({
    format: "deck",
    theme: "studio",
    sections: [{ id: "s1", root: { type: "text", data: { text: "A real headline" } } }],
    ...(music ? { music } : {}),
});

async function seedArtifact(
    workspaceId: string,
    music?: ArtifactContent["music"],
): Promise<string> {
    const [a] = await db
        .insert(schema.artifacts)
        .values({
            workspaceId,
            formatId: "deck",
            themeId: "studio",
            title: "A deck with a bed",
            draftContent: content(music) as typeof schema.artifacts.$inferInsert.draftContent,
        })
        .returning({ id: schema.artifacts.id });
    return a!.id;
}

const ledgerRows = async (workspaceId: string): Promise<number> => {
    const rows = await db
        .select({ id: schema.credits.id })
        .from(schema.credits)
        .where(eq(schema.credits.workspaceId, workspaceId));
    return rows.length;
};

const trackIdOf = async (res: Response): Promise<string> =>
    ((await res.json()) as { trackId: string }).trackId;

async function publish(
    userId: string,
    artifactId: string,
    body: Record<string, unknown> = {},
): Promise<string> {
    const res = await authed(userId, `/artifacts/${artifactId}/links`, jsonInit("POST", body));
    expect(res.status).toBe(200);
    return ((await res.json()) as { link: { slug: string } }).link.slug;
}

describe("GET /music/presets", () => {
    it("lists the house set with a built flag the picker can show", async () => {
        const { userId } = await seedUser({ plan: "pro" });
        const res = await authed(userId, "/music/presets");
        expect(res.status).toBe(200);
        const { presets } = (await res.json()) as { presets: MusicPresetInfo[] };
        expect(presets.length).toBeGreaterThan(3);
        expect(presets.every((p) => p.id && p.name && p.description)).toBe(true);
        expect(presets.every((p) => typeof p.ready === "boolean")).toBe(true);
    });
});

describe("POST /artifacts/:id/soundtrack", () => {
    it("builds a preset and bills the workspace once, not on every ask", async () => {
        const { userId, workspaceId } = await seedUser({ plan: "pro" });
        const artifactId = await seedArtifact(workspaceId);

        const first = await authed(
            userId,
            `/artifacts/${artifactId}/soundtrack`,
            jsonInit("POST", { preset: "focused" }),
        );
        expect(first.status).toBe(200);
        const trackId = await trackIdOf(first);

        const again = await authed(
            userId,
            `/artifacts/${artifactId}/soundtrack`,
            jsonInit("POST", { preset: "focused" }),
        );
        expect(await trackIdOf(again)).toBe(trackId);
        expect(calls).toBe(1); // the second ask was served from what the first built
    });

    it("writes a custom bed from the artifact's own content", async () => {
        const { userId, workspaceId } = await seedUser({ plan: "pro" });
        const artifactId = await seedArtifact(workspaceId);
        const res = await authed(
            userId,
            `/artifacts/${artifactId}/soundtrack`,
            jsonInit("POST", { custom: true, lengthMs: 90_000 }),
        );
        expect(res.status).toBe(200);
        const [row] = await db
            .select()
            .from(schema.soundtracks)
            .where(eq(schema.soundtracks.id, await trackIdOf(res)));
        expect(row?.source).toBe("custom");
        expect(row?.artifactId).toBe(artifactId);
        expect(row?.ms).toBe(90_000);
        expect(row?.prompt).toContain("A deck with a bed"); // the title reached the prompt
    });

    it("needs a plan that carries music", async () => {
        const { userId, workspaceId } = await seedUser({ plan: "free" });
        const artifactId = await seedArtifact(workspaceId);
        const res = await authed(
            userId,
            `/artifacts/${artifactId}/soundtrack`,
            jsonInit("POST", { preset: "calm" }),
        );
        expect(res.status).toBe(402);
        expect((await res.json()) as { upgrade?: boolean }).toMatchObject({ upgrade: true });
        expect(calls).toBe(0); // refused before it could spend
    });

    it("is 503, not a broken gateway, when the server has no key", async () => {
        delete process.env.ELEVENLABS_API_KEY;
        const { userId, workspaceId } = await seedUser({ plan: "pro" });
        const artifactId = await seedArtifact(workspaceId);
        const res = await authed(
            userId,
            `/artifacts/${artifactId}/soundtrack`,
            jsonInit("POST", { preset: "calm" }),
        );
        expect(res.status).toBe(503);
    });

    it("refuses a viewer, since composing spends the workspace's credits", async () => {
        const owner = await seedUser({ plan: "pro" });
        const guest = await seedUser({ plan: "pro" });
        const artifactId = await seedArtifact(owner.workspaceId);
        await db.insert(schema.artifactGrants).values({
            artifactId,
            workspaceId: owner.workspaceId,
            email: "bed-viewer@test.local",
            userId: guest.userId,
            access: "view",
        });
        const res = await authed(
            guest.userId,
            `/artifacts/${artifactId}/soundtrack`,
            jsonInit("POST", { preset: "calm" }),
        );
        expect(res.status).toBe(403);
    });

    // the same tenant rule notes and narration already follow: the piece's owner pays
    it("holds against the artifact's workspace, not the invited editor's", async () => {
        const owner = await seedUser({ plan: "pro" });
        const guest = await seedUser({ plan: "pro" });
        const artifactId = await seedArtifact(owner.workspaceId);
        await db.insert(schema.artifactGrants).values({
            artifactId,
            workspaceId: owner.workspaceId,
            email: "bed-editor@test.local",
            userId: guest.userId,
            access: "edit",
        });
        const guestBefore = await ledgerRows(guest.workspaceId);
        const ownerBefore = await ledgerRows(owner.workspaceId);

        const res = await authed(
            guest.userId,
            `/artifacts/${artifactId}/soundtrack`,
            jsonInit("POST", { custom: true }),
        );
        expect(res.status).toBe(200);
        expect(await ledgerRows(guest.workspaceId)).toBe(guestBefore);
        expect(await ledgerRows(owner.workspaceId)).toBeGreaterThan(ownerBefore);
    });
});

describe("GET /artifacts/:id/soundtrack", () => {
    it("is nothing until the artifact turns music on", async () => {
        const { userId, workspaceId } = await seedUser({ plan: "pro" });
        const artifactId = await seedArtifact(workspaceId);
        const res = await authed(userId, `/artifacts/${artifactId}/soundtrack`);
        expect(res.status).toBe(200);
        expect((await res.json()) as { track: Soundtrack | null }).toEqual({ track: null });
    });

    it("returns the chosen bed with a url that serves its bytes", async () => {
        const { userId, workspaceId } = await seedUser({ plan: "pro" });
        const artifactId = await seedArtifact(workspaceId);
        const made = await authed(
            userId,
            `/artifacts/${artifactId}/soundtrack`,
            jsonInit("POST", { preset: "warm" }),
        );
        const trackId = await trackIdOf(made);
        await db
            .update(schema.artifacts)
            .set({
                draftContent: content({
                    on: true,
                    trackId,
                }) as typeof schema.artifacts.$inferInsert.draftContent,
            })
            .where(eq(schema.artifacts.id, artifactId));

        const res = await authed(userId, `/artifacts/${artifactId}/soundtrack`);
        const { track } = (await res.json()) as { track: Soundtrack };
        expect(track.id).toBe(trackId);
        expect(track.preset).toBe("warm");

        const audio = await authed(userId, track.url.replace("/api", ""));
        expect(audio.status).toBe(200);
        expect(audio.headers.get("content-type")).toBe("audio/mpeg");
        expect(audio.headers.get("cache-control")).toContain("immutable");
    });

    it("404s for someone outside the workspace", async () => {
        const { workspaceId } = await seedUser({ plan: "pro" });
        const artifactId = await seedArtifact(workspaceId, { on: true });
        const stranger = await seedUser({ plan: "pro" });
        expect((await authed(stranger.userId, `/artifacts/${artifactId}/soundtrack`)).status).toBe(
            404,
        );
    });
});

describe("GET /p/:slug/soundtrack", () => {
    it("plays for a link viewer with no session at all", async () => {
        const { userId, workspaceId } = await seedUser({ plan: "pro" });
        const artifactId = await seedArtifact(workspaceId);
        const trackId = await trackIdOf(
            await authed(
                userId,
                `/artifacts/${artifactId}/soundtrack`,
                jsonInit("POST", { preset: "cinematic" }),
            ),
        );
        await db
            .update(schema.artifacts)
            .set({
                draftContent: content({
                    on: true,
                    trackId,
                }) as typeof schema.artifacts.$inferInsert.draftContent,
            })
            .where(eq(schema.artifacts.id, artifactId));
        const slug = await publish(userId, artifactId);

        const res = await request(`/p/${slug}/soundtrack`);
        expect(res.status).toBe(200);
        const { track } = (await res.json()) as { track: Soundtrack };
        expect(track.id).toBe(trackId);
        const audio = await request(track.url.replace("/api", ""));
        expect(audio.status).toBe(200);
        expect(audio.headers.get("content-type")).toBe("audio/mpeg");
    });

    it("gates a protected link's bed exactly as it gates its words", async () => {
        const { userId, workspaceId } = await seedUser({ plan: "pro" });
        const artifactId = await seedArtifact(workspaceId, { on: true });
        const slug = await publish(userId, artifactId, {
            visibility: "protected",
            password: "hunter22",
        });
        expect((await request(`/p/${slug}/soundtrack`)).status).toBe(404);
        expect((await request(`/p/${slug}/soundtrack?pw=hunter22`)).status).toBe(200);
    });
});
