// @vitest-environment happy-dom
import "@elements/register";
import { beforeEach, describe, expect, it } from "vitest";
import type { ElementInstance } from "@model/artifact";
import { colGroup } from "@model/artifact";
import { PANEL_MIN_W, PANEL_MAX_W } from "@elements/composite/popup";
import { layoutNode, measureText } from "@canvas/render/commands";
import { artifactOf, inst, installCanvas2D, sectionOf } from "@canvas/testkit";
import { loadArtifactContent, setCanvasContentWidth, setEditAccess } from "@editor/core/store";
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
