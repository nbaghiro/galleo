import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { ArtifactContent } from "@model/artifact";
import { seedUser } from "@services/__tests__/harness";
import { db } from "@services/db/client";
import { schema } from "@services/db/schema";
import { adopt, shelfFor, shelve } from "@services/core/voices";
import {
    audioFor,
    manifestFor,
    narratable,
    prepare,
    previousSpoken,
    pruneOrphans,
    trackFor,
} from "@services/core/narration";

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
const provider = (): { fetch: typeof fetch; calls: () => number } => {
    let calls = 0;
    const fn = ((url: string) => {
        calls += 1;
        const isAdd = String(url).includes("/voices/add");
        if (isAdd) return Promise.resolve(new Response(JSON.stringify({ voice_id: "acct-v" })));
        return Promise.resolve(
            new Response(
                JSON.stringify({
                    audio_base64: Buffer.from("mp3").toString("base64"),
                    alignment: {
                        characters: ["a", "b"],
                        character_start_times_seconds: [0, 1],
                        character_end_times_seconds: [1, 2],
                    },
                }),
            ),
        );
    }) as typeof fetch;
    return { fetch: fn, calls: () => calls };
};

const content = (...spoken: (string | null)[]): ArtifactContent => ({
    format: "deck",
    theme: "studio",
    sections: spoken.map((s, i) => ({
        id: `s${i + 1}`,
        root: { type: "text", data: { text: `body ${i + 1}` } },
        ...(s ? { notes: { spoken: s } } : {}),
    })),
});

async function seedArtifact(workspaceId: string, c: ArtifactContent): Promise<string> {
    const [a] = await db
        .insert(schema.artifacts)
        .values({
            workspaceId,
            draftContent: c as typeof schema.artifacts.$inferInsert.draftContent,
        })
        .returning({ id: schema.artifacts.id });
    return a!.id;
}

async function withVoice(): Promise<{ workspaceId: string; artifactId: string; f: typeof fetch }> {
    const { workspaceId } = await seedUser({});
    const p = provider();
    n += 1;
    const v = await adopt(
        { externalId: `lib-${n}-${Date.now()}`, ownerId: "o", name: "Narrator" },
        p.fetch,
    );
    await shelve(workspaceId, v.id);
    const artifactId = await seedArtifact(workspaceId, content("one", "two"));
    return { workspaceId, artifactId, f: p.fetch };
}

const drain = async (gen: AsyncGenerator<{ chars: number; cached: boolean }>) => {
    const out: { chars: number; cached: boolean }[] = [];
    for await (const e of gen) out.push(e);
    return out;
};

describe("narratable", () => {
    it("is only the sections with something to say", () => {
        expect(narratable(content("one", null, "  ", "four")).map((s) => s.id)).toEqual([
            "s1",
            "s4",
        ]);
    });
});

describe("previousSpoken", () => {
    it("is the nearest section behind this one that actually says something", () => {
        const c = content("one", null, "  ", "four");
        expect(previousSpoken(c, "s4")).toBe("one"); // s2 and s3 are silent, so they are skipped
        expect(previousSpoken(c, "s1")).toBe("");
    });
});

describe("prepare", () => {
    it("synthesizes each narratable section and stores the audio", async () => {
        const { workspaceId, artifactId, f } = await withVoice();
        const events = await drain(
            prepare(artifactId, content("one", "two"), workspaceId, undefined, f),
        );
        expect(events).toHaveLength(2);
        expect(events.every((e) => !e.cached)).toBe(true);
        const rows = await db
            .select()
            .from(schema.narrations)
            .where(eq(schema.narrations.artifactId, artifactId));
        expect(rows).toHaveLength(2);
        expect(rows[0]?.ms).toBe(2000); // from the alignment, not an estimate
    });

    it("reports every section cached on a second run and bills nothing", async () => {
        const { workspaceId, artifactId, f } = await withVoice();
        const c = content("one", "two");
        await drain(prepare(artifactId, c, workspaceId, undefined, f));
        const again = await drain(prepare(artifactId, c, workspaceId, undefined, f));
        expect(again.every((e) => e.cached)).toBe(true);
        expect(again.reduce((n, e) => n + e.chars, 0)).toBe(0);
    });

    it("re-synthesizes only the section whose script changed", async () => {
        const { workspaceId, artifactId, f } = await withVoice();
        await drain(prepare(artifactId, content("one", "two"), workspaceId, undefined, f));
        const events = await drain(
            prepare(artifactId, content("one", "two, edited"), workspaceId, undefined, f),
        );
        expect(events.map((e) => e.cached)).toEqual([true, false]);
        // the superseded row is dropped, so a section holds exactly one current recording
        const rows = await db
            .select()
            .from(schema.narrations)
            .where(eq(schema.narrations.artifactId, artifactId));
        expect(rows).toHaveLength(2);
    });

    it("skips a section with no notes rather than paying for silence", async () => {
        const { workspaceId, artifactId, f } = await withVoice();
        const events = await drain(
            prepare(artifactId, content("one", null), workspaceId, undefined, f),
        );
        expect(events).toHaveLength(1);
    });

    it("narrates only the sections it was given", async () => {
        const { workspaceId, artifactId, f } = await withVoice();
        const events = await drain(
            prepare(artifactId, content("one", "two"), workspaceId, ["s2"], f),
        );
        expect(events).toHaveLength(1);
    });

    // A workspace that has never chosen a voice gets one rather than being refused: narration has
    // to work before anyone opens settings. The library is tried first and the premade voice backs
    // it up, which is what "the premade fallback" below covers.
    it("gives a workspace with no voice one, rather than refusing", async () => {
        const { workspaceId } = await seedUser({});
        const artifactId = await seedArtifact(workspaceId, content("one"));
        const events = await drain(
            prepare(artifactId, content("one"), workspaceId, undefined, provider().fetch),
        );
        expect(events).toHaveLength(1);
        expect(await shelfFor(workspaceId)).toHaveLength(1);
    });
});

describe("manifestFor", () => {
    const url = (s: string, h: string): string => `/a/${s}?v=${h}`;

    it("lists a prepared section as a track and an unprepared one as stale", async () => {
        const { workspaceId, artifactId, f } = await withVoice();
        await drain(prepare(artifactId, content("one"), workspaceId, ["s1"], f));
        const m = await manifestFor(artifactId, content("one", "two"), workspaceId, url);
        expect(m.tracks.map((t) => t.sectionId)).toEqual(["s1"]);
        expect(m.stale).toEqual(["s2"]);
        expect(m.voiceName).toBe("Narrator");
    });

    it("mentions a section with no notes in neither list, so the player skips it", async () => {
        const { workspaceId, artifactId, f } = await withVoice();
        await drain(prepare(artifactId, content("one", null), workspaceId, undefined, f));
        const m = await manifestFor(artifactId, content("one", null), workspaceId, url);
        expect(m.tracks).toHaveLength(1);
        expect(m.stale).toEqual([]);
    });

    it("carries the spoken text and the alignment a caption needs", async () => {
        const { workspaceId, artifactId, f } = await withVoice();
        await drain(prepare(artifactId, content("one"), workspaceId, ["s1"], f));
        const m = await manifestFor(artifactId, content("one"), workspaceId, url);
        expect(m.tracks[0]?.spoken).toBe("one");
        expect(m.tracks[0]?.alignment?.characters).toEqual(["a", "b"]);
    });

    it("goes stale for every section once the script moves on", async () => {
        const { workspaceId, artifactId, f } = await withVoice();
        await drain(prepare(artifactId, content("one", "two"), workspaceId, undefined, f));
        const m = await manifestFor(artifactId, content("one!", "two!"), workspaceId, url);
        expect(m.tracks).toHaveLength(0);
        expect(m.stale).toEqual(["s1", "s2"]);
    });
});

describe("audioFor", () => {
    it("serves the bytes for a hash it holds, and nothing for one it does not", async () => {
        const { workspaceId, artifactId, f } = await withVoice();
        await drain(prepare(artifactId, content("one"), workspaceId, ["s1"], f));
        const m = await manifestFor(artifactId, content("one"), workspaceId, (s, h) => `${s}|${h}`);
        const hash = m.tracks[0]!.url.split("|")[1]!;
        expect((await audioFor(artifactId, "s1", hash))?.mime).toBe("audio/mpeg");
        expect(await audioFor(artifactId, "s1", "not-a-hash")).toBeNull();
    });
});

describe("pruneOrphans", () => {
    it("drops audio for a section the piece no longer has", async () => {
        const { workspaceId, artifactId, f } = await withVoice();
        await drain(prepare(artifactId, content("one", "two"), workspaceId, undefined, f));
        expect(await pruneOrphans(artifactId, content("one"))).toBe(1);
        const rows = await db
            .select()
            .from(schema.narrations)
            .where(eq(schema.narrations.artifactId, artifactId));
        expect(rows.map((r) => r.sectionId)).toEqual(["s1"]);
    });

    it("drops everything when the piece has no sections left", async () => {
        const { workspaceId, artifactId, f } = await withVoice();
        await drain(prepare(artifactId, content("one", "two"), workspaceId, undefined, f));
        expect(
            await pruneOrphans(artifactId, { format: "deck", theme: "studio", sections: [] }),
        ).toBe(2);
    });
});

describe("cascade", () => {
    it("takes the narration rows with the artifact", async () => {
        const { workspaceId, artifactId, f } = await withVoice();
        await drain(prepare(artifactId, content("one"), workspaceId, ["s1"], f));
        await db.delete(schema.artifacts).where(eq(schema.artifacts.id, artifactId));
        const rows = await db
            .select()
            .from(schema.narrations)
            .where(eq(schema.narrations.artifactId, artifactId));
        expect(rows).toHaveLength(0);
    });
});

describe("prepare sweeps orphans", () => {
    it("drops audio for a section that has since been deleted", async () => {
        const { workspaceId, artifactId, f } = await withVoice();
        await drain(prepare(artifactId, content("one", "two"), workspaceId, undefined, f));
        // the piece loses its second section, then is prepared again
        await drain(prepare(artifactId, content("one"), workspaceId, undefined, f));
        const rows = await db
            .select()
            .from(schema.narrations)
            .where(eq(schema.narrations.artifactId, artifactId));
        expect(rows.map((r) => r.sectionId)).toEqual(["s1"]);
    });
});

describe("the premade fallback", () => {
    /** A provider that adopts fine but refuses to SPEAK with anything but the premade voice. */
    const freeTier = (): { fetch: typeof fetch; spokenWith: () => string[] } => {
        const spokenWith: string[] = [];
        const fn = ((url: string) => {
            const u = String(url);
            if (u.includes("/shared-voices"))
                return Promise.resolve(
                    new Response(
                        JSON.stringify({
                            voices: [
                                {
                                    voice_id: `lib-${Date.now()}`,
                                    public_owner_id: "o",
                                    name: "A library voice",
                                },
                            ],
                        }),
                    ),
                );
            if (u.includes("/voices/add"))
                return Promise.resolve(new Response(JSON.stringify({ voice_id: "acct-lib" })));
            const voice = u.split("/text-to-speech/")[1]?.split("/")[0] ?? "";
            spokenWith.push(voice);
            // the exact shape a free account answers with when handed a library voice
            if (voice !== "XrExE9yKIg1WjnnlVkGX")
                return Promise.resolve(
                    new Response(
                        JSON.stringify({
                            detail: {
                                status: "payment_required",
                                message: "Free users cannot use library voices via the API.",
                            },
                        }),
                        { status: 402 },
                    ),
                );
            return Promise.resolve(
                new Response(
                    JSON.stringify({
                        audio_base64: Buffer.from("mp3").toString("base64"),
                        alignment: {
                            characters: ["a"],
                            character_start_times_seconds: [0],
                            character_end_times_seconds: [1],
                        },
                    }),
                ),
            );
        }) as typeof fetch;
        return { fetch: fn, spokenWith: () => spokenWith };
    };

    it("speaks with the premade voice when the chosen one is refused, and keeps it", async () => {
        const { workspaceId } = await seedUser({});
        const artifactId = await seedArtifact(workspaceId, content("one"));
        const p = freeTier();

        const events = await drain(
            prepare(artifactId, content("one"), workspaceId, undefined, p.fetch),
        );
        expect(events).toHaveLength(1);

        // tried the library voice, was refused, spoke with the premade one
        expect(p.spokenWith()).toEqual(["acct-lib", "XrExE9yKIg1WjnnlVkGX"]);

        // and the workspace was moved onto it, so the next run does not fail first
        const shelf = await shelfFor(workspaceId);
        expect(shelf.find((v) => v.isDefault)?.name).toBe("Matilda");
    });

    it("stores the row under the voice that actually spoke", async () => {
        const { workspaceId } = await seedUser({});
        const artifactId = await seedArtifact(workspaceId, content("one"));
        await drain(prepare(artifactId, content("one"), workspaceId, undefined, freeTier().fetch));
        const rows = await db
            .select()
            .from(schema.narrations)
            .where(eq(schema.narrations.artifactId, artifactId));
        expect(rows[0]?.voiceId).toBe("XrExE9yKIg1WjnnlVkGX");

        // the manifest finds it, which it only can if the stored hash matches that voice
        const m = await manifestFor(artifactId, content("one"), workspaceId, (s, h) => `${s}|${h}`);
        expect(m.tracks).toHaveLength(1);
        expect(m.stale).toEqual([]);
    });

    /**
     * Running out of characters is not a voice problem, and the provider reports it as a 401, which
     * reads as a bad key. It has to reach the operator in the provider's own words, and it must not
     * send the fallback off to spend a second request on a voice that costs exactly the same.
     */
    it("says so once when the account is out of characters, and tries no other voice", async () => {
        const { workspaceId } = await seedUser({});
        let calls = 0;
        const outOfCredits = ((url: string) => {
            if (!String(url).includes("/text-to-speech/"))
                return Promise.resolve(new Response(JSON.stringify({ voices: [] })));
            calls += 1;
            return Promise.resolve(
                new Response(
                    JSON.stringify({
                        detail: {
                            type: "invalid_request",
                            code: "quota_exceeded",
                            status: "quota_exceeded",
                            message:
                                "This request exceeds your quota of 10000. You have 56 credits remaining, while 385 credits are required for this request.",
                        },
                    }),
                    { status: 401 },
                ),
            );
        }) as typeof fetch;

        const c = content("one");
        const artifactId = await seedArtifact(workspaceId, c);
        await expect(
            trackFor(artifactId, c, workspaceId, "s1", (x, h) => `/a/${x}?v=${h}`, outOfCredits),
        ).rejects.toMatchObject({
            status: 503, // a plan to change, not a gateway that broke
            message: expect.stringContaining("56 credits remaining"),
        });
        expect(calls).toBe(1);
    });

    it("does not loop when the premade voice is refused too", async () => {
        const { workspaceId } = await seedUser({});
        const artifactId = await seedArtifact(workspaceId, content("one"));
        let calls = 0;
        const refuseAll = ((url: string) => {
            const u = String(url);
            if (u.includes("/shared-voices"))
                return Promise.resolve(new Response(JSON.stringify({ voices: [] })));
            calls += 1;
            return Promise.resolve(
                new Response(
                    JSON.stringify({
                        detail: {
                            status: "missing_permissions",
                            message: "missing text_to_speech",
                        },
                    }),
                    { status: 401 },
                ),
            );
        }) as typeof fetch;
        await expect(
            drain(prepare(artifactId, content("one"), workspaceId, undefined, refuseAll)),
        ).rejects.toThrow(/text_to_speech/);
        expect(calls).toBe(1); // the premade voice WAS the one refused, so no second attempt
    });
});
