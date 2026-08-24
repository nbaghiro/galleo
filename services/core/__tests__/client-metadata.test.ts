import { afterEach, describe, expect, it, vi } from "vitest";
import { isMetadataClientId, resolveClient } from "@services/core/authorization";

// Client ID Metadata Documents: a client identifies itself by an https url it serves, rather than
// by a row it registered here. The document is fetched from an address the caller chose, so most of
// what is worth testing is what we refuse.

const URL_ID = "https://app.example.com/oauth/client.json";

// a fresh id per case: resolved documents are cached, which is the point of them
let seq = 0;
const freshId = (): string => `https://app.example.com/oauth/c${++seq}.json`;

const doc = (id: string, over: Record<string, unknown> = {}): string =>
    JSON.stringify({
        client_id: id,
        client_name: "Example MCP Client",
        redirect_uris: ["http://127.0.0.1:3000/callback"],
        ...over,
    });

const serve = (body: string, init: { ok?: boolean; cacheControl?: string } = {}): void => {
    vi.stubGlobal(
        "fetch",
        vi.fn(async () => ({
            ok: init.ok ?? true,
            text: async () => body,
            headers: {
                get: (h: string) => (h === "cache-control" ? (init.cacheControl ?? null) : null),
            },
        })),
    );
};

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("isMetadataClientId", () => {
    it("is an https url with a path, and nothing else", () => {
        expect(isMetadataClientId(URL_ID)).toBe(true);
        expect(isMetadataClientId("http://app.example.com/c.json")).toBe(false); // not https
        expect(isMetadataClientId("https://app.example.com")).toBe(false); // no path
        expect(isMetadataClientId("https://app.example.com/c.json#x")).toBe(false); // fragment
        expect(isMetadataClientId("galleo-abc123")).toBe(false); // a registered id
    });
});

describe("resolveClient over a metadata document", () => {
    it("takes the client's name and redirect uris from the document it serves", async () => {
        const id = freshId();
        serve(doc(id));
        const client = await resolveClient(id);
        expect(client).toEqual({
            clientId: id,
            name: "Example MCP Client",
            redirectUris: ["http://127.0.0.1:3000/callback"],
        });
    });

    it("refuses a document that claims a different client_id than the url it came from", async () => {
        const id = freshId();
        serve(doc(id, { client_id: "https://evil.example.com/other.json" }));
        expect(await resolveClient(id)).toBeNull();
    });

    it("refuses a document missing any of the three required fields", async () => {
        for (const gap of [
            { client_name: undefined },
            { redirect_uris: undefined },
            { redirect_uris: [] },
        ]) {
            const id = freshId();
            serve(doc(id, gap));
            expect(await resolveClient(id)).toBeNull();
        }
    });

    it("refuses anything that is not a document", async () => {
        const bad = freshId();
        serve("<html>not json</html>");
        expect(await resolveClient(bad)).toBeNull();
        const gone = freshId();
        serve(doc(gone), { ok: false });
        expect(await resolveClient(gone)).toBeNull();
    });

    it("never fetches a host that could name something inside our own network", async () => {
        const spy = vi.fn();
        vi.stubGlobal("fetch", spy);
        for (const id of [
            "https://localhost/c.json",
            "https://127.0.0.1/c.json",
            "https://10.1.2.3/c.json",
            "https://192.168.1.7/c.json",
            "https://169.254.169.254/latest/meta-data.json", // the cloud metadata endpoint
            "https://box.internal/c.json",
        ])
            expect(await resolveClient(id)).toBeNull();
        expect(spy).not.toHaveBeenCalled();
    });

    it("caches, so a consent screen does not refetch the document on every render", async () => {
        const id = freshId();
        const body = doc(id);
        const spy = vi.fn(async () => ({
            ok: true,
            text: async () => body,
            headers: { get: () => "max-age=600" },
        }));
        vi.stubGlobal("fetch", spy);
        await resolveClient(id);
        await resolveClient(id);
        expect(spy).toHaveBeenCalledTimes(1);
    });
});
