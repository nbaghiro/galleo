import { describe, it, expect } from "vitest";
import type { TemplateRef, TurnEvent } from "@model/ai";
import { findTemplatesTool } from "../library";
import { makeContext } from "../registry";
import { TEMPLATES } from "../../../templates";

// findTemplatesTool is PURE — it filters the static TEMPLATES list and returns compact refs. No DB, no model
// call, zero mocks. (The workspace-backed find-artifacts / read-artifact tools are the DB seam — not tested.)

async function find(query?: string): Promise<TemplateRef[]> {
    const gen = findTemplatesTool.run({ query }, makeContext({ image: {} }));
    let step: IteratorResult<TurnEvent, TemplateRef[]> = await gen.next();
    while (!step.done) step = await gen.next();
    return step.value;
}

describe("findTemplatesTool", () => {
    it("no query → returns every template as a { id, name, category } ref", async () => {
        const out = await find(undefined);
        expect(out).toHaveLength(TEMPLATES.length);
        expect(out).toEqual(
            TEMPLATES.map((t) => ({ id: t.id, name: t.name, category: t.category })),
        );
    });

    it("blank/whitespace query behaves like no query (returns all)", async () => {
        expect(await find("   ")).toHaveLength(TEMPLATES.length);
    });

    it("matches on name/category (case-insensitive)", async () => {
        const lower = await find("pitch");
        const upper = await find("PITCH");
        expect(lower.length).toBe(upper.length);
        expect(lower.length).toBeGreaterThan(0);
        expect(lower.some((t) => t.id === "startup-pitch")).toBe(true);
        // every match really contains the query somewhere in its source template
        for (const ref of lower) {
            const src = TEMPLATES.find((t) => t.id === ref.id)!;
            const hay = `${src.name} ${src.category} ${src.description}`.toLowerCase();
            expect(hay).toContain("pitch");
        }
    });

    it("matches on the description alone (a word absent from name + category)", async () => {
        // "skills" appears only in the Resume template's description.
        const out = await find("skills");
        expect(out.map((t) => t.id)).toEqual(["resume"]);
    });

    it("returns an empty list when nothing matches", async () => {
        expect(await find("zzz-nonexistent-topic")).toEqual([]);
    });
});
