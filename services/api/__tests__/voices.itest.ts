import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { WorkspaceVoice } from "@model/speech";
import { authed, jsonInit, seedUser } from "@services/__tests__/harness";
import { adopt, shelve } from "@services/core/voices";

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
// the provider hands back an account-local id per voice, so the fake has to vary it too
const fake: typeof fetch = ((url: string) =>
    Promise.resolve(
        new Response(JSON.stringify({ voice_id: `acct-${String(url).split("/").pop()}` })),
    )) as typeof fetch;

async function shelved(count = 1): Promise<{ userId: string; voices: WorkspaceVoice[] }> {
    const { userId, workspaceId } = await seedUser({ plan: "pro" });
    for (let i = 0; i < count; i++) {
        n += 1;
        const v = await adopt(
            { externalId: `v-${n}-${Date.now()}`, ownerId: "o", name: `Voice ${n}` },
            fake,
        );
        await shelve(workspaceId, v.id);
    }
    const res = await authed(userId, "/voices");
    return { userId, voices: ((await res.json()) as { voices: WorkspaceVoice[] }).voices };
}

describe("GET /voices", () => {
    it("is empty for a fresh workspace and lists the shelf once filled", async () => {
        const { userId } = await seedUser({});
        const empty = await authed(userId, "/voices");
        expect(((await empty.json()) as { voices: unknown[] }).voices).toEqual([]);

        const { voices } = await shelved(2);
        expect(voices).toHaveLength(2);
        expect(voices.filter((v) => v.isDefault)).toHaveLength(1);
        expect(voices[0]?.isDefault).toBe(true); // default first
    });
});

describe("PATCH /voices/:id", () => {
    it("renames a voice for this workspace only", async () => {
        const { userId, voices } = await shelved(1);
        const res = await authed(
            userId,
            `/voices/${voices[0]!.id}`,
            jsonInit("PATCH", { name: "Our narrator" }),
        );
        const next = ((await res.json()) as { voices: WorkspaceVoice[] }).voices;
        expect(next[0]?.name).toBe("Our narrator");
    });

    it("moves the default, leaving exactly one", async () => {
        const { userId, voices } = await shelved(2);
        const target = voices.find((v) => !v.isDefault)!;
        const res = await authed(
            userId,
            `/voices/${target.id}`,
            jsonInit("PATCH", {
                isDefault: true,
            }),
        );
        const next = ((await res.json()) as { voices: WorkspaceVoice[] }).voices;
        expect(next.filter((v) => v.isDefault)).toHaveLength(1);
        expect(next.find((v) => v.isDefault)?.id).toBe(target.id);
    });
});

describe("DELETE /voices/:id", () => {
    it("removes one and promotes a replacement default", async () => {
        const { userId, voices } = await shelved(2);
        const wasDefault = voices.find((v) => v.isDefault)!;
        const res = await authed(userId, `/voices/${wasDefault.id}`, { method: "DELETE" });
        const next = ((await res.json()) as { voices: WorkspaceVoice[] }).voices;
        expect(next).toHaveLength(1);
        expect(next[0]?.isDefault).toBe(true);
    });

    it("refuses to empty the shelf, since a workspace with none cannot narrate", async () => {
        const { userId, voices } = await shelved(1);
        const res = await authed(userId, `/voices/${voices[0]!.id}`, { method: "DELETE" });
        expect(res.status).toBe(402);
    });
});

describe("POST /voices/audition", () => {
    it("404s for a workspace with no voices, rather than picking one", async () => {
        const { userId } = await seedUser({ plan: "pro" });
        const res = await authed(userId, "/voices/audition", jsonInit("POST", {}));
        expect(res.status).toBe(404);
    });

    /**
     * Auditioning synthesizes, so it fails the ways synthesis fails, and those carry the only
     * sentence worth reading. Answering "the voice service failed" for an account that has simply
     * run out of characters sends someone looking for an outage that is not there.
     */
    it("passes the provider's own refusal through instead of a bare gateway error", async () => {
        const { userId, voices } = await shelved();
        const realFetch = globalThis.fetch;
        globalThis.fetch = ((url: string) => {
            if (!String(url).includes("/text-to-speech/")) return realFetch(url);
            return Promise.resolve(
                new Response(
                    JSON.stringify({
                        detail: {
                            status: "quota_exceeded",
                            message:
                                "This request exceeds your quota of 10000. You have 56 credits remaining, while 385 credits are required for this request.",
                        },
                    }),
                    { status: 401 }, // what the provider really answers, and it is not about the key
                ),
            );
        }) as typeof fetch;
        try {
            const res = await authed(
                userId,
                "/voices/audition",
                jsonInit("POST", { voiceId: voices[0]!.id }),
            );
            expect(res.status).toBe(503);
            expect(((await res.json()) as { error: string }).error).toContain(
                "56 credits remaining",
            );
        } finally {
            globalThis.fetch = realFetch;
        }
    });

    it("is a 503 naming the server, not a 502, when there is no key at all", async () => {
        const { userId, voices } = await shelved();
        delete process.env.ELEVENLABS_API_KEY;
        const res = await authed(
            userId,
            "/voices/audition",
            jsonInit("POST", { voiceId: voices[0]!.id }),
        );
        expect(res.status).toBe(503);
        expect(((await res.json()) as { error: string }).error).toContain("not configured");
    });
});

describe("GET /voices/library", () => {
    it("503s when the provider is not configured", async () => {
        delete process.env.ELEVENLABS_API_KEY;
        const { userId } = await seedUser({ plan: "pro" });
        const res = await authed(userId, "/voices/library");
        expect(res.status).toBe(503);
    });
});

describe("POST /voices/design", () => {
    it("402s on a plan without designed voices, before any provider call", async () => {
        const { userId } = await seedUser({ plan: "starter" });
        const res = await authed(
            userId,
            "/voices/design",
            jsonInit("POST", { description: "a warm unhurried british narrator, low pitch" }),
        );
        expect(res.status).toBe(402);
        expect(((await res.json()) as { upgrade?: boolean }).upgrade).toBe(true);
    });

    it("400s a description the provider would reject as too short", async () => {
        const { userId } = await seedUser({ plan: "pro" });
        const res = await authed(userId, "/voices/design", jsonInit("POST", { description: "hi" }));
        expect(res.status).toBe(400);
    });
});

describe("POST /voices/design/keep", () => {
    it("402s on a plan without designed voices", async () => {
        const { userId } = await seedUser({ plan: "starter" });
        const res = await authed(
            userId,
            "/voices/design/keep",
            jsonInit("POST", { generatedVoiceId: "g1", name: "Ada" }),
        );
        expect(res.status).toBe(402);
    });
});

describe("the plan's shelf cap", () => {
    it("refuses a save past it, with an upgrade to offer", async () => {
        const { userId, workspaceId } = await seedUser({ plan: "starter" }); // 3 voices
        for (let i = 0; i < 3; i++) {
            n += 1;
            const v = await adopt(
                { externalId: `cap-${n}-${Date.now()}`, ownerId: "o", name: `V${n}` },
                fake,
            );
            await shelve(workspaceId, v.id);
        }
        const res = await authed(
            userId,
            "/voices",
            jsonInit("POST", { externalId: "one-too-many", ownerId: "o", name: "Extra" }),
        );
        expect(res.status).toBe(402);
        expect(((await res.json()) as { upgrade?: boolean }).upgrade).toBe(true);
    });
});
