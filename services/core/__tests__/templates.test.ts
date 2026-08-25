import { describe, expect, it } from "vitest";
import type { ElementInstance } from "@model/artifact";
import { sectionLinkId } from "@model/artifact";
import { TEMPLATE_INDEX } from "@model/templates";
import { THEMES } from "@themes";
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

    // `resolveTheme` falls back to studio for an id it does not know, so a template naming a theme
    // that was renamed or dropped keeps rendering — in the wrong palette, silently. Five of the site
    // templates shipped that way. Asserting membership rather than the fallback is the whole point:
    // the fallback is what hides it.
    it("every template names a theme the catalog still carries", () => {
        const wrong = TEMPLATE_INDEX.map((e) => [e.id, templateBody(e.id)!.theme] as const).filter(
            ([, theme]) => !(theme in THEMES),
        );
        expect(wrong).toEqual([]);
    });
});

// A `#` href is resolved against the piece it lives in, so one pointing at an id no section carries
// is a link that silently does nothing. Nothing else would catch it: the body is authored data.
describe("the links a template ships with", () => {
    const hrefsIn = (el: ElementInstance, out: string[] = []): string[] => {
        const d = el.data as { href?: unknown; children?: unknown };
        if (typeof d.href === "string") out.push(d.href);
        if (Array.isArray(d.children))
            for (const child of d.children as ElementInstance[]) hrefsIn(child, out);
        return out;
    };

    it("every internal link names a section of its own template", () => {
        for (const entry of TEMPLATE_INDEX) {
            const content = templateBody(entry.id)!;
            const ids = new Set(content.sections.map((s) => s.id));
            for (const section of content.sections)
                for (const href of hrefsIn(section.root)) {
                    const target = sectionLinkId(href);
                    if (target) expect(ids.has(target), `${entry.id} → ${href}`).toBe(true);
                }
        }
    });

    it("every pinned section carries a background, since it paints over what scrolls under it", () => {
        for (const entry of TEMPLATE_INDEX)
            for (const section of templateBody(entry.id)!.sections)
                if (section.pinned)
                    expect(section.background?.kind, `${entry.id}/${section.id}`).toBe("color");
    });
});
