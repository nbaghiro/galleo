import { describe, it, expect, vi, afterEach } from "vitest";
import type { ArtifactContent, ArtifactInput, ElementInstance } from "@model/artifact";
import type { TurnEvent, TurnRequest } from "@model/ai";
import { ApiError, api, streamTurn } from "@app/api";

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
        expect(err.message).toBe("Server error. Please try again");
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

    // The address, not the node: the server resolves it against the content it was handed, which is
    // what lets the route and the chat agent run the same tool.
    it("reviseElement POSTs the element's address and unwraps r.element", async () => {
        const revised: ElementInstance = { type: "heading", data: { text: "Punchier" } };
        const calls = stubFetch(jsonResponse({ element: revised }));
        const result = await api.reviseElement(content, "sec1", [0, 2], "make it punchier");

        const call = firstCall(calls);
        expect(call.url).toBe("/api/ai/element");
        expect(call.init?.method).toBe("POST");
        expect(bodyOf(call)).toEqual({
            content,
            sectionId: "sec1",
            path: [0, 2],
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

        expect(firstCall(calls).url).toBe("/api/artifacts?trashed=1&limit=100");
        expect(result).toEqual({ artifacts: [] });
    });
});

describe("account methods (method · path · body)", () => {
    const user = {
        id: "u1",
        email: "a@b.c",
        name: "Ada",
        avatarUrl: null,
        emailVerified: true,
        hasPassword: true,
        prefs: {},
    };

    it("updateProfile PATCHes /me with the name", async () => {
        const calls = stubFetch(jsonResponse({ user }));
        const result = await api.updateProfile("Ada");

        const call = firstCall(calls);
        expect(call.url).toBe("/api/me");
        expect(call.init?.method).toBe("PATCH");
        expect(bodyOf(call)).toEqual({ name: "Ada" });
        expect(result).toEqual({ user });
    });

    it("updateProfile sends an explicit null to clear the name", async () => {
        const calls = stubFetch(jsonResponse({ user }));
        await api.updateProfile(null);
        expect(bodyOf(firstCall(calls))).toEqual({ name: null });
    });

    it("changePassword carries the current password when one is given", async () => {
        const calls = stubFetch(jsonResponse({ user }));
        await api.changePassword("new-password", "old-password");

        const call = firstCall(calls);
        expect(call.url).toBe("/api/me/password");
        expect(call.init?.method).toBe("POST");
        expect(bodyOf(call)).toEqual({ current: "old-password", password: "new-password" });
    });

    it("changePassword omits current when setting a first password", async () => {
        const calls = stubFetch(jsonResponse({ user }));
        await api.changePassword("first-password");
        expect(bodyOf(firstCall(calls))).toEqual({ password: "first-password" });
    });

    it("updatePrefs PATCHes only the keys it was handed", async () => {
        const calls = stubFetch(jsonResponse({ user }));
        await api.updatePrefs({ appTheme: "midnight" });

        const call = firstCall(calls);
        expect(call.url).toBe("/api/me/prefs");
        expect(call.init?.method).toBe("PATCH");
        expect(bodyOf(call)).toEqual({ appTheme: "midnight" });
    });

    it("getConnections and getMemberships are plain GETs", async () => {
        const calls = stubFetch(jsonResponse({ connections: [] }));
        await api.getConnections();
        expect(firstCall(calls).url).toBe("/api/me/connections");
        expect(firstCall(calls).init?.method).toBeUndefined();

        const more = stubFetch(jsonResponse({ memberships: [] }));
        await api.getMemberships();
        expect(firstCall(more).url).toBe("/api/me/workspaces");
    });

    it("unlinkConnection DELETEs the encoded provider", async () => {
        const calls = stubFetch(jsonResponse({ ok: true }));
        await api.unlinkConnection("google");

        const call = firstCall(calls);
        expect(call.url).toBe("/api/me/connections/google");
        expect(call.init?.method).toBe("DELETE");
    });

    it("leaveWorkspace names a workspace only when one is given", async () => {
        const named = stubFetch(jsonResponse({ ok: true }));
        await api.leaveWorkspace("ws_2");
        expect(firstCall(named).url).toBe("/api/workspace/leave");
        expect(bodyOf(firstCall(named))).toEqual({ workspaceId: "ws_2" });

        const active = stubFetch(jsonResponse({ ok: true }));
        await api.leaveWorkspace();
        expect(bodyOf(firstCall(active))).toEqual({});
    });
});

describe("access + workspace policy methods", () => {
    it("setArtifactAccess PUTs the level", async () => {
        const calls = stubFetch(jsonResponse({ ok: true, access: "view" }));
        const result = await api.setArtifactAccess("art_1", "view");

        const call = firstCall(calls);
        expect(call.url).toBe("/api/artifacts/art_1/access");
        expect(call.init?.method).toBe("PUT");
        expect(bodyOf(call)).toEqual({ access: "view" });
        expect(result).toEqual({ ok: true, access: "view" });
    });

    it("setArtifactAccess sends an explicit null to fall back to the workspace default", async () => {
        const calls = stubFetch(jsonResponse({ ok: true, access: null }));
        await api.setArtifactAccess("art_1", null);
        expect(bodyOf(firstCall(calls))).toEqual({ access: null });
    });

    it("updateWorkspaceSettings PATCHes only the keys it was handed", async () => {
        const calls = stubFetch(jsonResponse({ ok: true }));
        await api.updateWorkspaceSettings({ publishPolicy: "admins" });

        const call = firstCall(calls);
        expect(call.url).toBe("/api/workspace");
        expect(call.init?.method).toBe("PATCH");
        expect(bodyOf(call)).toEqual({ publishPolicy: "admins" });
    });

    it("updateWorkspaceSettings sends a null cap to clear the limit", async () => {
        const calls = stubFetch(jsonResponse({ ok: true }));
        await api.updateWorkspaceSettings({ memberCreditCap: null });
        expect(bodyOf(firstCall(calls))).toEqual({ memberCreditCap: null });
    });
});

describe("workspace API credentials", () => {
    it("getCredentials is a plain GET and hands back the list", async () => {
        const credentials = [
            {
                clientId: "galleo-api-abc",
                name: "CI",
                createdAt: "2026-08-01T00:00:00.000Z",
                lastUsedAt: null,
            },
        ];
        const calls = stubFetch(jsonResponse({ credentials }));
        const result = await api.getCredentials();

        const call = firstCall(calls);
        expect(call.url).toBe("/api/workspace/credentials");
        expect(call.init?.method).toBeUndefined();
        expect(result).toEqual({ credentials });
    });

    // The one response the secret appears in, so the client returns it whole rather than unwrapping
    // a field the caller would then have to re-read from somewhere it is not stored.
    it("createCredential POSTs the name and returns the secret it was given once", async () => {
        const made = { clientId: "galleo-api-abc", secret: "s3cret", name: "CI" };
        const calls = stubFetch(jsonResponse(made, { status: 201 }));
        const result = await api.createCredential("CI");

        const call = firstCall(calls);
        expect(call.url).toBe("/api/workspace/credentials");
        expect(call.init?.method).toBe("POST");
        expect(bodyOf(call)).toEqual({ name: "CI" });
        expect(result).toEqual(made);
    });

    it("surfaces the plan wall as an ApiError carrying the upgrade remedy", async () => {
        stubFetch(
            jsonResponse(
                { error: "API access is not on this plan", upgrade: true },
                { status: 402 },
            ),
        );
        const err = await caught(api.createCredential("CI"));
        expect(err.status).toBe(402);
        expect(err.remedies.upgrade).toBe(true);
    });

    it("revokeCredential DELETEs the encoded client id", async () => {
        const calls = stubFetch(jsonResponse({ ok: true }));
        await api.revokeCredential("galleo-api/abc");

        const call = firstCall(calls);
        expect(call.url).toBe("/api/workspace/credentials/galleo-api%2Fabc");
        expect(call.init?.method).toBe("DELETE");
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

    it("lets a handler's throw out, rather than eating it as a bad frame", async () => {
        // the studio raises a failed turn by throwing from its handler; swallowing that here is
        // what turned a provider error into a section that silently never arrived
        stubFetch(
            streamResponse([
                'data: {"seq":0,"event":{"type":"turn.start","kind":"edit"}}\n\n' +
                    'data: {"seq":1,"event":{"type":"error","message":"the model is overloaded"}}\n\n',
            ]),
        );
        await expect(
            streamTurn(request, (e) => {
                if (e.type === "error") throw new Error(e.message);
            }),
        ).rejects.toThrow("the model is overloaded");
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
