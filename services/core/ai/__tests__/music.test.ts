import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ArtifactContent } from "@model/artifact";
import {
    bespokePrompt,
    clampMs,
    compose,
    DEFAULT_MS,
    MAX_MS,
    MIN_MS,
    MUSIC_PRESETS,
    musicHash,
    musicReady,
    presetById,
} from "@services/core/ai/music";

let savedKey: string | undefined;
beforeEach(() => {
    savedKey = process.env.ELEVENLABS_API_KEY;
    process.env.ELEVENLABS_API_KEY = "test-key";
});
afterEach(() => {
    if (savedKey === undefined) delete process.env.ELEVENLABS_API_KEY;
    else process.env.ELEVENLABS_API_KEY = savedKey;
});

const deck = (format = "deck"): ArtifactContent => ({ format, theme: "studio", sections: [] });

const said = (...lines: string[]): ArtifactContent => ({
    format: "deck",
    theme: "studio",
    sections: lines.map((text, i) => ({ id: `s${i}`, root: { type: "text", data: { text } } })),
});

describe("the preset set", () => {
    it("every preset says what it must not do, which is what keeps a bed a bed", () => {
        for (const p of MUSIC_PRESETS) {
            expect(p.prompt).toContain("Instrumental only");
            expect(p.prompt).toContain("No prominent melody");
            expect(p.name).toBeTruthy();
            expect(p.description).toBeTruthy();
        }
    });

    it("has stable unique ids, since a generated row is keyed on one", () => {
        const ids = MUSIC_PRESETS.map((p) => p.id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it("resolves by id, and falls back to the default rather than to nothing", () => {
        expect(presetById("warm")?.name).toBe("Warm");
        expect(presetById(undefined)?.id).toBe("calm");
        expect(presetById("not-a-preset")).toBeUndefined();
    });
});

describe("bespokePrompt", () => {
    it("names what the piece is, so a page and a deck do not sound the same", () => {
        expect(bespokePrompt(deck("deck"))).toContain("a deck being presented");
        expect(bespokePrompt(deck("doc"))).toContain("a written document");
        expect(bespokePrompt(deck("web"))).toContain("landing page");
    });

    it("carries the theme's own mood, which is a human's words about the piece", () => {
        expect(bespokePrompt(deck(), { mood: "quiet and editorial" })).toContain(
            "quiet and editorial",
        );
    });

    it("falls back to the theme tag when there is no mood", () => {
        expect(bespokePrompt(deck(), { tag: "brutalist" })).toContain("brutalist");
    });

    it("reflects dark and light, since they do not want the same music", () => {
        expect(bespokePrompt(deck(), { isDark: true })).toContain("nocturnal");
        expect(bespokePrompt(deck(), { isDark: false })).toContain("light and open");
    });

    it("includes the title but never lets a long one run away with the prompt", () => {
        expect(bespokePrompt(deck(), {}, "The Private Ledger")).toContain("The Private Ledger");
        const long = bespokePrompt(deck(), {}, "x".repeat(400));
        expect(long).not.toContain("x".repeat(100));
    });

    // The whole point of composing per piece rather than sharing a house preset: a bed for a coastal
    // retreat should not be the bed for a quarterly review, and the only thing that knows the
    // difference is what the piece says.
    it("tells the composer what the piece is about, in the piece's own words", () => {
        const got = bespokePrompt(said("Twenty cabins on a private Pacific bluff."));
        expect(got).toContain("Twenty cabins on a private Pacific bluff.");
        expect(got).toContain("Take the mood from that, not the words.");
    });

    it("reads the opening sections, not the whole document", () => {
        const got = bespokePrompt(said("One", "Two", "Three", "Four", "Five", "Six"));
        expect(got).toContain("One");
        expect(got).toContain("Four");
        expect(got).not.toContain("Five"); // four leads is enough to place a piece
    });

    it("says nothing about the subject when the piece has no words yet", () => {
        expect(bespokePrompt(deck())).not.toContain("It is about");
    });

    it("keeps a wordy opening from running away with the prompt", () => {
        const got = bespokePrompt(said("x".repeat(400)));
        expect(got).not.toContain("x".repeat(120));
        expect(got).toContain("Instrumental only"); // the rules still land after the subject
    });

    // a bed sat behind for ten minutes wants a different shape from one behind a five-slide page
    it("tells the composer how long a sit it is", () => {
        expect(bespokePrompt(said(...Array.from({ length: 16 }, (_, i) => `Beat ${i}`)))).toContain(
            "long sit",
        );
        expect(bespokePrompt(said("Only this"))).toContain("one unbroken idea");
    });

    it("gives the same piece the same prompt every time, so it is asked for once", () => {
        const piece = said("A headline", "A second");
        expect(bespokePrompt(piece)).toBe(bespokePrompt(piece));
    });

    it("always carries the bed rules, whatever else it says", () => {
        expect(bespokePrompt(deck(), {})).toContain("Instrumental only");
    });
});

describe("clampMs", () => {
    it("keeps a length the provider will accept", () => {
        expect(clampMs(60_000)).toBe(60_000);
        expect(clampMs(10)).toBe(MIN_MS);
        expect(clampMs(9_999_999)).toBe(MAX_MS);
    });

    it("treats nothing at all as the default rather than as zero", () => {
        expect(clampMs(0)).toBe(DEFAULT_MS);
        expect(clampMs(Number.NaN)).toBe(DEFAULT_MS);
    });
});

describe("musicHash", () => {
    it("changes with the prompt, the length and the model", () => {
        const base = musicHash("calm pads", 60_000, "music_v1");
        expect(musicHash("calm pads", 60_000, "music_v1")).toBe(base);
        expect(musicHash("busy drums", 60_000, "music_v1")).not.toBe(base);
        expect(musicHash("calm pads", 90_000, "music_v1")).not.toBe(base);
        expect(musicHash("calm pads", 60_000, "music_v2")).not.toBe(base);
    });
});

describe("compose", () => {
    const audio = (): typeof fetch =>
        (() => Promise.resolve(new Response(Buffer.from("fake-mp3")))) as typeof fetch;

    it("asks for the bed it was given, clamped, in the cached format", async () => {
        let body: Record<string, unknown> = {};
        const spy: typeof fetch = ((_u: string, init?: RequestInit) => {
            body = JSON.parse(String(init?.body)) as Record<string, unknown>;
            return Promise.resolve(new Response(Buffer.from("fake-mp3")));
        }) as typeof fetch;
        await compose("calm pads", 90_000, spy);
        expect(body.prompt).toBe("calm pads");
        expect(body.music_length_ms).toBe(90_000);
        expect(body.output_format).toBe("mp3_44100_64");
    });

    it("returns the bytes and the length it actually asked for", async () => {
        const out = await compose("calm pads", 45_000, audio());
        expect(out.audio.toString()).toBe("fake-mp3");
        expect(out.mime).toBe("audio/mpeg");
        expect(out.ms).toBe(45_000);
    });

    it("is a 503 without a key, without touching the network", async () => {
        delete process.env.ELEVENLABS_API_KEY;
        const never = (() => {
            throw new Error("must not be called");
        }) as typeof fetch;
        await expect(compose("x", 10_000, never)).rejects.toMatchObject({ status: 503 });
    });

    it("refuses an empty prompt rather than paying for whatever that produces", async () => {
        const never = (() => {
            throw new Error("must not be called");
        }) as typeof fetch;
        await expect(compose("   ", 10_000, never)).rejects.toMatchObject({ status: 502 });
    });

    // this is the exact shape a free ElevenLabs account answers the music API with
    it("reports a plan refusal as configuration, in the provider's own words", async () => {
        const free = (() =>
            Promise.resolve(
                new Response(
                    JSON.stringify({
                        detail: {
                            status: "limited_access",
                            message: "Music API is not available for free users.",
                        },
                    }),
                    { status: 402 },
                ),
            )) as typeof fetch;
        await expect(compose("x", 10_000, free)).rejects.toMatchObject({
            status: 503,
            message: expect.stringContaining("not available for free users"),
        });
    });

    it("is a 502 when the provider is simply broken", async () => {
        const broken = (() =>
            Promise.resolve(new Response("nope", { status: 500 }))) as typeof fetch;
        await expect(compose("x", 10_000, broken)).rejects.toMatchObject({ status: 502 });
    });

    it("refuses an empty body rather than caching silence", async () => {
        const empty = (() => Promise.resolve(new Response(Buffer.alloc(0)))) as typeof fetch;
        await expect(compose("x", 10_000, empty)).rejects.toMatchObject({ status: 502 });
    });
});

describe("musicReady", () => {
    it("mirrors the env key", () => {
        expect(musicReady()).toBe(true);
        delete process.env.ELEVENLABS_API_KEY;
        expect(musicReady()).toBe(false);
    });
});
