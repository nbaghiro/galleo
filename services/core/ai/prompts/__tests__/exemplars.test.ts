import { describe, it, expect } from "vitest";
import type { Surface } from "@model/ai";
import type { ElementInstance, Section } from "@model/artifact";
import { sectionExemplars, siteExemplar } from "@services/core/ai/prompts/exemplars";

const surfaces: Surface[] = ["deck", "doc", "web"];

// each stringified section is its own line (JSON.stringify emits no newlines)
function jsonLines(out: string): string[] {
    return out.split("\n").filter((l) => l.startsWith('{"id":'));
}

const ALLOWED = new Set(["type", "data", "layout"]);
function assertCleanTree(el: Record<string, unknown>): void {
    for (const k of Object.keys(el)) expect(ALLOWED.has(k)).toBe(true);
    const kids = (el.data as { children?: unknown } | undefined)?.children;
    if (Array.isArray(kids)) kids.forEach((k) => assertCleanTree(k as Record<string, unknown>));
}

describe("sectionExemplars", () => {
    it("returns a non-empty gold block for every surface", () => {
        for (const s of surfaces) {
            const out = sectionExemplars(s);
            expect(out).toContain(`Gold-standard ${s} sections`);
            expect(out).toContain("Example 1 · layout");
        }
    });

    it("emits two structurally-labelled examples for a rich gold artifact", () => {
        const out = sectionExemplars("deck");
        expect(out).toContain("Example 1 · layout");
        expect(out).toContain("Example 2 · layout");
    });

    it("serializes each pick as a clean { id, root } section", () => {
        const lines = jsonLines(sectionExemplars("deck"));
        expect(lines.length).toBeGreaterThanOrEqual(1);
        const parsed = JSON.parse(lines[0]!) as { id: string; root: Record<string, unknown> };
        expect(typeof parsed.id).toBe("string");
        expect(typeof parsed.root.type).toBe("string");
    });

    it("strips every element node to only type/data/layout keys", () => {
        for (const s of surfaces) {
            for (const line of jsonLines(sectionExemplars(s))) {
                const parsed = JSON.parse(line) as { root: Record<string, unknown> };
                assertCleanTree(parsed.root);
            }
        }
    });

    it("keeps a child's load-bearing layout width in the exemplar JSON", () => {
        // split columns carry load-bearing layout.width — cleanElement must keep it
        expect(sectionExemplars("deck")).toContain('"layout":');
    });
});

describe("siteExemplar", () => {
    const out = siteExemplar();
    const sections = jsonLines(out).map((l) => JSON.parse(l) as Section);
    const kids = (el: ElementInstance): ElementInstance[] =>
        ((el.data as { children?: ElementInstance[] }).children ?? []).slice();
    const byId = (id: string): Section => {
        const s = sections.find((x) => x.id === id);
        if (!s) throw new Error(`no exemplar section "${id}"`);
        return s;
    };

    it("shows a whole page, with ids a nav link can name", () => {
        expect(sections.length).toBeGreaterThanOrEqual(5);
        expect(sections.every((s) => /^[a-z][a-z0-9-]*$/.test(s.id))).toBe(true);
    });

    it("docks the topbar as the first child of the first section's root", () => {
        const nav = kids(byId("hero").root)[0]!;
        expect(nav.layout?.dock).toBe("top");
        expect(kids(nav)[0]!.layout?.width).toBe("fill");
        expect(kids(nav).some((k) => k.type === "popup")).toBe(true);
    });

    it("bands the hero and the interlude with real decimal aspects", () => {
        expect(byId("hero").frame?.aspect).toBeCloseTo(2.29, 2);
        expect(byId("interlude").frame?.aspect).toBeCloseTo(3.2, 2);
    });

    // an href pointing at an id this page does not have would teach a broken link
    it("points every internal href at a section that exists", () => {
        const ids = new Set(sections.map((s) => s.id));
        const hrefs: string[] = [];
        const walk = (el: ElementInstance): void => {
            const d = el.data as { href?: string; children?: ElementInstance[] };
            if (typeof d.href === "string") hrefs.push(d.href);
            d.children?.forEach(walk);
        };
        sections.forEach((s) => walk(s.root));
        const internal = hrefs.filter((h) => h.startsWith("#"));
        expect(internal.length).toBeGreaterThan(2);
        for (const h of internal) expect(ids.has(h.slice(1))).toBe(true);
    });

    it("keeps the band rhythm: a tinted band, an image band, and a plain one", () => {
        const kinds = sections.map((s) => s.background?.kind ?? "none");
        expect(kinds).toContain("color");
        expect(kinds).toContain("image");
        expect(kinds).toContain("none");
    });

    it("writes image srcs as phrases, never as urls the writer cannot invent", () => {
        for (const s of sections)
            if (s.background?.kind === "image")
                expect(s.background.image?.startsWith("http")).toBe(false);
    });

    it("closes on a justified footer and demonstrates a collapsible faq", () => {
        expect(out).toContain('"justify":"between"');
        expect(out).toContain('"collapse":"collapsible"');
    });
});
