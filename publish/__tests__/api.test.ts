import { describe, it, expect, vi, afterEach } from "vitest";
import type { ArtifactContent } from "@model/artifact";
import { publicApi } from "../api";

interface FetchCall {
    url: string;
    init: RequestInit | undefined;
}

interface StubResponse {
    ok: boolean;
    status: number;
    statusText: string;
    headers: { get: () => string };
    json: () => Promise<unknown>;
    text: () => Promise<string>;
}

function jsonResponse(
    body: unknown,
    init: { status?: number; statusText?: string } = {},
): StubResponse {
    const status = init.status ?? 200;
    return {
        ok: status >= 200 && status < 300,
        status,
        statusText: init.statusText ?? "OK",
        headers: { get: () => "application/json" },
        json: async () => body,
        text: async () => JSON.stringify(body),
    };
}

function stubFetch(response: StubResponse): FetchCall[] {
    const calls: FetchCall[] = [];
    const fn = vi.fn((input: string, init?: RequestInit): Promise<StubResponse> => {
        calls.push({ url: input, init });
        return Promise.resolve(response);
    });
    vi.stubGlobal("fetch", fn);
    return calls;
}

function firstCall(calls: FetchCall[]): FetchCall {
    const call = calls[0];
    if (!call) throw new Error("fetch was not called");
    return call;
}

const content: ArtifactContent = { format: "deck", theme: "aurora", sections: [] };

afterEach(() => vi.unstubAllGlobals());

describe("getPublicContent — direct fetch (not via req) with URLSearchParams", () => {
    it("maps an ok response to { ok: true, content } and sets pw + k in the query", async () => {
        const payload = { title: "Deck", content, branded: true, customTheme: null };
        const calls = stubFetch(jsonResponse(payload));
        const result = await publicApi.getPublicContent("my-slug", { pw: "secret", k: "tok123" });

        const call = firstCall(calls);
        expect(call.url).toBe("/api/p/my-slug/content?pw=secret&k=tok123");
        expect(call.init?.credentials).toBe("same-origin");
        // credits are resolved from the artifact's assets, so an omitted list reads as none
        expect(result).toEqual({ ok: true, content: { ...payload, credits: [] } });
    });

    it("omits the query entirely when no pw/k are given", async () => {
        const payload = { title: "Deck", content, branded: false, customTheme: null };
        const calls = stubFetch(jsonResponse(payload));
        await publicApi.getPublicContent("my-slug");
        expect(firstCall(calls).url).toBe("/api/p/my-slug/content");
    });

    it("maps a gated 401 to { ok: false, ... } read from the body", async () => {
        stubFetch(
            jsonResponse(
                { needsPassword: true, theme: "aurora", customTheme: null, format: "deck" },
                { status: 401, statusText: "Unauthorized" },
            ),
        );
        const result = await publicApi.getPublicContent("my-slug", { pw: "wrong" });
        expect(result).toEqual({
            ok: false,
            status: 401,
            needsPassword: true,
            theme: "aurora",
            customTheme: null,
            format: "deck",
        });
    });
});
