import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { authed, seedUser } from "@services/__tests__/harness";

// the mint path itself is unit-covered with an injected fetch (core/ai/__tests__/voice.test.ts);
// here we prove the routes: the readiness probe, the 503 gate, and the limiter
let savedKey: string | undefined;
beforeEach(() => {
    savedKey = process.env.ELEVENLABS_API_KEY;
    delete process.env.ELEVENLABS_API_KEY;
});
afterEach(() => {
    if (savedKey === undefined) delete process.env.ELEVENLABS_API_KEY;
    else process.env.ELEVENLABS_API_KEY = savedKey;
});

describe("voice routes", () => {
    it("reports readiness from the env key", async () => {
        const { userId } = await seedUser();
        const res = await authed(userId, "/ai/voice");
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ ready: false });

        process.env.ELEVENLABS_API_KEY = "test-key";
        const on = await authed(userId, "/ai/voice");
        expect(await on.json()).toEqual({ ready: true });
    });

    it("refuses to mint without the key, and never reaches the provider", async () => {
        const { userId } = await seedUser();
        const res = await authed(userId, "/ai/voice-token", { method: "POST" });
        expect(res.status).toBe(503);
        const body = (await res.json()) as { error: string };
        expect(body.error).toContain("not configured");
    });

    // last in the file: the limiter's window outlives the other cases
    it("rate-limits token minting per client", async () => {
        const { userId } = await seedUser();
        let limited = false;
        for (let i = 0; i < 31 && !limited; i++) {
            const res = await authed(userId, "/ai/voice-token", { method: "POST" });
            limited = res.status === 429;
        }
        expect(limited).toBe(true);
    });
});
