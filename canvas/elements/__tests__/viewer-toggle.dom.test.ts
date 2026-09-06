// @vitest-environment happy-dom
import "@elements/register";
import { beforeAll, describe, expect, it } from "vitest";
import type { Region } from "@engine/node";
import { elementRegionId } from "@model/artifact";
import { resolveProfile } from "@engine/profile";
import { createSectionStackCache, paintSectionStack } from "@canvas/render/backends";
import { artifactOf, inst, installCanvas2D, sectionOf, tokens } from "@canvas/testkit";
import { datumLabel, viewerDatumAt, viewerToggleAt } from "@elements/ops";

beforeAll(() => installCanvas2D());
const web = resolveProfile("web");

const faq = inst("faq", {
    collapse: "collapsible",
    children: [
        inst("text", { text: "What is it?", style: "h3" }),
        inst("text", { text: "The answer nobody can read yet." }),
    ],
});

const tabs = inst("tabs", {
    labels: "Summary, Detail",
    active: 0,
    children: [
        inst("text", { text: "The short version." }),
        inst("text", { text: "The long version." }),
    ],
});

const menu = inst("popup", {
    label: "Explore",
    variant: "menu",
    children: [inst("button", { label: "Pricing", href: "#pricing", variant: "ghost" })],
});

function paint(root = faq): { regions: Region[]; art: ReturnType<typeof artifactOf> } {
    const art = artifactOf([sectionOf(root, { id: "s1" })]);
    const host = document.createElement("div");
    const { regions } = paintSectionStack(host, art.sections, web, tokens, {
        fullW: 900,
        cache: createSectionStackCache(),
    });
    return { regions, art };
}

const centre = (r: Region): { x: number; y: number } => ({
    x: r.box.x + r.box.w / 2,
    y: r.box.y + r.box.h / 2,
});

describe("viewerToggleAt", () => {
    it("returns the disclosure edit for a press inside a hit region", () => {
        const { regions, art } = paint();
        const hit = regions.find((r) => r.id.startsWith("hit:disclose:"))!;
        const toggle = viewerToggleAt(art, regions, centre(hit));
        expect(toggle).not.toBeNull();
        expect(toggle!.patch).toEqual({ open: true });
        expect(toggle!.key.startsWith("el:s1:")).toBe(true);
    });

    it("is inert outside every hit region", () => {
        const { regions, art } = paint();
        expect(viewerToggleAt(art, regions, { x: -50, y: -50 })).toBeNull();
    });

    it("stands down on an element that owns a live overlay", () => {
        const { regions, art } = paint(menu);
        const hit = regions.find((r) => r.id.startsWith("hit:disclose:"))!;
        expect(viewerToggleAt(art, regions, centre(hit))).toBeNull();
    });

    it("carries a press on a pinned layer back to the static layout", () => {
        const { regions, art } = paint();
        const hit = regions.find((r) => r.id.startsWith("hit:disclose:"))!;
        const at = centre(hit);
        const scrolled = { x: at.x, y: at.y + 240 };
        expect(viewerToggleAt(art, regions, scrolled)).toBeNull();
        expect(viewerToggleAt(art, regions, scrolled, () => 240)).not.toBeNull();
    });

    it("keys a tab press at the container whose active index moves, not the panel pressed", () => {
        const { regions, art } = paint(tabs);
        const strip = regions.filter((r) => r.id.startsWith("hit:tab:"));
        expect(strip.length).toBeGreaterThan(1);
        const toggle = viewerToggleAt(art, regions, centre(strip[1]!))!;
        expect(toggle.key).toBe(elementRegionId({ section: "s1", path: [] }));
        expect(toggle.patch).toEqual({ active: 1 });
    });
});

describe("shape-aware presses", () => {
    it("presses on the polygon when a hit region carries one, not the box", () => {
        const { regions, art } = paint();
        const hit = regions.find((r) => r.id.startsWith("hit:"))!;
        const b = hit.box;
        // a sliver in the box's top-left corner: the box centre falls outside it
        const shaped: Region = {
            ...hit,
            shape: {
                kind: "poly",
                points: [
                    [b.x, b.y],
                    [b.x + 4, b.y],
                    [b.x, b.y + 4],
                ],
            },
        };
        const rest = regions.filter((r) => r !== hit);
        expect(viewerToggleAt(art, [...rest, shaped], centre(hit))).toBeNull();
        expect(viewerToggleAt(art, [...rest, shaped], { x: b.x + 1, y: b.y + 1 })).not.toBeNull();
    });
});

describe("viewerDatumAt / datumLabel", () => {
    it("finds the mark under a viewer's pointer and names its row", () => {
        const chart = inst("chart", {
            type: "bar",
            values: "4, 9",
            categories: "Alpha, Beta",
            height: 200,
        });
        const { regions, art } = paint(chart);
        const mark = regions.find((r) => r.id.startsWith("datum:"))!;
        const hit = viewerDatumAt(regions, {
            x: mark.box.x + mark.box.w / 2,
            y: mark.box.y + mark.box.h / 2,
        })!;
        expect(hit.index).toBe(0);
        expect(datumLabel(art, hit.address, hit.index)).toBe("Alpha · 4");
        expect(viewerDatumAt(regions, { x: -10, y: -10 })).toBeNull();
    });

    it("names a diagram item from its drawn shape, label and detail joined", () => {
        const d = inst("targetDiagram", { type: "target", items: "Market | everyone\nCore | few" });
        const { regions, art } = paint(d);
        const marks = regions.filter((r) => r.id.startsWith("datum:"));
        expect(marks).toHaveLength(2);
        const inner = marks[marks.length - 1]!;
        const hit = viewerDatumAt(regions, {
            x: inner.box.x + inner.box.w / 2,
            y: inner.box.y + inner.box.h / 2,
        })!;
        expect(hit.index).toBe(1); // last drawn wins: the innermost ring owns its centre
        expect(datumLabel(art, hit.address, hit.index)).toBe("Core · few");
    });
});
