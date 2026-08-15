import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mintVoiceToken, voiceReady, VoiceError } from "@services/core/ai/voice";

let savedKey: string | undefined;
beforeEach(() => {
    savedKey = process.env.ELEVENLABS_API_KEY;
    process.env.ELEVENLABS_API_KEY = "test-key";
});
afterEach(() => {
    if (savedKey === undefined) delete process.env.ELEVENLABS_API_KEY;
    else process.env.ELEVENLABS_API_KEY = savedKey;
});

const okFetch = (token = "sutkn_abc"): typeof fetch =>
    (() => Promise.resolve(new Response(JSON.stringify({ token })))) as typeof fetch;

describe("voiceReady", () => {
    it("mirrors the env key", () => {
        expect(voiceReady()).toBe(true);
        delete process.env.ELEVENLABS_API_KEY;
        expect(voiceReady()).toBe(false);
    });
});

describe("mintVoiceToken", () => {
    it("is a 503 when the key is unset, without touching the network", async () => {
        delete process.env.ELEVENLABS_API_KEY;
        const neverFetch = (() => {
            throw new Error("must not be called");
        }) as typeof fetch;
        await expect(mintVoiceToken(neverFetch)).rejects.toMatchObject({ status: 503 });
    });

    it("posts the key to the single-use-token endpoint", async () => {
        let seen: { url: string; method?: string; key?: string } | undefined;
        const spy: typeof fetch = ((url: string, init?: RequestInit) => {
            seen = {
                url,
                method: init?.method,
                key: (init?.headers as Record<string, string>)["xi-api-key"],
            };
            return Promise.resolve(new Response(JSON.stringify({ token: "sutkn_abc" })));
        }) as typeof fetch;
        await mintVoiceToken(spy);
        expect(seen).toMatchObject({
            url: "https://api.elevenlabs.io/v1/single-use-token/realtime_scribe",
            method: "POST",
            key: "test-key",
        });
    });

    it("returns a socket url carrying the session params and the token", async () => {
        const { url } = await mintVoiceToken(okFetch("sutkn_x/y"));
        const u = new URL(url);
        expect(u.protocol).toBe("wss:");
        expect(u.pathname).toBe("/v1/speech-to-text/realtime");
        expect(u.searchParams.get("model_id")).toBe("scribe_v2_realtime");
        expect(u.searchParams.get("audio_format")).toBe("pcm_16000");
        expect(u.searchParams.get("commit_strategy")).toBe("vad");
        expect(u.searchParams.get("token")).toBe("sutkn_x/y");
    });

    it("maps an unreachable or refusing provider to a 502", async () => {
        const down = (() => Promise.reject(new Error("net"))) as typeof fetch;
        await expect(mintVoiceToken(down)).rejects.toMatchObject({ status: 502 });
        const refused = (() =>
            Promise.resolve(new Response("nope", { status: 401 }))) as typeof fetch;
        await expect(mintVoiceToken(refused)).rejects.toMatchObject({ status: 502 });
        const empty = okFetch("");
        const err = await mintVoiceToken(empty).catch((e: unknown) => e);
        expect(err).toBeInstanceOf(VoiceError);
        expect((err as VoiceError).status).toBe(502);
    });
});
