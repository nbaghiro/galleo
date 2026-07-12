import "@elements/register";
import { describe, expect, it } from "vitest";
import type { EngineNode } from "@engine/node";
import type { Section } from "@model/artifact";
import { fit, grow } from "@model/geometry";
import {
    GHOST,
    GHOST_LINE,
    GHOST_PANEL,
    SECTION_CONTROLS,
    bar,
    block,
    dot,
    getElement,
    listElements,
    pill,
    skeletonFor,
    skeletonize,
    walkElements,
} from "@elements/spec";
import { layoutCtx } from "@canvas/testkit";

const textLeaf = (text: string, size = 16): EngineNode => ({
    w: grow(),
    h: fit(),
    text: { text, fontId: "f", size, wrap: "words" },
});

describe("registry", () => {
    it("getElement returns a registered spec, undefined for an unknown type", () => {
        expect(getElement("text")?.type).toBe("text");
        expect(getElement("nope")).toBeUndefined();
    });
    it("listElements returns the registered set", () => {
        const types = listElements().map((s) => s.type);
        expect(types).toContain("text");
        expect(types).toContain("group");
        expect(types.length).toBeGreaterThan(15);
    });
});

describe("walkElements", () => {
    it("visits the root then its children depth-first", () => {
        const section: Section = {
            id: "s",
            root: {
                type: "group",
                data: {
                    children: [
                        { type: "text", data: { text: "a" } },
                        {
                            type: "group",
                            data: { children: [{ type: "text", data: { text: "b" } }] },
                        },
                    ],
                },
            },
        };
        const seen: string[] = [];
        walkElements(section, (el) => seen.push(el.type));
        expect(seen).toEqual(["group", "text", "group", "text"]);
    });
    it("ignores a non-array children field", () => {
        const seen: string[] = [];
        walkElements({ id: "s", root: { type: "x", data: { children: "nope" } } }, (el) =>
            seen.push(el.type),
        );
        expect(seen).toEqual(["x"]);
    });
});

describe("SECTION_CONTROLS visibleWhen", () => {
    const field = (key: string): (typeof SECTION_CONTROLS)[number] =>
        SECTION_CONTROLS.find((f) => f.key === key)!;
    it("bgColor shows only for a color background", () => {
        expect(field("bgColor").visibleWhen?.({ bgKind: "color" })).toBe(true);
        expect(field("bgColor").visibleWhen?.({ bgKind: "image" })).toBe(false);
    });
    it("bgImage + bgScrim show only for an image background", () => {
        expect(field("bgImage").visibleWhen?.({ bgKind: "image" })).toBe(true);
        expect(field("bgScrim").visibleWhen?.({ bgKind: "color" })).toBe(false);
    });
    it("gradient stops show only for a gradient background", () => {
        expect(field("bgFrom").visibleWhen?.({ bgKind: "gradient" })).toBe(true);
        expect(field("bgFrom").visibleWhen?.({ bgKind: "none" })).toBe(false);
    });
});

describe("ghost builders", () => {
    it("bar radius clamps to h/2, capped at 4", () => {
        expect(bar(0.5, 6).fill?.radius).toBe(3); // min(4, 3)
        expect(bar(1, 20).fill?.radius).toBe(4); // min(4, 10)
    });
    it("pill and dot are fully rounded", () => {
        expect(pill(0.5, 10).fill?.radius).toBe(99);
        expect(dot(8).fill?.radius).toBe(99);
    });
    it("block carries its aspect", () => {
        expect(block(1.5).aspect).toBe(1.5);
    });
});

describe("skeletonize", () => {
    it("a text leaf becomes a column of ghost bars, one to three by length", () => {
        const one = skeletonize(textLeaf("short"));
        expect(one.direction).toBe("col");
        expect(one.children).toHaveLength(1); // ≤20 chars → 1 line
        expect(skeletonize(textLeaf("x".repeat(30))).children).toHaveLength(2); // >20 → 2
        expect(skeletonize(textLeaf("x".repeat(70))).children).toHaveLength(3); // >60 → 3
    });
    it("a media leaf becomes a single ghost panel with a default 16:9 aspect", () => {
        const g = skeletonize({ w: grow(), h: fit(), image: { src: "x", fit: "cover" } });
        expect(g.aspect).toBe(16 / 9);
        expect(g.fill?.color).toBe(GHOST);
        expect(g.children).toBeUndefined();
    });
    it("a container ghosts its panel (keeping radius + border) and recurses", () => {
        const g = skeletonize({
            w: grow(),
            h: fit(),
            fill: { color: "#000", radius: 12, border: { color: "#000", width: 1 } },
            children: [textLeaf("hi", 12)],
        });
        expect(g.fill?.color).toBe(GHOST_PANEL);
        expect(g.fill?.radius).toBe(12);
        expect(g.fill?.border?.color).toBe(GHOST_LINE);
        expect(g.children).toHaveLength(1);
    });
});

describe("skeletonFor", () => {
    it("derives an auto-skeleton from a real element's layout", () => {
        expect(skeletonFor(getElement("text")!, layoutCtx()).direction).toBe("col");
    });
});
