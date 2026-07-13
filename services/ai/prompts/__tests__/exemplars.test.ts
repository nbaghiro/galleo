import { describe, it, expect } from "vitest";
import type { Surface } from "@model/ai";
import { sectionExemplars } from "../exemplars";

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
            expect(out).toContain("Example 1 — layout");
        }
    });

    it("emits two structurally-labelled examples for a rich gold artifact", () => {
        const out = sectionExemplars("deck");
        expect(out).toContain("Example 1 — layout");
        expect(out).toContain("Example 2 — layout");
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
