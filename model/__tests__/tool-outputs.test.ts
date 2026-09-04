import { describe, expect, it } from "vitest";
import type { Generation } from "@model/ai";
import type { ToolId, ToolSpec } from "@model/tools";
import { TOOL_SPEC, TOOLS } from "@model/tools";

const SPEC = TOOL_SPEC as Partial<Record<ToolId, ToolSpec>>;
const published = (Object.keys(TOOLS) as ToolId[]).filter(
    (id) => TOOLS[id].surfaces.includes("mcp") || TOOLS[id].surfaces.includes("api"),
);

const section = { id: "s1", root: { type: "container", data: { children: [] } } };
const generation: Generation = {
    id: "g1",
    workspaceId: "ws",
    artifactId: "a1",
    stage: "outlined",
    brief: { prompt: "a deck", surface: "deck", theme: "studio", set: { prompt: "user" } },
    briefVersion: 0,
    outline: { title: "T", beats: [{ id: "s1", label: "Open", role: "scene" }] },
    plannedAgainst: 0,
    steer: "",
    clarify: null,
    beats: { s1: { status: "done", versions: [section], active: 0 } },
    seq: 3,
    createdAt: "2026-09-01T00:00:00.000Z",
};

describe("the published output schemas", () => {
    it("exist for every tool the delegated surfaces list", () => {
        for (const id of published) expect(SPEC[id]?.output, id).toBeDefined();
    });

    it("accept what the tools actually answer with", () => {
        expect(SPEC["start-generation"]!.output!.safeParse(generation).success).toBe(true);
        expect(
            SPEC["read-generation"]!.output!.safeParse({
                generation,
                content: { format: "deck", theme: "studio", sections: [section] },
                writing: false,
            }).success,
        ).toBe(true);
        expect(SPEC["write-beat"]!.output!.safeParse(section).success).toBe(true);
        expect(
            SPEC["rename-artifact"]!.output!.safeParse({ kind: "rename", id: "a1", title: "New" })
                .success,
        ).toBe(true);
        expect(
            SPEC["find-artifacts"]!.output!.safeParse([{ id: "a1", title: "Q3", format: "deck" }])
                .success,
        ).toBe(true);
        expect(SPEC["read-artifact"]!.output!.safeParse("a digest").success).toBe(true);
    });

    it("leave the element tree open, since the catalog and not a schema teaches its fields", () => {
        const rich = {
            ...section,
            root: { type: "stat", data: { value: "12×", label: "growth", anything: [1, 2] } },
            background: { kind: "image", image: "https://x/y.jpg", scrim: 0.5 },
        };
        expect(SPEC["add-section"]!.output!.safeParse(rich).success).toBe(true);
    });

    it("reject an answer of the wrong shape, which is how a mismatch gets reported", () => {
        expect(SPEC["write-beats"]!.output!.safeParse({ written: "s1" }).success).toBe(false);
        expect(SPEC["start-generation"]!.output!.safeParse({ id: "g1" }).success).toBe(false);
    });
});
