import { describe, expect, it } from "vitest";
import { TEMPLATE_INDEX } from "@model/templates";
import { template, templateBody } from "@services/core/templates";

// The catalog is split in two: @model/templates carries the client-facing index (edge-safe, no
// bodies), and core/templates.ts holds the bodies and resolves an id to one. Nothing but this test
// holds the halves together, so an id added to one side without the other fails here, not at
// /templates. The file is coverage-excluded (5.7k lines of authored data), so this is its only guard.
describe("TEMPLATE_INDEX ↔ bodies", () => {
    it("every indexed id resolves to a body", () => {
        const missing = TEMPLATE_INDEX.filter((t) => templateBody(t.id) === null).map((t) => t.id);
        expect(missing).toEqual([]);
    });

    it("every indexed id resolves to a complete Template", () => {
        for (const entry of TEMPLATE_INDEX) {
            const full = template(entry.id);
            expect(full, `no template for "${entry.id}"`).not.toBeNull();
            expect(full!.name).toBe(entry.name);
            expect(full!.category).toBe(entry.category);
            expect(full!.content.sections.length).toBeGreaterThan(0);
            expect(full!.content.format).toBeTruthy();
        }
    });

    it("ids are unique", () => {
        const ids = TEMPLATE_INDEX.map((t) => t.id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it("an unknown id resolves to null rather than throwing", () => {
        expect(templateBody("no-such-template")).toBeNull();
        expect(template("no-such-template")).toBeNull();
    });
});
