import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { generateText } from "ai";
import type { ArtifactContent, ElementInstance } from "@model/artifact";
import type { ToolContext } from "@services/core/ai/tools";
import { reviseElement } from "@services/core/ai/tools/element";

// The one seam is the model call (see .docs/testing.md §8a): everything under it is the real
// reviseElement, so what this proves is the real preservation rule, not a restatement of it.
vi.mock("ai", async (importOriginal) => {
    const actual = await importOriginal<typeof import("ai")>();
    return { ...actual, generateText: vi.fn() };
});

// the provider reads this at call time, so the scripted model stands in and no api key is needed;
// stubbed rather than assigned, since a worker runs several test files in one process
beforeAll(() => vi.stubEnv("GALLEO_FAKE_AI", "1"));
afterAll(() => vi.unstubAllEnvs());

const reply = (text: string): void => {
    vi.mocked(generateText).mockResolvedValue({ text } as Awaited<ReturnType<typeof generateText>>);
};

// the site's topbar as the model wrote it once: a docked row of ghost links
const NAV: ElementInstance = {
    type: "container",
    layout: { dock: "top", width: "fill" },
    data: {
        direction: "row",
        children: [
            { type: "text", data: { text: "Kestrel", style: "label" }, layout: { width: "fill" } },
            {
                type: "button",
                data: { label: "Pricing", href: "#pricing" },
                layout: { width: "fit" },
            },
        ],
    },
};

const content: ArtifactContent = {
    format: "web",
    theme: "studio",
    sections: [{ id: "hero", root: { type: "container", data: { children: [NAV] } } }],
};

const ctx = { image: {} } as ToolContext;

describe("reviseElement keeps the structure and rewrites only the content", () => {
    beforeEach(() => vi.mocked(generateText).mockReset());

    it("carries the original layout through, dock and all, when the model omits it", async () => {
        reply(
            JSON.stringify({
                type: "container",
                data: {
                    direction: "row",
                    children: [
                        { type: "text", data: { text: "Kestrel", style: "label" } },
                        { type: "button", data: { label: "Plans", href: "#pricing" } },
                    ],
                },
            }),
        );
        const out = await reviseElement(content, "hero", NAV, ctx, "rename the pricing link");
        expect(out.layout).toEqual({ dock: "top", width: "fill" });
        expect(out.type).toBe("container");
        const kids = (out.data as { children: ElementInstance[] }).children;
        expect((kids[1]!.data as { label: string }).label).toBe("Plans");
    });

    it("ignores a layout the model invents, so a revision cannot undock the topbar", async () => {
        reply(
            JSON.stringify({
                type: "container",
                layout: { width: { pct: 40 } },
                data: { direction: "col", children: [] },
            }),
        );
        const out = await reviseElement(content, "hero", NAV, ctx);
        expect(out.layout).toEqual({ dock: "top", width: "fill" });
    });

    it("asks the model again when the reply is not JSON at all", async () => {
        reply("sure, here you go!");
        await expect(reviseElement(content, "hero", NAV, ctx)).rejects.toThrow("unreadable");
        expect(vi.mocked(generateText)).toHaveBeenCalledTimes(2);
    });
});
