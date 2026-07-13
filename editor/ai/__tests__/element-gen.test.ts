import "@elements/register";
import { describe, expect, it } from "vitest";
import type { ArtifactContent, ElementInstance } from "@model/artifact";
import { colGroup } from "@model/section";
import { artifactOf, inst, sectionOf } from "@canvas/testkit";
import { regenTarget } from "@editor/ai/element-gen";

// only regenTarget is pure; regenerateElement / canRegenerate touch the store + transport → skipped

const artOf = (root: ElementInstance): ArtifactContent => artifactOf([sectionOf(root)]);
const el = (type: string, children: ElementInstance[]): ElementInstance => inst(type, { children });
const at = (path: number[]): { section: string; path: number[] } => ({ section: "s1", path });

describe("regenTarget", () => {
    it("climbs out of a coupled parent — a bullet row targets the whole bullets element", () => {
        const art = artOf(el("bullets", [inst("text", { text: "point" })]));
        expect(regenTarget(art, at([0]))).toEqual({ section: "s1", path: [] });
    });

    it("climbs to the coupled unit but stops at the enclosing non-coupled group", () => {
        const art = artOf(
            colGroup([el("stat", [inst("text", { text: "30s" }), inst("text", { text: "cap" })])]),
        );
        expect(regenTarget(art, at([0, 1]))).toEqual({ section: "s1", path: [0] });
    });

    it("returns null for inert types (nothing to regenerate)", () => {
        expect(regenTarget(artOf(inst("divider", {})), at([]))).toBeNull();
        expect(regenTarget(artOf(inst("video", {})), at([]))).toBeNull();
    });

    it("returns a plain element as itself, at the root or nested under a non-coupled container", () => {
        expect(regenTarget(artOf(inst("text", { text: "hi" })), at([]))).toEqual(at([]));
        const art = artOf(colGroup([inst("text", { text: "a" }), inst("text", { text: "b" })]));
        expect(regenTarget(art, at([1]))).toEqual({ section: "s1", path: [1] });
    });
});
