import { describe, expect, it } from "vitest";
import {
    artifactCover,
    artifactSearchText,
    artifactSections,
    SEARCH_TEXT_LIMIT,
} from "@model/digest";

const el = (type: string, data: Record<string, unknown>): Record<string, unknown> => ({
    type,
    data,
});
const text = (style: string, t: string): Record<string, unknown> => el("text", { style, text: t });
const group = (...children: Record<string, unknown>[]): Record<string, unknown> =>
    el("group", { children });

const draft = {
    format: "deck",
    theme: "studio",
    sections: [
        {
            id: "s1",
            root: group(
                text("label", "QUARTERLY"),
                text("h1", "Growth Playbook"),
                text("body", "How to monetize a freemium business"),
                el("image", { src: "https://cdn.example.com/hero.jpg", alt: "city skyline" }),
            ),
        },
        {
            id: "s2",
            root: group(
                text("h2", "Pricing ladder"),
                el("chart", {
                    type: "bar",
                    values: "10,20,30",
                    categories: "Free,Pro,Premium",
                    palette: "multi",
                }),
            ),
        },
    ],
};

describe("artifactCover", () => {
    it("reads eyebrow / title / sub by text style and the first image", () => {
        expect(artifactCover(draft)).toEqual({
            eyebrow: "QUARTERLY",
            title: "Growth Playbook",
            sub: "How to monetize a freemium business",
            image: "https://cdn.example.com/hero.jpg",
        });
    });

    it("prefers a document or section background over an inline image", () => {
        const bg = { ...draft, background: { image: "bg.png" } };
        expect(artifactCover(bg).image).toBe("bg.png");
    });

    it("is empty for a contentless draft", () => {
        expect(artifactCover({})).toEqual({});
        expect(artifactCover(null)).toEqual({});
        expect(artifactCover("nonsense")).toEqual({});
    });
});

describe("artifactSections", () => {
    it("labels the first section cover and classifies the rest by element kind", () => {
        expect(artifactSections(draft).map(({ title, kind }) => ({ title, kind }))).toEqual([
            { title: "Growth Playbook", kind: "cover" },
            { title: "Pricing ladder", kind: "chart" },
        ]);
    });

    it("carries the section id and serialized size, for windowed loads", () => {
        const [first, second] = artifactSections(draft);
        expect(first!.id).toBe("s1");
        expect(second!.id).toBe("s2");
        expect(first!.size).toBeGreaterThan(100);
        expect(first!.size).toBe(JSON.stringify(draft.sections[0]).length);
    });

    it("skips label/caption styles when picking a section title", () => {
        const d = {
            sections: [
                { id: "a" },
                { id: "b", root: group(text("label", "SKIP"), text("h3", "Real")) },
            ],
        };
        expect(artifactSections(d)[1]).toMatchObject({ title: "Real", kind: "content" });
    });

    it("clips long titles to 64 characters", () => {
        const long = "x".repeat(100);
        const d = { sections: [{ id: "a", root: text("h1", long) }] };
        expect(artifactSections(d)[0]!.title).toHaveLength(64);
    });
});

describe("artifactSearchText", () => {
    it("collects prose from every nesting level, one block per section", () => {
        const out = artifactSearchText(draft);
        const [first, second] = out.split("\n\n");
        expect(first).toContain("Growth Playbook");
        expect(first).toContain("How to monetize a freemium business");
        expect(second).toContain("Pricing ladder");
        expect(second).toContain("Free,Pro,Premium");
    });

    it("keeps alt text but drops urls, colors, and enum keys", () => {
        const out = artifactSearchText(draft);
        expect(out).toContain("city skyline");
        expect(out).not.toContain("cdn.example.com");
        expect(out).not.toContain("multi"); // palette enum
        expect(out).not.toContain("studio"); // theme id lives outside sections anyway
        expect(artifactSearchText({ sections: [{ root: el("text", { color: "#ff0044" }) }] })).toBe(
            "",
        );
    });

    it("reaches text nested in table cells and diagram item strings", () => {
        const d = {
            sections: [
                {
                    root: group(
                        el("table", { cells: [text("caption", "Region"), text("caption", "ARR")] }),
                        el("diagram", { type: "flow", items: "Draft | first pass", links: "A->B" }),
                    ),
                },
            ],
        };
        const out = artifactSearchText(d);
        expect(out).toContain("Region");
        expect(out).toContain("ARR");
        expect(out).toContain("Draft | first pass");
    });

    it("drops base64-ish blobs and dedupes repeats inside a section", () => {
        const blob = "A".repeat(400);
        const d = {
            sections: [
                {
                    root: group(
                        text("body", "Repeat"),
                        text("body", "Repeat"),
                        el("image", { alt: blob }),
                    ),
                },
            ],
        };
        const out = artifactSearchText(d);
        expect(out).toBe("Repeat");
    });

    it("stops at the index cap", () => {
        const filler = "lorem ipsum ".repeat(2000); // ~24k chars per section
        const d = {
            sections: Array.from({ length: 20 }, (_, i) => ({
                root: text("body", `${i} ${filler}`),
            })),
        };
        expect(artifactSearchText(d).length).toBeLessThanOrEqual(SEARCH_TEXT_LIMIT);
    });

    it("is empty for a contentless draft", () => {
        expect(artifactSearchText({})).toBe("");
        expect(artifactSearchText(undefined)).toBe("");
    });
});
