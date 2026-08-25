// @vitest-environment happy-dom
import "@elements/register";
import { beforeAll, describe, expect, it } from "vitest";
import type { ArtifactContent, ElementInstance } from "@model/artifact";
import type { SectionLayer } from "@canvas/render/backends";
import { createSectionStackCache, paintSectionStack } from "@canvas/render/backends";
import { affordanceEdit, seedViewerPatches, withViewerPatches } from "@elements/ops";
import { elementRegionId, parseHitRegion } from "@model/artifact";
import { resolveProfile } from "@engine/profile";
import { artifactOf, inst, installCanvas2D, sectionOf, tokens } from "@canvas/testkit";

beforeAll(() => installCanvas2D());
const web = resolveProfile("web");

const collapsibleFaq = inst("faq", {
    collapse: "collapsible",
    children: [
        inst("text", { text: "What is it?", style: "h3" }),
        inst("text", { text: "The answer nobody can read yet." }),
    ],
});

const content = (): ArtifactContent =>
    artifactOf([
        sectionOf(collapsibleFaq, { id: "s1" }),
        sectionOf(inst("text", { text: "A second section" }), { id: "s2" }),
    ]);

// The playback surface's loop, in miniature: paint, press, patch, repaint through the same cache.
function surface(): {
    draw: (art: ArtifactContent) => { layers: SectionLayer[]; text: string };
    press: (art: ArtifactContent) => ArtifactContent;
} {
    const host = document.createElement("div");
    const cache = createSectionStackCache();
    const patches = new Map<string, Record<string, unknown>>();
    let regions: ReturnType<typeof paintSectionStack>["regions"] = [];
    return {
        draw: (art) => {
            const out = paintSectionStack(host, art.sections, web, tokens, { fullW: 900, cache });
            regions = out.regions;
            return { layers: out.layers, text: host.textContent ?? "" };
        },
        press: (art) => {
            const region = regions.find((r) => parseHitRegion(r.id));
            const hit = parseHitRegion(region!.id)!;
            const shown = withViewerPatches(art, patches);
            const edit = affordanceEdit(shown, hit.action, hit.address)!;
            const key = elementRegionId(edit.address);
            patches.set(key, { ...patches.get(key), ...edit.patch });
            return withViewerPatches(art, patches);
        },
    };
}

describe("a viewer toggle in a continuous format", () => {
    it("opens the pressed row and repaints only the section it lives in", () => {
        const art = content();
        const s = surface();
        const before = s.draw(art);
        expect(before.text).not.toContain("The answer nobody can read yet.");

        const after = s.draw(s.press(art));
        expect(after.text).toContain("The answer nobody can read yet.");
        // `nodes` is reassigned only when a section actually re-paints
        expect(after.layers[0]!.nodes).not.toBe(before.layers[0]!.nodes);
        expect(after.layers[1]!.nodes).toBe(before.layers[1]!.nodes);
        expect(after.layers[1]!.el).toBe(before.layers[1]!.el);
    });

    it("writes nothing back: the stored tree the surface was handed is untouched", () => {
        const art = content();
        const json = JSON.stringify(art);
        const s = surface();
        s.draw(art);
        const shown = s.draw(s.press(art));
        expect(JSON.stringify(art)).toBe(json);
        expect(shown.text).toContain("The answer nobody can read yet.");
    });

    it("a second press closes it again, so the override is a toggle and not a one-way door", () => {
        const art = content();
        const s = surface();
        s.draw(art);
        const opened = s.press(art);
        s.draw(opened);
        expect(s.draw(s.press(art)).text).not.toContain("The answer nobody can read yet.");
    });
});

describe("a popup on load", () => {
    const withPanel = (open: boolean): ElementInstance =>
        inst("popup", {
            label: "Details",
            open,
            children: [inst("text", { text: "The floating panel's own line." })],
        });
    const authoredOpen = artifactOf([sectionOf(withPanel(true), { id: "s1" })]);

    it("paints the trigger alone even where the author left it open: no surface flows the panel", () => {
        const host = document.createElement("div");
        const { height } = paintSectionStack(host, authoredOpen.sections, web, tokens, {
            fullW: 900,
        });
        expect(host.textContent).toContain("Details");
        expect(host.textContent).not.toContain("The floating panel's own line.");
        // and the section is no taller for it, which is what made a pinned nav unusable
        const shutHost = document.createElement("div");
        const shut = [sectionOf(withPanel(false), { id: "s2" })];
        const flat = paintSectionStack(shutHost, shut, web, tokens, { fullW: 900 });
        expect(height).toBe(flat.height);
    });

    it("starts shut for a reader, leaving only the trigger under the live overlay", () => {
        const host = document.createElement("div");
        const shown = withViewerPatches(authoredOpen, seedViewerPatches(authoredOpen));
        const { regions } = paintSectionStack(host, shown.sections, web, tokens, { fullW: 900 });
        expect(host.textContent).toContain("Details");
        expect(host.textContent).not.toContain("The floating panel's own line.");
        // the box the overlay anchors to is the trigger's, so a press cannot land past it
        const box = regions.find((r) => r.id === "el:s1")!.box;
        expect(box.h).toBeLessThan(60);
    });
});
