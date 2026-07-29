import "@elements/register";
import { describe, expect, it } from "vitest";
import type { ElementInstance } from "@model/artifact";
import type { Target } from "@model/target";
import { rowGroup } from "@model/section";
import { columnFractions, getElementAt } from "@elements/ops";
import { artifactOf, inst, sectionOf } from "@canvas/testkit";
import { clipboardEl, copyToClipboard, hasClipboard, pasteElement } from "../clipboard";

const textOf = (el: ElementInstance | undefined): string | undefined =>
    (el?.data as { text?: string })?.text;

const rootTarget = (section: string): Target => ({
    kind: "element",
    address: { section, path: [] },
});

const twoKidArtifact = () =>
    artifactOf([
        sectionOf({
            type: "group",
            data: {
                direction: "col",
                children: [inst("text", { text: "A" }), inst("text", { text: "B" })],
            },
        }),
    ]);

const fracSum = (fr: number[]): number => fr.reduce((a, b) => a + b, 0);

describe("clipboard store", () => {
    it("deep-clones on copy and reports presence", () => {
        const source = inst("text", { text: "A" });
        copyToClipboard(source);
        expect(hasClipboard()).toBe(true);
        expect(clipboardEl()).not.toBe(source);
        expect(textOf(clipboardEl() ?? undefined)).toBe("A");
    });
});

describe("pasteElement", () => {
    it("inserts as the next sibling after the selected element (vertical stack)", () => {
        const art = twoKidArtifact();
        const res = pasteElement(art, inst("text", { text: "PASTED" }), {
            kind: "element",
            address: { section: "s1", path: [0] },
        });
        expect(res).not.toBeNull();
        expect(res!.address).toEqual({ section: "s1", path: [1] });
        expect(textOf(getElementAt(res!.content, res!.address))).toBe("PASTED");
        expect(textOf(getElementAt(res!.content, { section: "s1", path: [2] }))).toBe("B");
    });

    it("routes through the layout engine: pasting a weighted column renormalizes the row to 100%", () => {
        // 60% | 40% split; a naive insert of the wide column would push the row to 160%. Placement must renormalize
        const art = artifactOf([
            sectionOf(
                rowGroup([inst("text", { text: "L" }), inst("text", { text: "R" })], [0.6, 0.4]),
            ),
        ]);
        const clip = getElementAt(art, { section: "s1", path: [0] })!;
        const res = pasteElement(art, clip, {
            kind: "element",
            address: { section: "s1", path: [0] },
        });
        expect(res).not.toBeNull();
        const fr = columnFractions(res!.content.sections[0]!);
        expect(fr).toHaveLength(3);
        expect(fracSum(fr)).toBeGreaterThan(0.98);
        expect(fracSum(fr)).toBeLessThan(1.02);
    });

    it("appends into the section root container when a section is the target", () => {
        const res = pasteElement(twoKidArtifact(), inst("text", { text: "END" }), {
            kind: "section",
            section: "s1",
        });
        expect(res!.address).toEqual({ section: "s1", path: [2] });
        expect(textOf(getElementAt(res!.content, res!.address))).toBe("END");
    });

    it("wraps a bare leaf root into a column when pasting onto it", () => {
        const art = artifactOf([sectionOf(inst("text", { text: "solo" }))]);
        const res = pasteElement(art, inst("text", { text: "x" }), rootTarget("s1"));
        expect(res).not.toBeNull();
        expect(getElementAt(res!.content, { section: "s1", path: [] })?.type).toBe("group");
        expect(textOf(getElementAt(res!.content, { section: "s1", path: [0] }))).toBe("solo");
        expect(textOf(getElementAt(res!.content, res!.address))).toBe("x");
    });
});
