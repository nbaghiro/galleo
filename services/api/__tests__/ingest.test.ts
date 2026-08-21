import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ingest } from "@services/api/ingest";

interface Forwarded {
    url: string;
    method: string;
    headers: Record<string, string>;
    body: string;
}

const app = new Hono();
app.route("/api", ingest);

describe("the analytics ingest proxy", () => {
    let realFetch: typeof globalThis.fetch;
    let forwarded: Forwarded[];

    beforeEach(() => {
        forwarded = [];
        realFetch = globalThis.fetch;
        globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
            const headers: Record<string, string> = {};
            new Headers(init?.headers).forEach((v, k) => {
                headers[k] = v;
            });
            forwarded.push({
                url: String(input),
                method: init?.method ?? "GET",
                headers,
                body: init?.body ? new TextDecoder().decode(init.body as ArrayBuffer) : "",
            });
            return new Response('{"status":1}', {
                status: 200,
                headers: { "content-type": "application/json" },
            });
        }) as typeof globalThis.fetch;
    });

    afterEach(() => {
        globalThis.fetch = realFetch;
        delete process.env.POSTHOG_HOST;
    });

    const post = async (path: string, headers: Record<string, string> = {}): Promise<Response> =>
        await app.request(path, {
            method: "POST",
            headers: {
                "content-type": "application/json",
                "cf-connecting-ip": "203.0.113.7",
                ...headers,
            },
            body: '{"api_key":"phc_test","batch":[]}',
        });

    it("forwards the path and query to the ingest host, dropping our own prefix", async () => {
        await post("/api/i/batch/?ver=1.2.3");
        expect(forwarded[0]?.url).toBe("https://us.i.posthog.com/batch/?ver=1.2.3");
        expect(forwarded[0]?.method).toBe("POST");
        expect(forwarded[0]?.body).toBe('{"api_key":"phc_test","batch":[]}');
    });

    // The session cookie would ride along by default, and it has no business at the ingest host.
    it("strips the session cookie and the host header", async () => {
        await post("/api/i/e/", { cookie: "galleo_session=secret-token" });
        expect(forwarded[0]?.headers.cookie).toBeUndefined();
        expect(forwarded[0]?.headers.host).toBeUndefined();
        expect(forwarded[0]?.headers["content-type"]).toBe("application/json");
    });

    // Without it every event would carry the server's location, which is worse than no location.
    it("passes the caller's address on for geo", async () => {
        await post("/api/i/e/");
        expect(forwarded[0]?.headers["x-forwarded-for"]).toBe("203.0.113.7");
    });

    it("honours a configured host, so a region move is one env var", async () => {
        process.env.POSTHOG_HOST = "https://eu.i.posthog.com";
        await post("/api/i/batch/");
        expect(forwarded[0]?.url).toBe("https://eu.i.posthog.com/batch/");
    });

    it("hands the upstream answer back unchanged", async () => {
        const res = await post("/api/i/batch/");
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ status: 1 });
    });
});
