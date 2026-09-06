import "@elements/register";
import { describe, expect, it } from "vitest";
import { layoutCtx } from "@canvas/testkit";
import type { EngineNode } from "@engine/node";
import type {} from "@model/artifact";
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
    skeletonize,
    visibleControls,
    barControls,
    inlineTextOf,
    optionsOf,
} from "@elements/spec";

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
        expect(types).toContain("container");
        expect(types.length).toBeGreaterThan(15);
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
    it("offers the three theme-relative tones beside the raw kinds", () => {
        expect(optionsOf(field("bgKind"), {}).map((o) => o.value)).toEqual([
            "none",
            "tint",
            "contrast",
            "accent",
            "color",
            "gradient",
            "image",
        ]);
    });
    it("shows no colour or image field for a tone: the theme decides the ground", () => {
        for (const key of ["bgColor", "bgFrom", "bgTo", "bgAngle", "bgImage", "bgScrim"])
            expect(field(key).visibleWhen?.({ bgKind: "tint" }), key).toBe(false);
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

describe("shape kinds", () => {
    it("every offered kind draws something, so the picker can never offer an invisible shape", async () => {
        const { SHAPE_KINDS } = await import("@model/elements");
        const { shapeVector } = await import("@elements/media/vector");
        for (const kind of SHAPE_KINDS) {
            const v = shapeVector(kind, 200, 120, { fill: { color: "#123456" } });
            expect(v.nodes.length, kind).toBeGreaterThan(0);
        }
    });
});

describe("media focal point", () => {
    const layoutOf = (data: Record<string, unknown>) =>
        getElement("media")!.layout({ kind: "photo", src: "p.png", ...data }, layoutCtx(800));

    it("passes focusX/focusY to the leaf as fractions, clamped, absent by default", () => {
        expect(layoutOf({}).image?.focus).toBeUndefined();
        expect(layoutOf({ focusX: 25, focusY: 100 }).image?.focus).toEqual({ x: 0.25, y: 1 });
        expect(layoutOf({ focusX: 180 }).image?.focus).toEqual({ x: 1, y: 0.5 });
    });

    it("offers the focus sliders only where a crop exists, same gate as zoom", () => {
        const spec = getElement("media")!;
        const on = (data: Record<string, unknown>): boolean =>
            spec.controls.some(
                (c) => c.key === "focusX" && (!c.visibleWhen || c.visibleWhen(data)),
            );
        expect(on({ kind: "photo" })).toBe(true); // photos default to cover
        expect(on({ kind: "photo", fit: "contain" })).toBe(false);
        expect(on({ kind: "video" })).toBe(false);
    });
});

describe("stored media keeps its per-kind chrome", () => {
    const iconData = { kind: "icon", glyph: { id: "search", body: "", vb: 24 }, color: "accent" };

    it("an icon normalized to `media` still gets a visible format bar", () => {
        const spec = getElement("media")!;
        const visible = (spec.bar ?? [])
            .map((k) => spec.controls.find((c) => c.key === k))
            .filter((c) => !!c && (!c.visibleWhen || c.visibleWhen(iconData)));
        expect(visible.map((c) => c!.key)).toContain("glyph");
    });

    it("and its inspector title says Icon, not Image", () => {
        const spec = getElement("media")!;
        expect(spec.labelFor?.(iconData) ?? spec.label).toBe("Icon");
    });
});

// item 8 consumers: the surface styles that now ride the richer paint instead of faking it
describe("container surfaces on the richer paint", () => {
    const surfaced = (data: Record<string, unknown>) => {
        const spec = getElement("container")!;
        return spec.layout(
            { children: [{ type: "text", data: { text: "hi" } }], ...data },
            layoutCtx(600),
        );
    };

    it("sideline and topline are real side borders, not 3px filler bars", () => {
        const side = surfaced({ surface: "sideline" });
        expect(side.fill?.border?.sides).toEqual(["left"]);
        expect(side.children?.some((c) => c.w.mode === "fixed" && c.w.value === 3)).toBe(false);
        expect(surfaced({ surface: "topline" }).fill?.border?.sides).toEqual(["top"]);
    });

    it("glass is a translucent panel with a cast shadow and backdrop blur", () => {
        const glass = surfaced({ surface: "glass" });
        expect(glass.fill?.backdropBlur).toBeGreaterThan(0);
        expect(typeof glass.fill?.shadow).toBe("object");
    });

    it("a circle panel crops its subtree to the ellipse", () => {
        const circle = surfaced({ surface: "solid", shape: "circle" });
        expect(circle.clip?.shape).toBe("ellipse");
    });
});

describe("the open tab is tab-shaped", () => {
    it("keeps square base corners on the active chip only", () => {
        const spec = getElement("tabs")!;
        const node = spec.layout(
            {
                labels: "One, Two",
                active: 0,
                children: [
                    { type: "text", data: { text: "a" } },
                    { type: "text", data: { text: "b" } },
                ],
            },
            layoutCtx(600),
        );
        const chips: EngineNode[] = [];
        const walk = (n: EngineNode): void => {
            if (Array.isArray(n.fill?.radius) || typeof n.fill?.radius === "number") chips.push(n);
            n.children?.forEach(walk);
        };
        walk(node);
        const radii = chips.map((c) => c.fill!.radius);
        expect(radii.some((r) => Array.isArray(r) && r[2] === 0 && r[3] === 0)).toBe(true);
        expect(radii.some((r) => typeof r === "number")).toBe(true);
    });
});

describe("the bar and the panel gate on the element's whole data", () => {
    const spec = getElement("media")!;
    const keys = (data: Record<string, unknown>): string[] =>
        visibleControls(spec.controls, data).map((c) => c.key);

    it("a video shows its player toggles and no fit, whatever surface asks", () => {
        const video = keys({ kind: "video", src: "v.mp4" });
        expect(video).toEqual(expect.arrayContaining(["controls", "autoplay", "loop", "muted"]));
        expect(video).not.toContain("fit");
        expect(video).not.toContain("glyph");
    });

    it("an icon shows its glyph and colour, never a source or alt text", () => {
        const icon = keys({ kind: "icon" });
        expect(icon).toEqual(["glyph", "color"]);
    });

    it("a graphic keeps its SVG import in the panel, off the bar", () => {
        expect(keys({ kind: "graphic" })).toEqual(["doc", "adoptTheme"]);
        expect(barControls(spec, { kind: "graphic" }).map((c) => c.key)).toEqual([]);
    });

    it("a photo can switch to a circle, which only the full bag can say", () => {
        expect(keys({ kind: "photo", src: "p.png" })).toContain("shape");
        expect(barControls(spec, { kind: "photo", src: "p.png" }).map((c) => c.key)).toEqual([
            "src",
            "fit",
            "shape",
        ]);
    });
});

describe("in-place labels", () => {
    it("name their key and whether they keep newlines", () => {
        expect(inlineTextOf(getElement("button")!)).toEqual({ key: "label", multiline: false });
        expect(inlineTextOf(getElement("badge")!)).toEqual({ key: "text", multiline: false });
        expect(inlineTextOf(getElement("popup")!)).toEqual({ key: "label", multiline: false });
        expect(inlineTextOf(getElement("code")!)).toEqual({ key: "code", multiline: true });
        expect(inlineTextOf(getElement("field")!)).toEqual({ key: "label", multiline: false });
        expect(inlineTextOf(getElement("contactForm")!)).toEqual({
            key: "submitLabel",
            multiline: false,
        });
        expect(inlineTextOf(getElement("text")!)).toBeNull();
    });

    it("stamp a label region the overlay can sit on", () => {
        const ids = (type: string): string[] => {
            const spec = getElement(type)!;
            const node = spec.layout(spec.create(), { ...layoutCtx(800), region: "el:s:0" });
            const out: string[] = [];
            const walk = (n: typeof node): void => {
                if (n.id) out.push(n.id);
                n.children?.forEach(walk);
            };
            walk(node);
            return out;
        };
        for (const type of ["badge", "popup", "code", "field"])
            expect(ids(type), type).toContain("label:el:s:0");
    });
});

describe("the text bar carries the clamp, since rich text never opens the panel", () => {
    it("as a numeric select the layout reads as a number", () => {
        const spec = getElement("text")!;
        const lines = spec.controls.find((c) => c.key === "maxLines")!;
        expect(spec.bar).toContain("maxLines");
        expect(lines.control).toBe("select");
        expect(lines.numeric).toBe(true);
        const node = spec.layout({ text: "a", style: "body", maxLines: 2 }, layoutCtx(800));
        expect(node.text?.maxLines).toBe(2);
    });
});
