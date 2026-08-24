import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
    durationMs,
    providerBlocked,
    providerExhausted,
    narrationHash,
    NARRATION_MODEL,
    speechReady,
    synthesize,
    toAlignment,
} from "@services/core/ai/speech";

let savedKey: string | undefined;
beforeEach(() => {
    savedKey = process.env.ELEVENLABS_API_KEY;
    process.env.ELEVENLABS_API_KEY = "test-key";
});
afterEach(() => {
    if (savedKey === undefined) delete process.env.ELEVENLABS_API_KEY;
    else process.env.ELEVENLABS_API_KEY = savedKey;
});

const ok = (body: unknown): typeof fetch =>
    (() => Promise.resolve(new Response(JSON.stringify(body)))) as typeof fetch;

const ALIGNED = {
    audio_base64: Buffer.from("fake-mp3").toString("base64"),
    alignment: {
        characters: ["h", "i", " ", "y", "o", "u"],
        character_start_times_seconds: [0, 0.1, 0.2, 0.3, 0.4, 0.5],
        character_end_times_seconds: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6],
    },
};

describe("speechReady", () => {
    it("mirrors the env key", () => {
        expect(speechReady()).toBe(true);
        delete process.env.ELEVENLABS_API_KEY;
        expect(speechReady()).toBe(false);
    });
});

describe("narrationHash", () => {
    it("is stable for the same script, voice and model", () => {
        expect(narrationHash("hello", "v1", NARRATION_MODEL)).toBe(
            narrationHash("hello", "v1", NARRATION_MODEL),
        );
    });

    it("changes when the script changes, which is what invalidates one section", () => {
        expect(narrationHash("hello", "v1", "m")).not.toBe(narrationHash("hello.", "v1", "m"));
    });

    it("changes when the voice changes, which is what invalidates the whole piece", () => {
        expect(narrationHash("hello", "v1", "m")).not.toBe(narrationHash("hello", "v2", "m"));
    });

    it("changes when the model changes, so a model swap is not served stale audio", () => {
        expect(narrationHash("hello", "v1", "m1")).not.toBe(narrationHash("hello", "v1", "m2"));
    });
});

describe("toAlignment", () => {
    it("keeps a well-formed triple", () => {
        expect(toAlignment(ALIGNED.alignment)?.characters).toHaveLength(6);
    });

    it("drops a ragged triple whole, since a half-aligned caption highlights the wrong word", () => {
        expect(
            toAlignment({ ...ALIGNED.alignment, character_end_times_seconds: [0.1] }),
        ).toBeUndefined();
    });

    it("drops anything that is not three arrays", () => {
        expect(toAlignment(undefined)).toBeUndefined();
        expect(toAlignment({})).toBeUndefined();
        expect(toAlignment({ characters: "hi" })).toBeUndefined();
    });

    it("drops an empty alignment rather than storing an empty one", () => {
        expect(
            toAlignment({
                characters: [],
                character_start_times_seconds: [],
                character_end_times_seconds: [],
            }),
        ).toBeUndefined();
    });
});

describe("durationMs", () => {
    it("takes the real end time when the alignment has one", () => {
        expect(durationMs(toAlignment(ALIGNED.alignment), 6)).toBe(600);
    });

    it("estimates from a speaking rate when there is no alignment", () => {
        expect(durationMs(undefined, 140)).toBe(10_000);
    });

    it("never reports zero, so an advance timer always has something to wait on", () => {
        expect(durationMs(undefined, 1)).toBeGreaterThanOrEqual(1000);
    });
});

describe("synthesize", () => {
    it("posts to the with-timestamps endpoint with the narration model", async () => {
        let seen: { url: string; body: unknown } | undefined;
        const spy: typeof fetch = ((url: string, init?: RequestInit) => {
            seen = { url, body: JSON.parse(String(init?.body)) };
            return Promise.resolve(new Response(JSON.stringify(ALIGNED)));
        }) as typeof fetch;
        await synthesize("hi you", "voice-1", spy);
        expect(seen?.url).toContain("/text-to-speech/voice-1/with-timestamps");
        expect(seen?.url).toContain("output_format=mp3_44100_64");
        expect(seen?.body).toMatchObject({ text: "hi you", model_id: NARRATION_MODEL });
    });

    it("returns decoded audio, its duration, and what it will be billed for", async () => {
        const out = await synthesize("hi you", "v", ok(ALIGNED));
        expect(out.audio.toString()).toBe("fake-mp3");
        expect(out.mime).toBe("audio/mpeg");
        expect(out.ms).toBe(600);
        expect(out.chars).toBe(6);
        expect(out.alignment?.characters).toHaveLength(6);
    });

    it("bills the trimmed length, not the whitespace around it", async () => {
        expect((await synthesize("   hi you   ", "v", ok(ALIGNED))).chars).toBe(6);
    });

    it("is a 503 without a key, without touching the network", async () => {
        delete process.env.ELEVENLABS_API_KEY;
        const never = (() => {
            throw new Error("must not be called");
        }) as typeof fetch;
        await expect(synthesize("hi", "v", never)).rejects.toMatchObject({ status: 503 });
    });

    it("refuses an empty script rather than paying for silence", async () => {
        const never = (() => {
            throw new Error("must not be called");
        }) as typeof fetch;
        await expect(synthesize("   ", "v", never)).rejects.toMatchObject({ status: 502 });
    });

    it("refuses a script past the model's ceiling rather than having it clipped", async () => {
        const never = (() => {
            throw new Error("must not be called");
        }) as typeof fetch;
        await expect(synthesize("x".repeat(10_001), "v", never)).rejects.toMatchObject({
            status: 502,
        });
    });

    it("is a 502 when the provider refuses or returns no audio", async () => {
        const refused = (() =>
            Promise.resolve(new Response("no", { status: 429 }))) as typeof fetch;
        await expect(synthesize("hi", "v", refused)).rejects.toMatchObject({ status: 502 });
        await expect(synthesize("hi", "v", ok({}))).rejects.toMatchObject({ status: 502 });
    });

    it("still returns audio when the provider sends no usable alignment", async () => {
        const out = await synthesize("hi", "v", ok({ audio_base64: ALIGNED.audio_base64 }));
        expect(out.alignment).toBeUndefined();
        expect(out.ms).toBeGreaterThan(0);
    });
});

describe("providerBlocked", () => {
    const refusal = (message: string): string =>
        JSON.stringify({
            detail: { type: "authentication_error", status: "missing_permissions", message },
        });

    it("reads the scope out of the provider's own refusal", () => {
        expect(providerBlocked(refusal("missing the permission text_to_speech"))).toContain(
            "text_to_speech",
        );
    });

    it("also reads a plan refusal, which is the other thing an operator has to go and change", () => {
        expect(
            providerBlocked(
                JSON.stringify({
                    detail: {
                        status: "payment_required",
                        message: "Free users cannot use library voices via the API.",
                    },
                }),
            ),
        ).toContain("Free users");
    });

    // Verbatim from the live API. It arrives as a 401, which reads as a credentials problem and is
    // not one, so the message has to reach the operator rather than "the speech service refused".
    const QUOTA = JSON.stringify({
        detail: {
            type: "invalid_request",
            code: "quota_exceeded",
            message:
                "This request exceeds your quota of 10000. You have 56 credits remaining, while 385 credits are required for this request.",
            status: "quota_exceeded",
        },
    });

    it("reads running out of characters, which is neither a key nor an outage", () => {
        expect(providerBlocked(QUOTA)).toContain("56 credits remaining");
    });

    it("is null for any other failure, which is a provider problem rather than an account one", () => {
        expect(
            providerBlocked(JSON.stringify({ detail: { status: "invalid_api_key" } })),
        ).toBeNull();
        expect(providerBlocked("not json at all")).toBeNull();
        expect(providerBlocked("")).toBeNull();
    });
});

describe("providerExhausted", () => {
    const detail = (status: string): string => JSON.stringify({ detail: { status, message: "x" } });

    // these say "this account cannot do this", so retrying on another voice buys a second refusal
    it("is true for the refusals no other voice would survive", () => {
        for (const status of ["quota_exceeded", "limited_access"])
            expect(providerExhausted(detail(status))).toBe(true);
    });

    // The one that must NOT be here: a free account refuses library voices with payment_required,
    // and reading the same words in the premade voice is exactly the way past it.
    it("is false for a refusal the premade voice can still get past", () => {
        expect(providerExhausted(detail("payment_required"))).toBe(false);
        expect(providerExhausted(detail("missing_permissions"))).toBe(false);
    });

    it("is false for anything it cannot read", () => {
        expect(providerExhausted("not json at all")).toBe(false);
        expect(providerExhausted("")).toBe(false);
    });
});

describe("synthesize on a restricted key", () => {
    it("reports a missing scope as configuration (503), not as a refusal (502)", async () => {
        const restricted = (() =>
            Promise.resolve(
                new Response(
                    JSON.stringify({
                        detail: {
                            status: "missing_permissions",
                            message:
                                "The API key you used is missing the permission text_to_speech",
                        },
                    }),
                    { status: 401 },
                ),
            )) as typeof fetch;
        await expect(synthesize("hi", "v", restricted)).rejects.toMatchObject({
            status: 503,
            message: expect.stringContaining("text_to_speech"),
        });
    });
});
