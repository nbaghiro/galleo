import "@elements/register";
import { describe, expect, it } from "vitest";
import type { ArtifactContent, ElementInstance } from "@model/artifact";
import { applyFallbacks, liveElements, seedViewerPatches, withViewerPatches } from "@elements/ops";
import { getElement, listElements } from "@elements/spec";
import { artifactOf, inst, sectionOf } from "@canvas/testkit";

const YT = "https://youtu.be/dQw4w9WgXcQ";

const art = (root: ElementInstance): ArtifactContent => artifactOf([sectionOf(root, { id: "s1" })]);

describe("liveElements", () => {
    it("reports the interactive elements with the region id their paint carries", () => {
        const found = liveElements(
            art({
                type: "container",
                data: {
                    children: [
                        inst("text", { text: "before" }),
                        inst("video", { src: YT }),
                        inst("embed", { url: YT }),
                    ],
                },
            }),
        );
        expect(found.map((e) => [e.type, e.id])).toEqual([
            ["video", "el:s1:1"],
            ["embed", "el:s1:2"],
        ]);
        expect(found[0]!.data).toMatchObject({ src: YT });
    });

    it("reads the spec's tier rather than a hardcoded list, and finds nested ones", () => {
        const interactive = listElements()
            .filter((s) => s.tier === "interactive")
            .map((s) => s.type)
            .sort();
        expect(interactive).toEqual(["embed", "video"]);
        const nested = liveElements(
            art({
                type: "container",
                data: {
                    children: [
                        { type: "container", data: { children: [inst("video", { src: YT })] } },
                    ],
                },
            }),
        );
        expect(nested.map((e) => e.id)).toEqual(["el:s1:0.0"]);
    });

    it("hands back the element's own data object, so a repaint can be recognised as unchanged", () => {
        const content = art(inst("video", { src: YT }));
        expect(liveElements(content)[0]!.data).toBe(content.sections[0]!.root.data);
    });

    it("is empty for content with nothing live in it", () => {
        expect(liveElements(art(inst("text", { text: "plain" })))).toEqual([]);
    });

    it("also reports an element whose spec sets the `live` flag while keeping its own tier", () => {
        expect(getElement("popup")!.tier).toBe("container");
        expect(getElement("popup")!.live).toBe(true);
        const found = liveElements(art(inst("popup", { children: [inst("text", { text: "x" })] })));
        expect(found.map((e) => [e.type, e.id])).toEqual([["popup", "el:s1"]]);
    });
});

describe("seedViewerPatches", () => {
    const popup = (open?: boolean): ElementInstance =>
        inst("popup", { open, children: [inst("text", { text: "the panel" })] });

    it("shuts a live element the author left open, wherever it sits", () => {
        const content = art({
            type: "container",
            data: { children: [inst("text", { text: "a" }), popup(true)] },
        });
        expect([...seedViewerPatches(content)]).toEqual([["el:s1:1", { open: false }]]);
    });

    it("patches nothing when the stored state is already shut, so no data object churns", () => {
        expect(seedViewerPatches(art(popup())).size).toBe(0);
        expect(seedViewerPatches(art(popup(false))).size).toBe(0);
    });

    it("hides the panel of an authored-open popup once the seeded patch is folded in", () => {
        const content = art(popup(true));
        const shown = withViewerPatches(content, seedViewerPatches(content));
        const root = shown.sections[0]!.root.data as { open?: boolean };
        expect(root.open).toBe(false);
        expect((content.sections[0]!.root.data as { open?: boolean }).open).toBe(true);
    });
});

describe("applyFallbacks", () => {
    it("is the identity for video and embed, whose static form is their data", () => {
        expect(getElement("video")!.fallback).toBeTypeOf("function");
        expect(getElement("embed")!.fallback).toBeTypeOf("function");
        const content = art({
            type: "container",
            data: { children: [inst("video", { src: YT }), inst("embed", { url: YT })] },
        });
        expect(applyFallbacks(content)).toBe(content);
    });

    it("rewrites only the elements that declare one, along the path to them", () => {
        const spec = getElement("video")!;
        const original = spec.fallback;
        spec.fallback = (d) => ({ ...(d as Record<string, unknown>), src: "" });
        try {
            const content = art({
                type: "container",
                data: { children: [inst("text", { text: "a" }), inst("video", { src: YT })] },
            });
            const out = applyFallbacks(content);
            expect(out).not.toBe(content);
            const kids = (out.sections[0]!.root.data as { children: ElementInstance[] }).children;
            const before = (content.sections[0]!.root.data as { children: ElementInstance[] })
                .children;
            expect(kids[0]).toBe(before[0]);
            expect(kids[1]!.data).toMatchObject({ src: "" });
        } finally {
            spec.fallback = original;
        }
    });
});
