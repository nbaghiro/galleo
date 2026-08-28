// @vitest-environment happy-dom
import "@elements/register";
import { describe, expect, it } from "vitest";
import { composeElement, scaleTokens } from "@elements/compose";
import { layout } from "@engine/layout";
import { resolveProfile } from "@engine/profile";
import { layoutSection, measureText } from "@canvas/render/commands";
import { inst, installCanvas2D, layoutCtx, measure, sectionOf, tokens } from "@canvas/testkit";

installCanvas2D();

const ctx = layoutCtx(800, resolveProfile("deck"));
const addr = { section: "s1", path: [] };

const pinnedText = (pin: NonNullable<import("@model/geometry").ElementLayout["pin"]>) =>
    inst("container", {
        children: [
            { ...inst("text", { text: "Body" }) },
            { ...inst("text", { text: "Badge" }), layout: { width: "fit" as const, pin } },
        ],
    });

describe("inline label geometry", () => {
    it("a button names its label leaf under label:<region>, and the command carries it", () => {
        const node = composeElement(inst("button", { label: "Reserve" }), ctx, {
            section: "s1",
            path: [2],
        });
        const leaf = node.children!.find((k) => k.text);
        expect(leaf?.id).toBe("label:el:s1:2");
        const { commands, regions } = layout(node, { x: 0, y: 0, w: 400, h: 200 }, measure);
        expect(regions.some((r) => r.id === "label:el:s1:2")).toBe(true);
        const cmd = commands.find((c) => c.kind === "text");
        expect(cmd?.id).toBe("label:el:s1:2");
    });
});

describe("pin → float", () => {
    it("maps anchors, offsets, z and rotate onto the engine primitives", () => {
        const node = composeElement(
            pinnedText({ x: "end", y: "start", dx: -8, dy: 8, z: 2, rotate: 15 }),
            ctx,
            addr,
        );
        const badge = node.children!.find((k) => k.float)!;
        expect(badge.float).toEqual({ x: "end", y: "start", dx: -8, dy: 8, z: 2 });
        expect(badge.rotate).toBe(15);
    });

    it("a pinned child leaves the flow: the parent's height ignores it", () => {
        const flat = composeElement(
            inst("container", { children: [inst("text", { text: "Body" })] }),
            ctx,
            addr,
        );
        const withPin = composeElement(pinnedText({ x: "end", y: "end" }), ctx, addr);
        const a = layout(flat, { x: 0, y: 0, w: 800, h: 600 }, measure);
        const b = layout(withPin, { x: 0, y: 0, w: 800, h: 600 }, measure);
        const box = (r: typeof a): { h: number } => {
            const found = r.regions.find((k) => k.id === "el:s1");
            expect(found).toBeDefined();
            return found!.box;
        };
        expect(box(b).h).toBeGreaterThan(0);
        expect(box(b).h).toBe(box(a).h);
    });

    it("a container of only pinned children keeps the empty-slot height", () => {
        const node = composeElement(
            inst("container", {
                children: [
                    {
                        ...inst("text", { text: "Badge" }),
                        layout: { pin: { x: "start", y: "start" } },
                    },
                ],
            }),
            ctx,
            addr,
        );
        expect(node.h.mode).toBe("fit");
        expect(node.h.mode === "fit" && (node.h.min ?? 0)).toBeGreaterThanOrEqual(90);
    });

    it("the min-height guard ignores docked children, which composeSection hoists away", () => {
        const node = composeElement(
            inst("container", {
                children: [
                    {
                        ...inst("container", { direction: "row", children: [] }),
                        layout: { dock: "top" as const },
                    },
                ],
            }),
            ctx,
            addr,
        );
        expect(node.h.mode === "fit" && (node.h.min ?? 0)).toBeLessThan(90);
    });

    it("token scaling rides the pin offsets", () => {
        const node = composeElement(
            pinnedText({ x: "end", y: "start", dx: -10, dy: 6 }),
            ctx,
            addr,
        );
        const scaled = scaleTokens(node, 0.5);
        const badge = scaled.children!.find((k) => k.float)!;
        expect(badge.float!.dx).toBe(-5);
        expect(badge.float!.dy).toBe(3);
    });
});

describe("section overhang", () => {
    const overflowing = () =>
        sectionOf(
            inst("container", {
                children: [
                    inst("text", { text: "Short flow" }),
                    {
                        ...inst("container", {
                            surface: "solid",
                            children: [inst("text", { text: "Tall pinned card ".repeat(12) })],
                        }),
                        layout: {
                            width: { pct: 40 },
                            pin: { x: "end", y: "start", dy: 40, rotate: -6, z: 1 },
                        },
                    },
                ],
            }),
            { background: { kind: "color", color: "#123456" } },
        );

    it("the band ground and region stretch to the pinned extent", () => {
        const { commands, regions, height } = layoutSection(
            overflowing(),
            900,
            measureText,
            tokens,
            resolveProfile("web"),
        );
        const band = commands.find((c) => c.id === "section:s1" && c.kind === "rect")!;
        expect(band.box.y + band.box.h).toBeCloseTo(height, 5);
        const region = regions.find((r) => r.id === "section:s1")!;
        expect(region.box.h).toBeCloseTo(band.box.h, 5);
        // and the height covers the turned corner, not just the flat box
        const card = commands.find((c) => c.rotate && c.kind === "rect")!;
        expect(height).toBeGreaterThanOrEqual(card.box.y + card.box.h);
    });

    it("a flow-only section is untouched", () => {
        const plain = sectionOf(inst("text", { text: "Just text" }), {
            background: { kind: "color", color: "#123456" },
        });
        const { commands, height } = layoutSection(
            plain,
            900,
            measureText,
            tokens,
            resolveProfile("web"),
        );
        const band = commands.find((c) => c.id === "section:s1" && c.kind === "rect")!;
        expect(band.box.h).toBeCloseTo(height, 5);
    });
});
