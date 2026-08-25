// @vitest-environment happy-dom
import "@elements/register";
import { beforeAll, describe, expect, it } from "vitest";
import type { Region } from "@engine/node";
import { elementRegionId } from "@model/artifact";
import { resolveProfile } from "@engine/profile";
import { createSectionStackCache, paintSectionStack } from "@canvas/render/backends";
import { artifactOf, inst, installCanvas2D, sectionOf, tokens } from "@canvas/testkit";
import { viewerToggleAt } from "@elements/ops";

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
