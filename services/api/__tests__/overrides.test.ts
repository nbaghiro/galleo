import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { overridesFrom } from "../middleware";
import { MODEL_HEADER } from "../../core/models";

const app = new Hono().post("/echo", (c) => c.json(overridesFrom(c)));

const post = async (models: Record<string, string> | null): Promise<Response> =>
    await app.request("/echo", {
        method: "POST",
        headers: models ? { [MODEL_HEADER]: JSON.stringify(models) } : {},
    });

const OVERRIDE = { outline: "anthropic:claude-opus-5" };

describe("overridesFrom", () => {
    it("reads a served model off the header", async () => {
        expect(await (await post(OVERRIDE)).json()).toEqual(OVERRIDE);
    });

    it("is empty when no header is sent", async () => {
        expect(await (await post(null)).json()).toEqual({});
    });

    it("drops models the registry does not serve, rather than routing a call to nothing", async () => {
        expect(await (await post({ chat: "openai:gpt-4" })).json()).toEqual({});
    });

    it("drops tasks the pipeline does not have", async () => {
        expect(await (await post({ nope: "anthropic:claude-opus-5" })).json()).toEqual({});
    });
});
