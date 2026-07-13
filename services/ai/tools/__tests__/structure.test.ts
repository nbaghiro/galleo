import { describe, it, expect } from "vitest";
import type { TurnEvent } from "@model/ai";
import { THEMES } from "@themes";
import { reorderSectionTool, removeSectionTool, setFormatTool, setThemeTool } from "../structure";
import { makeContext, type Tool, type ToolContext } from "../registry";

const ctx = (): ToolContext => makeContext({ image: {} });

async function runTool<I, R>(tool: Tool<I, R>, input: I): Promise<R> {
    const gen = tool.run(input, ctx());
    let step: IteratorResult<TurnEvent, R> = await gen.next();
    while (!step.done) step = await gen.next();
    return step.value;
}

describe("reorderSectionTool", () => {
    it("afterId=null → moveSection to the front, summary mentions 'front'", async () => {
        const out = await runTool(reorderSectionTool, {
            sectionId: "s3",
            afterId: null,
            label: "Intro",
        });
        expect(out.patch).toEqual([{ op: "moveSection", id: "s3", afterId: null }]);
        expect(out.summary).toContain("front");
        expect(out.summary).toBe("Move “Intro” to the front");
    });

    it("afterId set → moves after it, no 'front' suffix", async () => {
        const out = await runTool(reorderSectionTool, {
            sectionId: "s3",
            afterId: "s1",
            label: "Proof",
        });
        expect(out.patch).toEqual([{ op: "moveSection", id: "s3", afterId: "s1" }]);
        expect(out.summary).toBe("Move “Proof”");
    });

    it("label omitted → falls back to 'section'", async () => {
        const out = await runTool(reorderSectionTool, { sectionId: "s2", afterId: "s1" });
        expect(out.summary).toBe("Move “section”");
    });
});

describe("removeSectionTool", () => {
    it("returns a removeSection patch + labelled summary", async () => {
        const out = await runTool(removeSectionTool, { sectionId: "s4", label: "Old" });
        expect(out.patch).toEqual([{ op: "removeSection", id: "s4" }]);
        expect(out.summary).toBe("Remove “Old”");
    });

    it("label omitted → 'this section'", async () => {
        const out = await runTool(removeSectionTool, { sectionId: "s4" });
        expect(out.summary).toBe("Remove “this section”");
    });
});

describe("setFormatTool", () => {
    it.each([
        ["deck", "Deck"],
        ["doc", "Doc"],
        ["web", "Site"],
    ] as const)("%s → setMeta format + 'Switch to %s'", async (format, name) => {
        const out = await runTool(setFormatTool, { format });
        expect(out.patch).toEqual([{ op: "setMeta", format }]);
        expect(out.summary).toBe(`Switch to ${name}`);
    });
});

describe("setThemeTool", () => {
    it("a valid theme id → setMeta theme patch + 'Switch theme to <name>'", async () => {
        const out = await runTool(setThemeTool, { theme: "studio" });
        expect(out.patch).toEqual([{ op: "setMeta", theme: "studio" }]);
        expect(out.summary).toBe(`Switch theme to ${THEMES["studio"]!.name}`);
    });

    it("an unknown theme id throws", async () => {
        await expect(runTool(setThemeTool, { theme: "no-such-theme" })).rejects.toThrow(
            'there is no built-in theme "no-such-theme"',
        );
    });
});
