import "@elements/register";
import { describe, expect, it } from "vitest";
import type { RenderCommand } from "@engine/node";
import { getElement } from "@elements/spec";
import { composeSection } from "@elements/compose";
import { inst, layoutCtx, near, runLayout, sectionOf, tokens } from "@canvas/testkit";
import { BULLET_MARKERS } from "@model/elements";

const BODY_LINE = 17 * 1.35; // the body style's line box (size × default line-height factor)

function composed(marker: string): RenderCommand[] {
    const spec = getElement("bullets")!;
    const node = spec.layout(
        {
            marker,
            children: [{ type: "text", data: { text: "First point", style: "body" } }],
        },
        layoutCtx(400),
    );
    return runLayout(node, 400, 300).commands;
}

describe("bullets", () => {
    it("centres the dot on the first line box instead of floating at the row top", () => {
        const commands = composed("dot");
        const dot = commands.find((c) => c.kind === "rect" && c.fill?.radius === 99)!;
        const text = commands.find((c) => c.kind === "text")!;
        near(dot.box.y + dot.box.h / 2, text.box.y + BODY_LINE / 2, 1);
        expect(dot.box.y).toBeGreaterThan(text.box.y + 2);
    });

    it("centres text markers (a number) the same way", () => {
        const commands = composed("number");
        const texts = commands.filter(
            (c): c is Extract<RenderCommand, { kind: "text" }> => c.kind === "text",
        );
        const badge = texts.find((c) => c.text.text === "1.")!;
        const body = texts.find((c) => c.text.text === "First point")!;
        near(badge.box.y + badge.box.h / 2, body.box.y + BODY_LINE / 2, 1);
    });

    it("registers every marker in the value-set", () => {
        for (const marker of BULLET_MARKERS) {
            const commands = composed(marker);
            expect(commands.length, marker).toBeGreaterThan(1);
        }
    });

    it("check and arrow markers are vector surfaces, not theme-font glyphs", () => {
        for (const marker of ["check", "arrow"]) {
            const commands = composed(marker);
            expect(
                commands.some((c) => c.kind === "surface"),
                marker,
            ).toBe(true);
            expect(commands.filter((c) => c.kind === "text")).toHaveLength(1); // the item only
        }
    });

    it("a checkbox renders unchecked as an outline and checked as an accent box with a tick", () => {
        const spec = getElement("bullets")!;
        const state = (checked: boolean): RenderCommand[] =>
            runLayout(
                spec.layout(
                    {
                        marker: "checkbox",
                        children: [
                            { type: "text", data: { text: "Task", style: "body", checked } },
                        ],
                    },
                    layoutCtx(400),
                ),
                400,
                300,
            ).commands;
        const off = state(false);
        const box = off.find((c) => c.kind === "rect" && c.fill?.border)!;
        expect(box.kind === "rect" && box.fill?.color).toBeUndefined();
        expect(off.some((c) => c.kind === "surface")).toBe(false);
        const on = state(true);
        const filled = on.find((c) => c.kind === "rect" && c.fill?.color === tokens.accent)!;
        expect(filled).toBeTruthy();
        expect(on.some((c) => c.kind === "surface")).toBe(true); // the tick glyph
    });

    it("composed checkboxes carry an affordance region addressed at the child", () => {
        const section = sectionOf(
            inst("bullets", {
                marker: "checkbox",
                children: [
                    { type: "text", data: { text: "One", style: "body" } },
                    { type: "text", data: { text: "Two", style: "body", checked: true } },
                ],
            }),
        );
        const node = composeSection(section, layoutCtx(800));
        const { regions } = runLayout(node, 800, 600);
        const hits = regions.filter((r) => r.id.startsWith("hit:checkbox:"));
        expect(hits.map((r) => r.id)).toEqual(["hit:checkbox:s1:0", "hit:checkbox:s1:1"]);
    });
});
