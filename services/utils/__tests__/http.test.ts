import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import type { PlanBearer } from "@model/billing";
import { z } from "zod";
import { BAD_BODY, checkLimit, readJson, requireFeature } from "@services/utils/http";

describe("plan guards", () => {
    // Hono seals its matcher on the first request, so every probe route is registered up front.
    const app = new Hono();
    const body = async (r: Response): Promise<{ error: string; upgrade: boolean }> =>
        (await r.json()) as { error: string; upgrade: boolean };

    const feature = (path: string, ws: PlanBearer, message: string): void => {
        app.get(path, (c) => {
            const gate = requireFeature(c, ws, "customThemes", message);
            return gate ?? c.json({ gated: false });
        });
    };
    const capped = (
        path: string,
        plan: string,
        current: number,
        message?: (cap: number) => string,
    ): void => {
        app.get(path, (c) => {
            const gate = checkLimit(c, { plan }, "maxArtifacts", current, message);
            return gate ?? c.json({ gated: false });
        });
    };

    feature("/pro", { plan: "pro" }, "nope");
    feature("/free", { plan: "free" }, "Themes are Pro.");
    feature("/override", { plan: "free", featureOverrides: { customThemes: true } }, "nope");
    capped("/under", "free", 9);
    capped("/at", "free", 10);
    capped("/unlimited", "pro", 999_999);
    capped("/message", "free", 10, (cap) => `Free tops out at ${cap}.`);

    it("requireFeature passes a granted feature and 402s a withheld one", async () => {
        expect((await app.request("/pro")).status).toBe(200);
        const res = await app.request("/free");
        expect(res.status).toBe(402);
        expect(await body(res)).toEqual({ error: "Themes are Pro.", upgrade: true });
    });

    it("requireFeature honours a per-workspace override over the plan grant", async () => {
        expect((await app.request("/override")).status).toBe(200);
    });

    it("checkLimit allows below the cap, blocks at it, and never blocks an unlimited one", async () => {
        expect((await app.request("/under")).status).toBe(200);
        expect((await app.request("/at")).status).toBe(402);
        expect((await app.request("/unlimited")).status).toBe(200);
    });

    it("checkLimit passes the resolved cap to the message builder", async () => {
        expect(await body(await app.request("/message"))).toEqual({
            error: "Free tops out at 10.",
            upgrade: true,
        });
    });
});

describe("readJson", () => {
    const zBody = z.object({ name: z.string().optional(), n: z.number().optional() });
    const app = new Hono();
    app.post("/echo", async (c) => {
        const body = await readJson(c, zBody);
        return body ? c.json({ ok: true, body }) : c.json(BAD_BODY, 400);
    });
    app.post("/strict", async (c) => {
        const body = await readJson(c, z.object({ id: z.string() }));
        return body ? c.json({ ok: true }) : c.json(BAD_BODY, 400);
    });

    const post = async (path: string, init?: RequestInit): Promise<Response> =>
        await app.request(path, { method: "POST", ...init });
    const json = (v: unknown): RequestInit => ({
        headers: { "content-type": "application/json" },
        body: JSON.stringify(v),
    });

    it("accepts a matching body", async () => {
        const res = await post("/echo", json({ name: "a", n: 1 }));
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ ok: true, body: { name: "a", n: 1 } });
    });

    // POST /workspace/leave is called with no body and relies on the all-optional fallback
    it("reads an absent body as {} so all-optional routes still work", async () => {
        expect((await post("/echo")).status).toBe(200);
    });

    it("rejects an absent body when a field is required", async () => {
        expect((await post("/strict")).status).toBe(400);
    });

    it("rejects a body whose field has the wrong type", async () => {
        expect((await post("/echo", json({ n: "not a number" }))).status).toBe(400);
    });

    it("rejects malformed json and non-object bodies", async () => {
        expect(
            (
                await post("/echo", {
                    headers: { "content-type": "application/json" },
                    body: "{oops",
                })
            ).status,
        ).toBe(400);
        expect((await post("/echo", json("a string"))).status).toBe(400);
    });
});
