import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { ArtifactContent } from "@model/artifact";
import type { NarrationManifest } from "@model/speech";
import { authed, jsonInit, request, seedUser } from "@services/__tests__/harness";
import { db } from "@services/db/client";
import { schema } from "@services/db/schema";
import { adopt, shelve } from "@services/core/voices";
import { prepare, trackFor } from "@services/core/narration";

let savedKey: string | undefined;
beforeEach(() => {
    savedKey = process.env.ELEVENLABS_API_KEY;
    process.env.ELEVENLABS_API_KEY = "test-key";
});
afterEach(() => {
    if (savedKey === undefined) delete process.env.ELEVENLABS_API_KEY;
    else process.env.ELEVENLABS_API_KEY = savedKey;
});

let n = 0;
const fakeProvider: typeof fetch = ((url: string) => {
    if (String(url).includes("/voices/add"))
        return Promise.resolve(new Response(JSON.stringify({ voice_id: "acct" })));
    return Promise.resolve(
        new Response(
            JSON.stringify({
                audio_base64: Buffer.from("mp3-bytes").toString("base64"),
                alignment: {
                    characters: ["a"],
                    character_start_times_seconds: [0],
                    character_end_times_seconds: [1],
                },
            }),
        ),
    );
}) as typeof fetch;

const CONTENT: ArtifactContent = {
    format: "deck",
    theme: "studio",
    sections: [
        {
            id: "s1",
            root: { type: "text", data: { text: "Visible headline" } },
            notes: { spoken: "the spoken script", cues: ["never say this out loud"] },
        },
    ],
};

async function seedNarrated(plan = "pro"): Promise<{
    userId: string;
    workspaceId: string;
    artifactId: string;
}> {
    const { userId, workspaceId } = await seedUser({ plan });
    n += 1;
    const v = await adopt(
        { externalId: `nar-${n}-${Date.now()}`, ownerId: "o", name: "Narrator" },
        fakeProvider,
    );
    await shelve(workspaceId, v.id);
    const [a] = await db
        .insert(schema.artifacts)
        .values({
            workspaceId,
            formatId: "deck",
            themeId: "studio",
            draftContent: CONTENT as typeof schema.artifacts.$inferInsert.draftContent,
        })
        .returning({ id: schema.artifacts.id });
    const artifactId = a!.id;
    for await (const _ of prepare(artifactId, CONTENT, workspaceId, undefined, fakeProvider));
    return { userId, workspaceId, artifactId };
}

async function publish(
    userId: string,
    artifactId: string,
    body: Record<string, unknown> = {},
): Promise<string> {
    const res = await authed(userId, `/artifacts/${artifactId}/links`, jsonInit("POST", body));
    expect(res.status).toBe(200);
    return ((await res.json()) as { link: { slug: string } }).link.slug;
}

describe("GET /artifacts/:id/narration", () => {
    it("lists the prepared track with a url carrying its hash", async () => {
        const { userId, artifactId } = await seedNarrated();
        const res = await authed(userId, `/artifacts/${artifactId}/narration`);
        expect(res.status).toBe(200);
        const m = (await res.json()) as NarrationManifest;
        expect(m.tracks).toHaveLength(1);
        expect(m.tracks[0]?.url).toContain("?v=");
        expect(m.voiceName).toBe("Narrator");
    });

    it("404s for someone outside the workspace", async () => {
        const { artifactId } = await seedNarrated();
        const stranger = await seedUser({});
        const res = await authed(stranger.userId, `/artifacts/${artifactId}/narration`);
        expect(res.status).toBe(404);
    });

    it("serves the bytes for a good hash and 404s for a bad one", async () => {
        const { userId, artifactId } = await seedNarrated();
        const m = (await (
            await authed(userId, `/artifacts/${artifactId}/narration`)
        ).json()) as NarrationManifest;
        const url = m.tracks[0]!.url.replace("/api", "");
        const ok = await authed(userId, url);
        expect(ok.status).toBe(200);
        expect(ok.headers.get("content-type")).toBe("audio/mpeg");
        expect(ok.headers.get("cache-control")).toContain("immutable");

        const bad = await authed(userId, `/artifacts/${artifactId}/narration/s1?v=nope`);
        expect(bad.status).toBe(404);
    });
});

describe("GET /p/:slug/narration", () => {
    it("serves a public link's manifest and audio without a session", async () => {
        const { userId, artifactId } = await seedNarrated();
        const slug = await publish(userId, artifactId);
        const res = await request(`/p/${slug}/narration`);
        expect(res.status).toBe(200);
        const m = (await res.json()) as NarrationManifest;
        expect(m.tracks).toHaveLength(1);
        const audio = await request(m.tracks[0]!.url.replace("/api", ""));
        expect(audio.status).toBe(200);
    });

    /**
     * What the player on a published page has to work from. It gets the content with the notes
     * stripped, so the manifest is the whole record of what it may speak: a section listed in
     * `tracks` is playable, one in `stale` has words but no audio and is skipped, and nothing else
     * exists. This is the contract behind `speakable()` in @ui/narration.
     */
    it("tells a viewer exactly which sections they can hear, and which they cannot", async () => {
        const { userId, workspaceId } = await seedUser({ plan: "pro" });
        n += 1;
        const v = await adopt(
            { externalId: `part-${n}-${Date.now()}`, ownerId: "o", name: "Narrator" },
            fakeProvider,
        );
        await shelve(workspaceId, v.id);
        const both: ArtifactContent = {
            format: "deck",
            theme: "studio",
            sections: [
                {
                    id: "s1",
                    root: { type: "text", data: { text: "Recorded" } },
                    notes: { spoken: "this one was recorded" },
                },
                {
                    id: "s2",
                    root: { type: "text", data: { text: "Never played" } },
                    notes: { spoken: "this one never was" },
                },
                { id: "s3", root: { type: "text", data: { text: "No script at all" } } },
            ],
        };
        const [a] = await db
            .insert(schema.artifacts)
            .values({
                workspaceId,
                formatId: "deck",
                themeId: "studio",
                draftContent: both as typeof schema.artifacts.$inferInsert.draftContent,
            })
            .returning({ id: schema.artifacts.id });
        // only the first section was ever spoken, which is what the on-demand path leaves behind
        await trackFor(a!.id, both, workspaceId, "s1", (id, h) => `/u/${id}/${h}`, fakeProvider);

        const slug = await publish(userId, a!.id);
        const m = (await (await request(`/p/${slug}/narration`)).json()) as NarrationManifest;
        expect(m.tracks.map((t) => t.sectionId)).toEqual(["s1"]);
        expect(m.stale).toEqual(["s2"]); // has words, no audio
        expect(m.voiceName).toBe("Narrator");
        expect((await request(m.tracks[0]!.url.replace("/api", ""))).status).toBe(200);
    });

    // a viewer must not be able to spend the owner's credits by pressing play on someone's link
    it("offers a viewer no way to record what is missing", async () => {
        const { userId, artifactId } = await seedNarrated();
        const slug = await publish(userId, artifactId);
        for (const path of [
            `/p/${slug}/narration`,
            `/p/${slug}/narration/section/s1`,
            `/artifacts/${artifactId}/narration/section/s1`,
        ]) {
            const res = await request(path, jsonInit("POST", {}));
            expect(res.status).not.toBe(200);
        }
    });

    it("gates a protected link's narration exactly as it gates its words", async () => {
        const { userId, artifactId } = await seedNarrated();
        const slug = await publish(userId, artifactId, {
            visibility: "protected",
            password: "hunter22",
        });
        expect((await request(`/p/${slug}/narration`)).status).toBe(404);

        const ok = await request(`/p/${slug}/narration?pw=hunter22`);
        expect(ok.status).toBe(200);
        const m = (await ok.json()) as NarrationManifest;
        // the password rides in the url, because an <audio> element sends no headers of ours
        expect(m.tracks[0]?.url).toContain("pw=hunter22");
        expect((await request(m.tracks[0]!.url.replace("/api", ""))).status).toBe(200);
    });

    it("gates a private link on its recipient token", async () => {
        const { userId, artifactId } = await seedNarrated();
        const res = await authed(
            userId,
            `/artifacts/${artifactId}/links`,
            jsonInit("POST", { visibility: "private", recipients: ["a@test.local"] }),
        );
        const link = (await res.json()) as {
            link: { slug: string; recipients: { url: string }[] };
        };
        const token = link.link.recipients[0]!.url.split("?k=")[1];
        expect((await request(`/p/${link.link.slug}/narration`)).status).toBe(404);
        const ok = await request(`/p/${link.link.slug}/narration?k=${token}`);
        expect(ok.status).toBe(200);
        expect(((await ok.json()) as NarrationManifest).tracks[0]?.url).toContain(`k=${token}`);
    });

    it("never exposes a cue, on either the content or the narration path", async () => {
        const { userId, artifactId } = await seedNarrated();
        const slug = await publish(userId, artifactId);
        const content = await (await request(`/p/${slug}/content`)).text();
        const manifest = await (await request(`/p/${slug}/narration`)).text();
        expect(content).toContain("Visible headline");
        expect(content).not.toContain("never say this out loud");
        expect(manifest).not.toContain("never say this out loud");
        // the spoken script IS carried, since a caption needs it, and it was never presenter-only
        expect(manifest).toContain("the spoken script");
    });

    it("404s an unknown slug rather than saying whether it exists", async () => {
        expect((await request("/p/nope-nope/narration")).status).toBe(404);
    });
});

describe("POST /artifacts/:id/narration", () => {
    it("503s when narration is not configured, before charging anything", async () => {
        const { userId, artifactId } = await seedNarrated();
        delete process.env.ELEVENLABS_API_KEY;
        const res = await authed(
            userId,
            `/artifacts/${artifactId}/narration`,
            jsonInit("POST", {}),
        );
        expect(res.status).toBe(503);
    });

    it("404s for someone outside the workspace", async () => {
        const { artifactId } = await seedNarrated();
        const stranger = await seedUser({});
        const res = await authed(
            stranger.userId,
            `/artifacts/${artifactId}/narration`,
            jsonInit("POST", {}),
        );
        expect(res.status).toBe(404);
    });
});

describe("the narration entitlement", () => {
    it("402s on a plan without it, before any provider call", async () => {
        const { userId, workspaceId } = await seedUser({ plan: "free" });
        n += 1;
        const v = await adopt(
            { externalId: `ent-${n}-${Date.now()}`, ownerId: "o", name: "Narrator" },
            fakeProvider,
        );
        await shelve(workspaceId, v.id);
        const [a] = await db
            .insert(schema.artifacts)
            .values({
                workspaceId,
                formatId: "deck",
                themeId: "studio",
                draftContent: CONTENT as typeof schema.artifacts.$inferInsert.draftContent,
            })
            .returning({ id: schema.artifacts.id });
        const res = await authed(userId, `/artifacts/${a!.id}/narration`, jsonInit("POST", {}));
        expect(res.status).toBe(402);
        expect(((await res.json()) as { upgrade?: boolean }).upgrade).toBe(true);
    });
});

describe("who pays when a collaborator narrates someone else's artifact", () => {
    /** An outsider with an edit grant: no membership in the owning workspace, own tenant elsewhere. */
    async function invitedOutsider(ownerPlan: string, guestPlan: string) {
        const owner = await seedUser({ plan: ownerPlan });
        const guest = await seedUser({ plan: guestPlan });
        n += 1;
        const v = await adopt(
            { externalId: `pay-${n}-${Date.now()}`, ownerId: "o", name: "Narrator" },
            fakeProvider,
        );
        await shelve(owner.workspaceId, v.id);
        const [a] = await db
            .insert(schema.artifacts)
            .values({
                workspaceId: owner.workspaceId,
                formatId: "deck",
                themeId: "studio",
                draftContent: CONTENT as typeof schema.artifacts.$inferInsert.draftContent,
            })
            .returning({ id: schema.artifacts.id });
        await db.insert(schema.artifactGrants).values({
            artifactId: a!.id,
            workspaceId: owner.workspaceId,
            email: `guest-${n}@test.local`,
            userId: guest.userId,
            access: "edit",
        });
        return { owner, guest, artifactId: a!.id };
    }

    // Ledger rows rather than the balance: the run reaches a provider this test cannot reach, so
    // the reserve settles back to nothing. What it still proves is which tenant the hold was taken
    // against, which is the whole question.
    const ledgerRows = async (workspaceId: string): Promise<number> => {
        const rows = await db
            .select({ id: schema.credits.id })
            .from(schema.credits)
            .where(eq(schema.credits.workspaceId, workspaceId));
        return rows.length;
    };

    it("holds credits against the artifact's workspace, not the collaborator's", async () => {
        const { owner, guest, artifactId } = await invitedOutsider("pro", "pro");
        const guestBefore = await ledgerRows(guest.workspaceId);
        const ownerBefore = await ledgerRows(owner.workspaceId);

        const res = await authed(
            guest.userId,
            `/artifacts/${artifactId}/narration`,
            jsonInit("POST", {}),
        );
        expect(res.status).toBe(200);
        await res.text(); // drain the stream so the settle runs

        expect(await ledgerRows(guest.workspaceId)).toBe(guestBefore);
        expect(await ledgerRows(owner.workspaceId)).toBeGreaterThan(ownerBefore);
    });

    it("gates on the owner's plan, so a Free guest cannot block a Pro owner's deck", async () => {
        const { guest, artifactId } = await invitedOutsider("pro", "free");
        const res = await authed(
            guest.userId,
            `/artifacts/${artifactId}/narration`,
            jsonInit("POST", {}),
        );
        expect(res.status).toBe(200);
    });

    it("refuses when the OWNER's plan lacks narration, whatever the guest's is", async () => {
        const { guest, artifactId } = await invitedOutsider("free", "pro");
        const res = await authed(
            guest.userId,
            `/artifacts/${artifactId}/narration`,
            jsonInit("POST", {}),
        );
        expect(res.status).toBe(402);
    });
});

describe("a refused provider is classified, not flattened", () => {
    it("reports a missing key scope as 503 configuration, not 502 bad gateway", async () => {
        // A restricted key answers 401 naming the scope it wants. That is a setting to change, not
        // an outage, and the two send someone to different places.
        const { userId, artifactId } = await seedNarrated();
        const restricted = (() =>
            Promise.resolve(
                new Response(
                    JSON.stringify({
                        detail: {
                            status: "missing_permissions",
                            message: "missing the permission text_to_speech",
                        },
                    }),
                    { status: 401 },
                ),
            )) as typeof fetch;
        const realFetch = globalThis.fetch;
        globalThis.fetch = restricted;
        try {
            const res = await authed(
                userId,
                `/artifacts/${artifactId}/narration/section/s2`,
                jsonInit("POST", {
                    content: {
                        format: "deck",
                        theme: "studio",
                        sections: [
                            {
                                id: "s2",
                                root: { type: "text", data: { text: "x" } },
                                notes: { spoken: "never recorded before" },
                            },
                        ],
                    },
                }),
            );
            expect(res.status).toBe(503);
            expect(((await res.json()) as { error: string }).error).toContain("text_to_speech");
        } finally {
            globalThis.fetch = realFetch;
        }
    });
});
