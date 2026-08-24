import { afterEach, describe, expect, it, vi } from "vitest";
import { GOOGLE_DRIVE_SCOPE, googleTokenState } from "@services/core/accounts";
import { driveUploadPresentation } from "@services/core/google";

const NOW = new Date("2026-08-24T12:00:00Z");
const inMinutes = (m: number): Date => new Date(NOW.getTime() + m * 60_000);

describe("googleTokenState", () => {
    const row = (over: Partial<Parameters<typeof googleTokenState>[0]> = {}) => ({
        accessToken: "tok",
        accessTokenExpiresAt: inMinutes(30),
        scopes: `openid email ${GOOGLE_DRIVE_SCOPE}`,
        ...over,
    });

    it("a sign-in-only row (null tokens) is not connected", () => {
        expect(
            googleTokenState({ accessToken: null, accessTokenExpiresAt: null, scopes: null }, NOW),
        ).toBe("not-connected");
    });
    it("a live token with the Drive scope is ok", () => {
        expect(googleTokenState(row(), NOW)).toBe("ok");
    });
    it("a grant missing the Drive scope reports missing-scope (user unchecked the box)", () => {
        expect(googleTokenState(row({ scopes: "openid email profile" }), NOW)).toBe(
            "missing-scope",
        );
    });
    it("expiry includes the one-minute skew", () => {
        expect(googleTokenState(row({ accessTokenExpiresAt: inMinutes(0.5) }), NOW)).toBe(
            "expired",
        );
        expect(googleTokenState(row({ accessTokenExpiresAt: inMinutes(-5) }), NOW)).toBe("expired");
        expect(googleTokenState(row({ accessTokenExpiresAt: inMinutes(2) }), NOW)).toBe("ok");
    });
});

describe("driveUploadPresentation", () => {
    afterEach(() => vi.unstubAllGlobals());

    const bytes = new Uint8Array([1, 2, 3]);

    it("starts a resumable session, PUTs the bytes, and returns the docs URL", async () => {
        const calls: { url: string; init: RequestInit }[] = [];
        vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
            calls.push({ url: String(input), init: init ?? {} });
            if (calls.length === 1)
                return Promise.resolve(
                    new Response(null, { status: 200, headers: { location: "https://u/session" } }),
                );
            return Promise.resolve(new Response(JSON.stringify({ id: "abc123" }), { status: 200 }));
        });
        const res = await driveUploadPresentation("tok", "My deck", bytes);
        expect(res).toEqual({ url: "https://docs.google.com/presentation/d/abc123/edit" });
        expect(calls[0]!.url).toContain("uploadType=resumable");
        const meta = JSON.parse(String(calls[0]!.init.body)) as { name: string; mimeType: string };
        expect(meta).toEqual({
            name: "My deck",
            mimeType: "application/vnd.google-apps.presentation",
        });
        expect(calls[1]!.url).toBe("https://u/session");
        expect(calls[1]!.init.method).toBe("PUT");
    });

    it("maps 401/403 to unauthorized so the route can ask for a reconnect", async () => {
        vi.stubGlobal("fetch", () => Promise.resolve(new Response(null, { status: 401 })));
        expect(await driveUploadPresentation("tok", "d", bytes)).toEqual({
            error: "unauthorized",
        });
    });

    it("a failed session start reports upload-failed with detail, not a throw", async () => {
        vi.stubGlobal("fetch", () => Promise.resolve(new Response("quota", { status: 500 })));
        const res = await driveUploadPresentation("tok", "d", bytes);
        expect(res).toMatchObject({ error: "upload-failed" });
    });

    it("network errors report upload-failed", async () => {
        vi.stubGlobal("fetch", () => Promise.reject(new Error("net down")));
        expect(await driveUploadPresentation("tok", "d", bytes)).toMatchObject({
            error: "upload-failed",
        });
    });
});
