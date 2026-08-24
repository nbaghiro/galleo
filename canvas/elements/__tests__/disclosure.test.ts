import "@elements/register";
import { describe, expect, it } from "vitest";
import type { ElementInstance } from "@model/artifact";
import type { Region } from "@engine/node";
import { parseHitRegion } from "@model/artifact";
import { composeSection } from "@elements/compose";
import { getElement } from "@elements/spec";
import { panelNode, popupData } from "@elements/composite/popup";
import { inst, layoutCtx, runLayout, sectionOf, tokens } from "@canvas/testkit";

const question = (n: number): ElementInstance =>
    inst("text", { text: `Question ${n}`, style: "h3" });
const answer = (n: number, open?: boolean): ElementInstance =>
    inst("text", open === undefined ? { text: `Answer ${n}` } : { text: `Answer ${n}`, open });

const paint = (root: ElementInstance): { texts: string[]; regions: Region[] } => {
    const node = composeSection(sectionOf(root), layoutCtx(800));
    const { commands, regions } = runLayout(node, 800, 600);
    return {
        texts: commands.flatMap((c) => (c.kind === "text" ? [c.text.text] : [])),
        regions,
    };
};

const hits = (regions: Region[]): { action: string; path: number[] }[] =>
    regions.flatMap((r) => {
        const h = parseHitRegion(r.id);
        return h ? [{ action: h.action, path: h.address.path }] : [];
    });

describe("faq collapse", () => {
    const faq = (collapse?: string, openIndex?: number): ElementInstance =>
        inst("faq", {
            collapse,
            children: [
                question(1),
                answer(1, openIndex === 1 ? true : undefined),
                question(2),
                answer(2, openIndex === 3 ? true : undefined),
            ],
        });

    it("expanded is the default and paints every answer, minting no affordance", () => {
        const plain = paint(faq());
        expect(plain.texts).toContain("Answer 1");
        expect(plain.texts).toContain("Answer 2");
        expect(hits(plain.regions)).toEqual([]);
        // an explicit "expanded" is byte-identical to the absent default
        expect(paint(faq("expanded")).texts).toEqual(plain.texts);
    });

    it("collapsible hides the answers and mints a disclose region addressed at each one", () => {
        const { texts, regions } = paint(faq("collapsible"));
        expect(texts).toContain("Question 1");
        expect(texts).not.toContain("Answer 1");
        expect(hits(regions)).toEqual([
            { action: "disclose", path: [1] },
            { action: "disclose", path: [3] },
        ]);
    });

    it("an answer whose own data says open paints, and its neighbours stay shut", () => {
        const { texts } = paint(faq("collapsible", 1));
        expect(texts).toContain("Answer 1");
        expect(texts).not.toContain("Answer 2");
    });

    it("the question row is the affordance, and the question itself stays selectable inside it", () => {
        const { regions } = paint(faq("collapsible"));
        const row = regions.find((r) => parseHitRegion(r.id)?.address.path[0] === 1)!;
        const q = regions.find((r) => r.id === "el:s1:0")!;
        expect(q.box.x).toBeGreaterThanOrEqual(row.box.x);
        expect(q.box.w).toBeLessThan(row.box.w);
    });
});

describe("tabs", () => {
    const tabs = (data: Record<string, unknown> = {}): ElementInstance =>
        inst("tabs", {
            labels: "First, Second",
            children: [inst("text", { text: "Panel one" }), inst("text", { text: "Panel two" })],
            ...data,
        });

    it("paints the strip plus only the active panel", () => {
        const first = paint(tabs());
        expect(first.texts).toEqual(["First", "Second", "Panel one"]);
        expect(paint(tabs({ active: 1 })).texts).toEqual(["First", "Second", "Panel two"]);
    });

    it("mints a tab affordance per panel, addressed at that panel", () => {
        expect(hits(paint(tabs()).regions)).toEqual([
            { action: "tab", path: [0] },
            { action: "tab", path: [1] },
        ]);
    });

    it("falls back to a numbered label and clamps an out-of-range active index", () => {
        expect(paint(tabs({ labels: "First" })).texts).toContain("Tab 2");
        expect(paint(tabs({ active: 9 })).texts).toContain("Panel two");
        expect(paint(tabs({ active: -3 })).texts).toContain("Panel one");
    });

    it("keeps every panel in the tree, so a hidden one is one click from being edited", () => {
        const { regions } = paint(tabs());
        // el:s1:1 is the second panel: absent from the paint, still an addressable child
        expect((tabs().data as { children: ElementInstance[] }).children).toHaveLength(2);
        expect(regions.some((r) => r.id === "el:s1:1")).toBe(false);
    });
});

describe("popup", () => {
    const popup = (data: Record<string, unknown> = {}): ElementInstance =>
        inst("popup", {
            label: "Details",
            children: [inst("text", { text: "Behind the trigger" })],
            ...data,
        });

    it("paints the trigger alone when shut, and the panel below it when the author left it open", () => {
        const shut = paint(popup());
        expect(shut.texts).toEqual(["Details"]);
        expect(paint(popup({ open: true })).texts).toEqual(["Details", "Behind the trigger"]);
    });

    it("mints a disclose region on the trigger, addressed at the popup itself", () => {
        expect(hits(paint(popup()).regions)).toEqual([{ action: "disclose", path: [] }]);
        // nested: the address is still the popup's own, not its child's
        const nested = paint(inst("container", { children: [popup()] }));
        expect(hits(nested.regions)).toEqual([{ action: "disclose", path: [0] }]);
    });

    it("falls back to a label when none is authored", () => {
        expect(paint(popup({ label: "  " })).texts).toEqual(["Details"]);
    });

    it("panelNode composes the children on their own, with no region ids to address", () => {
        const node = panelNode(
            popupData({ children: [inst("text", { text: "Behind the trigger" })] }),
            layoutCtx(320),
        );
        const { commands, regions } = runLayout(node, 320, 600);
        expect(commands.flatMap((c) => (c.kind === "text" ? [c.text.text] : []))).toEqual([
            "Behind the trigger",
        ]);
        expect(regions).toEqual([]);
        expect(node.fill?.color).toBe(tokens.surface); // the panel carries its own surface
    });

    it("gives the menu variant a tighter panel than the prose one", () => {
        const of = (variant: string): number => {
            const node = panelNode(popupData({ variant, children: [] }), layoutCtx(320));
            return node.padding?.top ?? 0;
        };
        expect(of("menu")).toBeLessThan(of("panel"));
    });
});

describe("the newly registered specs", () => {
    it("lay out from their own create() defaults", () => {
        for (const type of ["faq", "tabs", "popup"]) {
            const spec = getElement(type)!;
            const node = composeSection(sectionOf(inst(type, spec.create())), layoutCtx(800));
            expect(runLayout(node, 800, 600).commands.length, type).toBeGreaterThan(0);
        }
    });
});
