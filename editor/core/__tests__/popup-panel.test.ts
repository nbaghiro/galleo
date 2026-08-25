// @vitest-environment happy-dom
import "@elements/register";
import { beforeEach, describe, expect, it } from "vitest";
import type { ElementInstance, Section } from "@model/artifact";
import { colGroup } from "@model/artifact";
import { PANEL_MIN_W, PANEL_MAX_W } from "@elements/composite/popup";
import { layoutNode, layoutSection, measureText } from "@canvas/render/commands";
import { sectionLayoutWidth } from "@canvas/render/backends";
import { profileFor } from "@engine/profile";
import { artifactOf, inst, installCanvas2D, sectionOf } from "@canvas/testkit";
import {
    canvasContentWidth,
    editor,
    editorTokens,
    loadArtifactContent,
    setCanvasContentWidth,
    setEditAccess,
} from "@editor/core/store";
import { openPopups, paintedLeafFor, panelFor } from "@editor/core/leaf";

installCanvas2D();

const LINE = "The line only the panel shows.";

const popup = (open: boolean, kids: ElementInstance[]): ElementInstance =>
    inst("popup", { label: "Details", open, children: kids });

const load = (root: ElementInstance): void => {
    setEditAccess("edit");
    loadArtifactContent("art", artifactOf([sectionOf(root, { id: "s1" })]));
    setCanvasContentWidth(1120);
};

beforeEach(() => load(colGroup([inst("text", { text: "before" })])));

describe("openPopups", () => {
    it("reports only the popups the author left open, at their real addresses", () => {
        load(
            colGroup([
                popup(false, [inst("text", { text: LINE })]),
                popup(true, [inst("text", { text: LINE })]),
            ]),
        );
        expect(openPopups()).toEqual([{ section: "s1", path: [1] }]);
    });

    it("finds one nested inside another container", () => {
        load(colGroup([colGroup([popup(true, [inst("text", { text: LINE })])])]));
        expect(openPopups()).toEqual([{ section: "s1", path: [0, 0] }]);
    });
});

describe("the floating panel the canvas paints", () => {
    beforeEach(() => load(colGroup([popup(true, [inst("text", { text: LINE, style: "h3" })])])));

    it("composes at a clamped width and addresses its children as the section would", () => {
        const panel = panelFor({ section: "s1", path: [0] })!;
        expect(panel.width).toBeGreaterThanOrEqual(PANEL_MIN_W);
        expect(panel.width).toBeLessThanOrEqual(PANEL_MAX_W);
        const { regions, commands } = layoutNode(panel.node, panel.width, measureText);
        expect(regions.map((r) => r.id)).toEqual(["el:s1:0.0"]);
        expect(commands.some((c) => c.kind === "text" && c.text.text === LINE)).toBe(true);
    });

    it("resolves a panel child's leaf to the one the panel paints, not the section's", () => {
        const address = { section: "s1", path: [0, 0] };
        const panel = panelFor({ section: "s1", path: [0] })!;
        const painted = layoutNode(panel.node, panel.width, measureText).commands.find(
            (c) => c.kind === "text" && c.text.text === LINE,
        );
        const leaf = paintedLeafFor(address);
        // the inline editor styles its overlay from this leaf, so a mismatch here is a caret that
        // sits at the wrong size over the panel
        expect(leaf).not.toBeNull();
        expect(painted && painted.kind === "text" ? painted.text : null).toEqual(leaf);
    });

    it("falls back to the section compose for an address outside any open panel", () => {
        load(
            colGroup([
                inst("text", { text: "in flow", style: "h3" }),
                popup(false, [inst("text", { text: LINE })]),
            ]),
        );
        expect(paintedLeafFor({ section: "s1", path: [0] })?.text).toBe("in flow");
        // shut: its child is painted by nobody, so the spec's own leaf stands in
        expect(paintedLeafFor({ section: "s1", path: [1, 0] })?.text).toBe(LINE);
    });
});

// The inline text editor styles its overlay from paintedLeafFor, so anything the section's contrast
// swap does to the ink has to reach it or the caret sits in a colour the canvas is not painting.
describe("the section contrast swap reaches the overlay", () => {
    const HEAD = "A headline on a cream band";
    const onBand = (theme: string, background: Section["background"]): void => {
        setEditAccess("edit");
        loadArtifactContent("art", {
            format: "doc",
            theme,
            sections: [
                sectionOf(inst("text", { text: HEAD, style: "h1" }), { id: "s1", background }),
            ],
        });
        setCanvasContentWidth(1120);
    };
    const paintedColor = (): string | undefined => {
        const section = editor.artifact.sections[0]!;
        const profile = profileFor(editor.artifact);
        const { commands } = layoutSection(
            section,
            sectionLayoutWidth(section, profile, canvasContentWidth()),
            measureText,
            editorTokens(),
            profile,
        );
        const hit = commands.find((c) => c.kind === "text" && c.text.text === HEAD);
        return hit && hit.kind === "text" ? hit.text.color : undefined;
    };

    it("matches the paint on a light band under a dark theme", () => {
        onBand("carbon", { kind: "color", color: "#E2DFD3" });
        const leaf = paintedLeafFor({ section: "s1", path: [] })!;
        expect(leaf.color).toBe("#0c0c0c");
        expect(leaf.color).not.toBe(editorTokens().ink); // the theme's own ink is near-white
        expect(paintedColor()).toBe(leaf.color);
    });

    it("matches the paint on a theme-relative contrast band too", () => {
        onBand("press", { kind: "tone", tone: "contrast" });
        const leaf = paintedLeafFor({ section: "s1", path: [] })!;
        expect(leaf.color).toBe("#ffffff");
        expect(paintedColor()).toBe(leaf.color);
    });

    it("leaves a light theme on a light band exactly where it was", () => {
        onBand("press", { kind: "color", color: "#E2DFD3" });
        const leaf = paintedLeafFor({ section: "s1", path: [] })!;
        expect(leaf.color).toBe(editorTokens().ink);
        expect(paintedColor()).toBe(leaf.color);
    });
});
