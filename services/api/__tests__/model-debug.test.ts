import { Hono } from "hono";
import { afterEach, describe, expect, it } from "vitest";
import { MODEL_HEADER, overridesFrom } from "../model-debug";

const app = new Hono().post("/echo", (c) => c.json(overridesFrom(c)));

const post = async (models: Record<string, string> | null): Promise<Response> =>
    await app.request("/echo", {
        method: "POST",
        headers: models ? { [MODEL_HEADER]: JSON.stringify(models) } : {},
    });

const OVERRIDE = { outline: "anthropic:claude-opus-5" };

afterEach(() => {
    delete process.env.AI_MODEL_DEBUG;
});

describe("overridesFrom", () => {
    it("reads the header when the debug flag is on", async () => {
        process.env.AI_MODEL_DEBUG = "1";
        expect(await (await post(OVERRIDE)).json()).toEqual(OVERRIDE);
    });

    it("ignores the header when the flag is off", async () => {
        expect(await (await post(OVERRIDE)).json()).toEqual({});
    });

    it("ignores it for any value other than 1", async () => {
        process.env.AI_MODEL_DEBUG = "true";
        expect(await (await post(OVERRIDE)).json()).toEqual({});
    });

    it("is empty when no header is sent", async () => {
        process.env.AI_MODEL_DEBUG = "1";
        expect(await (await post(null)).json()).toEqual({});
    });

    it("drops models the registry does not serve", async () => {
        process.env.AI_MODEL_DEBUG = "1";
        expect(await (await post({ chat: "openai:gpt-4" })).json()).toEqual({});
    });
});
