import { describe, it, expect } from "vitest";
import type { ElementInstance, Section } from "@model/artifact";
import { checkSection } from "../quality";

// Pure, deterministic quality heuristics — build small Section trees, assert the exact issue each rule adds.
// No DB, no engine (services may not import canvas), no mocks.

const text = (t: string, style?: string): ElementInstance => ({
    type: "text",
    data: style ? { text: t, style } : { text: t },
});
const group = (children: ElementInstance[]): ElementInstance => ({
    type: "group",
    data: { children },
});
const focal = (type: string): ElementInstance => ({ type, data: {} });
const section = (root: ElementInstance): Section => ({ id: "s1", root });

// The exact issue strings, read from services/ai/quality.ts.
const EMPTY = (n: number): string => `${n} empty region(s) — fill every column with a real element`;
const NO_HEADLINE = "no headline — lead with one text element styled h1 or h2";
const PLACEHOLDER = "contains placeholder or lorem text — write real, specific copy";
const TOO_SPARSE = "too sparse for a slide — add supporting elements so it fills the frame";
const NO_CONTENT = "almost no content — write real, finished copy";

describe("rule 1 — empty regions", () => {
    it("flags an empty container/column anywhere in the tree, counting each one", () => {
        // A healthy heading column beside one empty group column → exactly one empty region.
        const s = section(
            group([text("A real, substantial headline for the section", "h1"), group([])]),
        );
        const r = checkSection(s, "doc");
        expect(r.issues).toContain(EMPTY(1));
    });

    it("counts multiple empty regions", () => {
        const s = section(
            group([text("A real, substantial headline here", "h1"), group([]), group([])]),
        );
        expect(checkSection(s, "doc").issues).toContain(EMPTY(2));
    });

    it("a leaf (non-container) root has zero empty regions", () => {
        const s = section(text("A real, substantial headline for the section", "h1"));
        expect(checkSection(s, "doc").issues).not.toContain(EMPTY(1));
    });
});

describe("rule 2 — missing headline", () => {
    it("text with no heading style and no focal element trips 'no headline'", () => {
        const s = section(group([text("some body copy without any heading role at all")]));
        expect(checkSection(s, "doc").issues).toContain(NO_HEADLINE);
    });

    it("a heading style exempts the section", () => {
        const s = section(
            group([text("A proper section headline", "h2"), text("supporting body copy here")]),
        );
        expect(checkSection(s, "doc").issues).not.toContain(NO_HEADLINE);
    });

    it("a focal element (image/stat/chart/diagram/table) exempts a text-led section", () => {
        const s = section(
            group([text("a caption with no heading style whatsoever"), focal("image")]),
        );
        expect(checkSection(s, "doc").issues).not.toContain(NO_HEADLINE);
    });
});

describe("rule 3 — placeholder copy", () => {
    it.each([
        "lorem ipsum dolor sit amet",
        "This is placeholder text here",
        "tbd for now",
        "your text here please",
        "value is xxx",
    ])("flags placeholder-ish copy: %s", (bad) => {
        // Give it a heading so only the placeholder rule can fire on the copy itself.
        const s = section(group([text("A proper real headline for this", "h1"), text(bad)]));
        expect(checkSection(s, "doc").issues).toContain(PLACEHOLDER);
    });

    it("real, specific copy is not flagged", () => {
        const s = section(
            group([
                text("Quarterly revenue grew 42%", "h1"),
                text("driven by enterprise renewals"),
            ]),
        );
        expect(checkSection(s, "doc").issues).not.toContain(PLACEHOLDER);
    });
});

describe("rule 4 — too sparse for a deck slide", () => {
    it("deck + <=1 element + <120 chars + no focal trips 'too sparse'", () => {
        // Single heading element: avoids the no-headline + no-content rules so 'too sparse' is isolated.
        const s = section(text("A short but real headline here", "h1"));
        expect(checkSection(s, "deck").issues).toContain(TOO_SPARSE);
    });

    it("the same sparse slide is fine on a doc surface (rule is deck-only)", () => {
        const s = section(text("A short but real headline here", "h1"));
        expect(checkSection(s, "doc").issues).not.toContain(TOO_SPARSE);
    });

    it("a focal element saves a sparse slide", () => {
        const s = section(focal("image"));
        expect(checkSection(s, "deck").issues).not.toContain(TOO_SPARSE);
    });
});

describe("rule 5 — almost no content", () => {
    it("under 12 chars of text with no focal trips 'almost no content'", () => {
        const s = section(text("hi", "h1"));
        expect(checkSection(s, "doc").issues).toContain(NO_CONTENT);
    });

    it("a focal element exempts a near-empty section", () => {
        const s = section(focal("chart"));
        expect(checkSection(s, "doc").issues).not.toContain(NO_CONTENT);
    });
});

describe("ok flag", () => {
    it("a healthy section reports ok === true with no issues", () => {
        const s = section(
            group([
                text("Revenue grew 42% year over year", "h1"),
                text(
                    "Enterprise renewals and a stronger pipeline drove the quarter's outperformance.",
                ),
            ]),
        );
        const r = checkSection(s, "doc");
        expect(r.issues).toEqual([]);
        expect(r.ok).toBe(true);
    });

    it("ok === (issues.length === 0) — a broken section is not ok", () => {
        const r = checkSection(section(group([])), "deck");
        expect(r.issues.length).toBeGreaterThan(0);
        expect(r.ok).toBe(false);
        expect(r.ok).toBe(r.issues.length === 0);
    });
});
