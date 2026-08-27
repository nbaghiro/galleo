import { describe, it, expect } from "vitest";
import type { ElementInstance, Section } from "@model/artifact";
import { checkSection, renderIssues, structureIssues } from "@services/core/ai/quality";

const text = (t: string, style?: string): ElementInstance => ({
    type: "text",
    data: style ? { text: t, style } : { text: t },
});
const group = (children: ElementInstance[]): ElementInstance => ({
    type: "container",
    data: { children },
});
const focal = (type: string): ElementInstance => ({ type, data: {} });
const section = (root: ElementInstance): Section => ({ id: "s1", root });

// exact issue strings — must match services/ai/quality.ts
const EMPTY = (n: number): string =>
    n === 1
        ? "a container with no children, which renders as an empty box: fill it or drop it"
        : `${n} containers with no children, which renders as an empty box: fill it or drop it`;
const NO_HEADLINE = "no headline — lead with one text element styled h1 or h2";
const PLACEHOLDER = "contains placeholder or lorem text — write real, specific copy";
const TOO_SPARSE = "too sparse for a slide — add supporting elements so it fills the frame";
const NO_CONTENT = "almost no content — write real, finished copy";

describe("rule 1 — empty containers", () => {
    it("flags an empty container/column anywhere in the tree, counting each one", () => {
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

    it("a leaf (non-container) root has no empty container", () => {
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
        // heading so only the placeholder rule fires on the copy
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
        // single heading isolates 'too sparse' (avoids no-headline / no-content)
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

// the structural rules, held against the catalog the model is handed

const one = (issues: string[], re: RegExp): string => {
    const hit = issues.filter((i) => re.test(i));
    expect(hit).toHaveLength(1);
    return hit[0]!;
};

describe("elements outside the catalog", () => {
    it("names every invented type once, since an unknown one paints an error box", () => {
        const s = section(group([{ type: "hero-banner", data: { title: "Big" } }]));
        expect(one(structureIssues(s), /outside the catalog/)).toContain("hero-banner");
    });

    it("accepts group and card, which the registry still resolves onto container", () => {
        const s = section({ type: "group", data: { children: [text("Real copy here", "h2")] } });
        expect(structureIssues(s)).toEqual([]);
    });
});

describe("what hand-built work is held to, versus a model reply", () => {
    it("renderIssues sees the empty container", () => {
        const s = section(group([text("A headline", "h2"), group([])]));
        expect(renderIssues(s)).toHaveLength(1);
    });

    it("renderIssues ignores an invented type, which only a model reply answers for", () => {
        const s = section(group([{ type: "hero-banner", data: { title: "Big" } }]));
        expect(renderIssues(s)).toEqual([]);
        expect(structureIssues(s).some((i) => /outside the catalog/.test(i))).toBe(true);
    });

    it("takes `avatar` as vocabulary, which is what profile and testimonial are told to write", () => {
        // it has no entry of its own so that it is never reached for standalone, but a reply that
        // followed `profile` to the letter must not read as an invented type
        const s = section({
            type: "profile",
            data: {
                children: [
                    { type: "avatar", data: { size: 88, src: "a smiling founder" } },
                    text("Dana Ruiz", "h3"),
                ],
            },
        });
        expect(structureIssues(s)).toEqual([]);
    });

    it("renderIssues ignores a second h1, which is a rule about writing rather than rendering", () => {
        const s = section(group([text("First", "h1"), text("Second", "h1")]));
        expect(renderIssues(s)).toEqual([]);
        expect(structureIssues(s).some((i) => /h1 headlines/.test(i))).toBe(true);
    });
});

describe("elements with nothing in them", () => {
    it("flags a carrier that arrived without the field it exists to show", () => {
        const s = section(group([text("A headline", "h2"), { type: "image", data: {} }]));
        expect(one(structureIssues(s), /`image`/)).toContain("no `src`");
    });

    it("counts repeats of the same fault rather than listing each one", () => {
        const s = section(
            group([
                { type: "chart", data: { type: "bar" } },
                { type: "chart", data: { type: "line" } },
            ]),
        );
        expect(one(structureIssues(s), /`chart`/)).toContain("2 `chart` elements");
    });

    it("flags a text element with no text when the model placed it itself", () => {
        const s = section(group([text("A headline", "h2"), text("")]));
        expect(structureIssues(s).some((i) => /`text`/.test(i))).toBe(true);
    });

    it("leaves a blank slot inside a composite alone, which is how a quote with no attribution is written", () => {
        // slowweb's pull quotes do exactly this: an empty caption rather than an invented byline
        const s = section({
            type: "quote",
            data: { children: [text("The opposite of fast was never slow.", "h3"), text("")] },
        });
        expect(structureIssues(s)).toEqual([]);
    });

    it("still flags a carrier inside a composite, which renders as an empty box wherever it sits", () => {
        const s = section({
            type: "profile",
            data: { children: [{ type: "image", data: {} }, text("Dana", "h3")] },
        });
        expect(one(structureIssues(s), /`image`/)).toContain("no `src`");
    });
});

describe("one headline per section", () => {
    it("flags two h1s the model placed in the flow", () => {
        const s = section(group([text("First headline", "h1"), text("Second headline", "h1")]));
        expect(structureIssues(s).some((i) => /h1 headlines/.test(i))).toBe(true);
    });

    it("does not count the h1 a stat uses for its value, which the catalog asks for", () => {
        // three stats in a row is the corpus's most common shape, and every value is an h1
        const stat = (v: string): ElementInstance => ({
            type: "stat",
            data: { children: [text(v, "h1"), text("of kitchens", "caption")] },
        });
        const s = section({
            type: "container",
            data: { direction: "row", children: [stat("78%"), stat("1 in 6"), stat("9 hrs")] },
        });
        expect(structureIssues(s)).toEqual([]);
    });
});

describe("rows the engine cannot lay out as written", () => {
    const col = (pct?: number, fill?: boolean): ElementInstance => ({
        ...group([text("Some real column copy", "body")]),
        layout: {
            ...(pct ? { width: { pct } } : {}),
            ...(fill ? { height: "fill" as const } : {}),
        },
    });
    const row = (...kids: ElementInstance[]): Section =>
        section({ type: "container", data: { direction: "row", children: kids } });

    it("flags a half-annotated row, which silently falls back to equal columns", () => {
        expect(one(structureIssues(row(col(60), col())), /width\.pct/)).toContain("only 1 of 2");
    });

    it("flags shares that do not add up", () => {
        expect(one(structureIssues(row(col(60), col(60))), /add up/)).toContain("120");
    });

    it("accepts a row with no shares at all, which splits evenly", () => {
        expect(structureIssues(row(col(), col()))).toEqual([]);
    });

    it("flags a row where every column fills, which measures zero height", () => {
        // verified against the engine: two filling columns paint nothing at all
        expect(structureIssues(row(col(50, true), col(50, true)))).toHaveLength(1);
    });

    it("accepts a fill on every column but the one the row takes its height from", () => {
        expect(structureIssues(row(col(50, true), col(50)))).toEqual([]);
    });
});
