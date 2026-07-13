import { describe, it, expect, vi, afterEach } from "vitest";
import type { ArtifactContent, ArtifactInput, ElementInstance } from "@model/artifact";
import type { TurnEvent, TurnRequest } from "@model/ai";
import { ApiError, api, streamTurn } from "../api";

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
    body?: { getReader: () => { read: () => Promise<{ value?: Uint8Array; done: boolean }> } };
}

function jsonResponse(
    body: unknown,
    init: { ok?: boolean; status?: number; statusText?: string } = {},
): StubResponse {
    const status = init.status ?? 200;
    return {
        ok: init.ok ?? (status >= 200 && status < 300),
        status,
        statusText: init.statusText ?? "OK",
        headers: { get: () => "application/json" },
        json: async () => body,
        text: async () => JSON.stringify(body),
    };
}

function streamResponse(chunks: string[]): StubResponse {
    const encoded = chunks.map((c) => new TextEncoder().encode(c));
    let i = 0;
    return {
        ok: true,
        status: 200,
        statusText: "OK",
        headers: { get: () => "text/event-stream" },
        json: async () => ({}),
        text: async () => "",
        body: {
            getReader: () => ({
                read: async (): Promise<{ value?: Uint8Array; done: boolean }> => {
                    if (i >= encoded.length) return { done: true };
                    const value = encoded[i];
                    i += 1;
                    return { value, done: false };
                },
            }),
        },
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

function bodyOf(call: FetchCall): unknown {
    return JSON.parse((call.init?.body as string) ?? "null");
}

function headerOf(call: FetchCall, name: string): string | undefined {
    const headers = call.init?.headers as Record<string, string> | undefined;
    return headers?.[name];
}

async function caught(p: Promise<unknown>): Promise<ApiError> {
    try {
        await p;
    } catch (e) {
        if (e instanceof ApiError) return e;
        throw e;
    }
    throw new Error("expected the promise to reject");
}

const content: ArtifactContent = { format: "deck", theme: "aurora", sections: [] };
const element: ElementInstance = { type: "heading", data: { text: "Hi" } };

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe("req — shared request/response behavior", () => {
    it("prefixes /api, sends same-origin credentials + JSON content-type, and parses the body", async () => {
        const artifact = { id: "a1", title: "Deck" };
        const calls = stubFetch(jsonResponse({ artifact }));
        const result = await api.getArtifact("a1");

        const call = firstCall(calls);
        expect(calls).toHaveLength(1);
        expect(call.url).toBe("/api/artifacts/a1");
        expect(call.init?.method).toBeUndefined(); // a GET
        expect(call.init?.credentials).toBe("same-origin");
        expect(headerOf(call, "Content-Type")).toBe("application/json");
        expect(result).toEqual({ artifact });
    });

    it("throws ApiError carrying the body error on a 4xx", async () => {
        stubFetch(
            jsonResponse({ error: "Bad artifact" }, { status: 400, statusText: "Bad Request" }),
        );
        const err = await caught(api.getArtifact("nope"));
        expect(err).toBeInstanceOf(ApiError);
        expect(err.status).toBe(400);
        expect(err.message).toBe("Bad artifact");
    });

    it("falls back to statusText on a 4xx with no body error", async () => {
        stubFetch(jsonResponse({}, { status: 404, statusText: "Not Found" }));
        const err = await caught(api.getArtifact("nope"));
        expect(err.status).toBe(404);
        expect(err.message).toBe("Not Found");
    });

    it("uses a generic message on a 5xx with no body error", async () => {
        stubFetch(jsonResponse({}, { status: 500, statusText: "Internal Server Error" }));
        const err = await caught(api.getArtifact("nope"));
        expect(err.status).toBe(500);
        expect(err.message).toBe("Server error — please try again");
    });

    it("still prefers the body error over the generic 5xx message", async () => {
        stubFetch(jsonResponse({ error: "Down for maintenance" }, { status: 503 }));
        const err = await caught(api.getArtifact("nope"));
        expect(err.status).toBe(503);
        expect(err.message).toBe("Down for maintenance");
    });
});

describe("representative methods (method · path · mapping)", () => {
    it("createArtifact POSTs the patch verbatim and returns the new id", async () => {
        const patch: ArtifactInput = { title: "New deck", themeId: "aurora", formatId: "deck" };
        const calls = stubFetch(jsonResponse({ id: "art_9" }));
        const result = await api.createArtifact(patch);

        const call = firstCall(calls);
        expect(call.url).toBe("/api/artifacts");
        expect(call.init?.method).toBe("POST");
        expect(bodyOf(call)).toEqual(patch);
        expect(result).toEqual({ id: "art_9" });
    });

    it("suggestSections POSTs { content } and unwraps r.suggestions", async () => {
        const calls = stubFetch(jsonResponse({ suggestions: ["Add a CTA", "Trim the intro"] }));
        const result = await api.suggestSections(content);

        const call = firstCall(calls);
        expect(call.url).toBe("/api/ai/suggest");
        expect(call.init?.method).toBe("POST");
        expect(bodyOf(call)).toEqual({ content });
        expect(result).toEqual(["Add a CTA", "Trim the intro"]);
    });

    it("reviseElement POSTs the full payload and unwraps r.element", async () => {
        const revised: ElementInstance = { type: "heading", data: { text: "Punchier" } };
        const calls = stubFetch(jsonResponse({ element: revised }));
        const result = await api.reviseElement(content, "sec1", element, "make it punchier");

        const call = firstCall(calls);
        expect(call.url).toBe("/api/ai/element");
        expect(call.init?.method).toBe("POST");
        expect(bodyOf(call)).toEqual({
            content,
            sectionId: "sec1",
            element,
            instruction: "make it punchier",
        });
        expect(result).toEqual(revised);
    });

    it("assistText POSTs the request and unwraps r.text", async () => {
        const calls = stubFetch(jsonResponse({ text: "A crisper sentence." }));
        const result = await api.assistText({ op: "rewrite", text: "a sentence" });

        const call = firstCall(calls);
        expect(call.url).toBe("/api/ai/text");
        expect(call.init?.method).toBe("POST");
        expect(bodyOf(call)).toEqual({ op: "rewrite", text: "a sentence" });
        expect(result).toBe("A crisper sentence.");
    });

    it("listTrash sends the ?trashed=1 query flag", async () => {
        const calls = stubFetch(jsonResponse({ artifacts: [] }));
        const result = await api.listTrash();

        expect(firstCall(calls).url).toBe("/api/artifacts?trashed=1");
        expect(result).toEqual({ artifacts: [] });
    });
});

describe("searchMedia — query-string encoding", () => {
    it("encodes q, sets page + kind, and appends orientation when provided", async () => {
        const calls = stubFetch(jsonResponse({ items: [], total: 0 }));
        await api.searchMedia("unsplash", "blue sky", 2, "photo", "landscape");
        expect(firstCall(calls).url).toBe(
            "/api/media/search?provider=unsplash&q=blue%20sky&page=2&kind=photo&orientation=landscape",
        );
    });

    it("omits &orientation= when it is not given (and still encodes q)", async () => {
        const calls = stubFetch(jsonResponse({ items: [], total: 0 }));
        await api.searchMedia("pexels", "cats & dogs", 1, "gif");
        expect(firstCall(calls).url).toBe(
            "/api/media/search?provider=pexels&q=cats%20%26%20dogs&page=1&kind=gif",
        );
    });
});

describe("getPublicContent — direct fetch (not via req) with URLSearchParams", () => {
    it("maps an ok response to { ok: true, content } and sets pw + k in the query", async () => {
        const payload = { title: "Deck", content, branded: true, customTheme: null };
        const calls = stubFetch(jsonResponse(payload));
        const result = await api.getPublicContent("my-slug", { pw: "secret", k: "tok123" });

        const call = firstCall(calls);
        expect(call.url).toBe("/api/p/my-slug/content?pw=secret&k=tok123");
        expect(call.init?.credentials).toBe("same-origin");
        expect(result).toEqual({ ok: true, content: payload });
    });

    it("omits the query entirely when no pw/k are given", async () => {
        const payload = { title: "Deck", content, branded: false, customTheme: null };
        const calls = stubFetch(jsonResponse(payload));
        await api.getPublicContent("my-slug");
        expect(firstCall(calls).url).toBe("/api/p/my-slug/content");
    });

    it("maps a gated 401 to { ok: false, ... } read from the body", async () => {
        stubFetch(
            jsonResponse(
                { needsPassword: true, theme: "aurora", customTheme: null, format: "deck" },
                { status: 401, statusText: "Unauthorized" },
            ),
        );
        const result = await api.getPublicContent("my-slug", { pw: "wrong" });
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

describe("streamTurn — SSE frame parsing", () => {
    const request: TurnRequest = { kind: "edit", input: { instruction: "tighten it" } };

    it("parses each data: frame → event, skips a malformed frame, buffers across chunks", async () => {
        const frames =
            'data: {"seq":0,"event":{"type":"turn.start","kind":"edit"}}\n\n' +
            "data: not-json\n\n" +
            'data: {"seq":1,"event":{"type":"reply","text":"hello"}}\n\n' +
            'data: {"seq":2,"event":{"type":"turn.done"}}\n\n';
        // Split mid-first-frame so the client must accumulate before the first "\n\n" separator.
        const cut = 30;
        stubFetch(streamResponse([frames.slice(0, cut), frames.slice(cut)]));

        const events: TurnEvent[] = [];
        await streamTurn(request, (e) => events.push(e));

        expect(events).toEqual([
            { type: "turn.start", kind: "edit" },
            { type: "reply", text: "hello" },
            { type: "turn.done" },
        ]);
    });

    it("throws ApiError before streaming when the response is not ok", async () => {
        stubFetch(
            jsonResponse(
                { error: "Out of credits" },
                { status: 402, statusText: "Payment Required" },
            ),
        );
        const err = await caught(streamTurn(request, () => undefined));
        expect(err).toBeInstanceOf(ApiError);
        expect(err.status).toBe(402);
        expect(err.message).toBe("Out of credits");
    });

    it("throws ApiError when an ok response carries no body", async () => {
        stubFetch(jsonResponse({}, { status: 200, statusText: "OK" })); // no `body` → cannot stream
        const err = await caught(streamTurn(request, () => undefined));
        expect(err).toBeInstanceOf(ApiError);
        expect(err.status).toBe(200);
    });
});
