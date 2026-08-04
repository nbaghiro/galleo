import { describe, expect, it } from "vitest";
import type { ElementInstance, Section } from "@model/artifact";
import {
    elementTypes,
    findElement,
    findPassage,
    replaceElement,
    replacePassage,
    setImageSrc,
    textNodes,
} from "../locate";

const text = (t: string): ElementInstance => ({ type: "text", data: { text: t } });
const group = (...kids: ElementInstance[]): ElementInstance => ({
    type: "group",
    data: { children: kids },
});

const section: Section = {
    id: "s2",
    root: group(
        text("The Trust Gap"),
        group(
            text("AI is scaling faster than human trust."),
            text("Black-box interfaces leave users second-guessing every output."),
        ),
        { type: "image", data: { src: "x.png" } },
    ),
};

describe("textNodes", () => {
    it("walks the tree in document order and records each path", () => {
        expect(textNodes(section.root)).toEqual([
            { path: [0], text: "The Trust Gap" },
            { path: [1, 0], text: "AI is scaling faster than human trust." },
            {
                path: [1, 1],
                text: "Black-box interfaces leave users second-guessing every output.",
            },
        ]);
    });
    it("skips nodes with no text of their own", () => {
        expect(textNodes(group({ type: "image", data: { src: "x" } }))).toEqual([]);
        expect(textNodes(text("   "))).toEqual([]);
    });
});

describe("findPassage", () => {
    it("matches verbatim", () => {
        expect(findPassage(section.root, "The Trust Gap")?.path).toEqual([0]);
    });
    it("ignores case and whitespace differences, since the model retypes the quote", () => {
        expect(findPassage(section.root, "  the   TRUST gap ")?.path).toEqual([0]);
    });
    it("takes the shortest containing node, so a common word lands on the right one", () => {
        // "trust" appears in the heading and in the body; the heading is the more specific target
        expect(findPassage(section.root, "trust")?.path).toEqual([0]);
    });
    it("finds a phrase inside a longer paragraph", () => {
        expect(findPassage(section.root, "second-guessing")?.path).toEqual([1, 1]);
    });
    it("returns null rather than guessing when nothing matches", () => {
        expect(findPassage(section.root, "pricing tiers")).toBeNull();
        expect(findPassage(section.root, "   ")).toBeNull();
    });
});

describe("replacePassage", () => {
    it("swaps only the targeted node and leaves the rest identical", () => {
        const next = replacePassage(section, [1, 0], "AI outpaces trust.");
        expect(textNodes(next.root).map((n) => n.text)).toEqual([
            "The Trust Gap",
            "AI outpaces trust.",
            "Black-box interfaces leave users second-guessing every output.",
        ]);
    });
    it("keeps the node's other data and the section's own fields", () => {
        const withFrame: Section = { ...section, bleed: true };
        const next = replacePassage(withFrame, [0], "Trust");
        expect(next.bleed).toBe(true);
        expect(next.id).toBe("s2");
        // the image sibling survives untouched
        expect((next.root as ElementInstance).type).toBe("group");
    });
    it("does not mutate the original", () => {
        replacePassage(section, [0], "Changed");
        expect(textNodes(section.root)[0]!.text).toBe("The Trust Gap");
    });
});

describe("findElement", () => {
    it("finds by type, in document order", () => {
        expect(findElement(section.root, "image")?.path).toEqual([2]);
        expect(findElement(section.root, "text")?.path).toEqual([0]);
    });
    it("nth picks between several of the same type", () => {
        expect(findElement(section.root, "text", 1)?.path).toEqual([1, 0]);
        expect(findElement(section.root, "text", 2)?.path).toEqual([1, 1]);
    });
    it("returns null past the end, and for a type that isn't there", () => {
        expect(findElement(section.root, "text", 9)).toBeNull();
        expect(findElement(section.root, "chart")).toBeNull();
    });
});

describe("elementTypes", () => {
    it("lists each type once, so a miss can say what IS there", () => {
        expect(elementTypes(section.root)).toEqual(["group", "text", "image"]);
    });
});

describe("replaceElement", () => {
    it("swaps the whole node at the path", () => {
        const next = replaceElement(section, [2], { type: "chart", data: { values: "1,2" } });
        expect(findElement(next.root, "image")).toBeNull();
        expect(findElement(next.root, "chart")?.path).toEqual([2]);
        // siblings survive
        expect(textNodes(next.root).length).toBe(3);
    });
});

describe("setImageSrc", () => {
    it("swaps only src and keeps the element's other data", () => {
        const withAspect: Section = {
            id: "s2",
            root: { type: "image", data: { src: "old.png", aspect: 1.5 } },
        };
        const next = setImageSrc(withAspect, [], "new.png");
        expect(next.root.data).toEqual({ src: "new.png", aspect: 1.5 });
    });
});
