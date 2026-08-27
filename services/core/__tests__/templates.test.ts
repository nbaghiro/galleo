import { describe, expect, it } from "vitest";
import type { ElementInstance } from "@model/artifact";
import { LAYOUT_PRESETS, SECTION_TONES, sectionForms, sectionLinkId } from "@model/artifact";
import { TEMPLATE_INDEX } from "@model/templates";
import { BLOCK_KINDS } from "@model/elements";
import { THEMES } from "@themes";
import { template, templateBody } from "@services/core/templates";
import { renderIssues } from "@services/core/ai/quality";

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
        const d = el.data as { href?: unknown; children?: unknown; marks?: unknown };
        if (typeof d.href === "string") out.push(d.href);
        if (Array.isArray(d.marks))
            for (const m of d.marks as { type?: unknown; value?: unknown }[])
                if (m.type === "link" && typeof m.value === "string") out.push(m.value);
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

// A flat band is the one background a template can name against the theme instead of against a
// colour, and a hex there is what breaks the gallery preview: it re-themes the body to the viewer's
// app theme, so a cream band under a dark theme used to keep the dark theme's light ink. An image
// band carries its own scrim and is not part of this.
describe("the bands a template ships with", () => {
    it("names every flat band as a tone rather than as a hex", () => {
        const raw: string[] = [];
        for (const entry of TEMPLATE_INDEX)
            for (const section of templateBody(entry.id)!.sections) {
                const kind = section.background?.kind;
                if (kind === "color" || kind === "gradient")
                    raw.push(`${entry.id}/${section.id} (${kind})`);
            }
        expect(raw).toEqual([]);
    });

    it("uses tones the renderer knows", () => {
        for (const entry of TEMPLATE_INDEX)
            for (const section of templateBody(entry.id)!.sections)
                if (section.background?.kind === "tone")
                    expect(SECTION_TONES, `${entry.id}/${section.id}`).toContain(
                        section.background.tone,
                    );
    });

    // Four templates shipped an empty 40% container beside a 60% column, meant as negative space
    // and drawn by the editor as a dashed "+ drop element" target on somebody's first slide. The
    // same walk also catches the two rows the solver cannot honour as written: one where only some
    // columns carry a width share (which silently falls back to equal columns and loses the split)
    // and one where every column asks to fill (which leaves no height to share, so the row measures
    // zero). A template is authored by hand, so nothing else would catch either.
    it("leaves no empty drop target, and no row the solver cannot lay out as written", () => {
        const faults: string[] = [];
        for (const entry of TEMPLATE_INDEX)
            for (const section of templateBody(entry.id)!.sections)
                for (const issue of renderIssues(section))
                    faults.push(`${entry.id}/${section.id}: ${issue}`);
        expect(faults).toEqual([]);
    });

    it("section ids are unique within each template", () => {
        for (const entry of TEMPLATE_INDEX) {
            const seen = new Set<string>();
            for (const section of templateBody(entry.id)!.sections) {
                expect(seen.has(section.id), `${entry.id}/${section.id}`).toBe(false);
                seen.add(section.id);
            }
        }
    });

    // A comma inside a table cell silently becomes a phantom column ("First 1,000 invites"
    // renders as "First 1" | "000 invites"). Middots join values inside a cell instead.
    it("every table row has exactly the columns its first row declares", () => {
        const tablesIn = (el: ElementInstance, out: string[] = []): string[] => {
            const d = el.data as { data?: unknown; children?: unknown };
            if (el.type === "table" && typeof d.data === "string") out.push(d.data);
            if (Array.isArray(d.children))
                for (const child of d.children as ElementInstance[]) tablesIn(child, out);
            return out;
        };
        for (const entry of TEMPLATE_INDEX)
            for (const section of templateBody(entry.id)!.sections)
                for (const csv of tablesIn(section.root)) {
                    const rows = csv.split("\n");
                    const width = rows[0]!.split(",").length;
                    for (const row of rows)
                        expect(row.split(",").length, `${entry.id}: ${row}`).toBe(width);
                }
    });

    // The measurement the shape feature rests on: a starter can only lend its layouts if every one
    // of them is expressible as a beat. It holds today because no template authors a custom width,
    // and a new one that did would lend an unnamed shape the outline could not follow.
    it("lends a shape the beat vocabulary can carry, section for section", () => {
        const faults: string[] = [];
        for (const entry of TEMPLATE_INDEX)
            for (const form of sectionForms(templateBody(entry.id)!)) {
                if (!(form.layout in LAYOUT_PRESETS))
                    faults.push(`${entry.id}/${form.id}: layout "${form.layout}"`);
                const columns = LAYOUT_PRESETS[form.layout]?.length ?? 1;
                if (form.blocks.length !== columns)
                    faults.push(
                        `${entry.id}/${form.id}: ${form.blocks.length} blocks for ${columns} columns`,
                    );
                for (const block of form.blocks)
                    if (!(BLOCK_KINDS as readonly string[]).includes(block))
                        faults.push(`${entry.id}/${form.id}: block "${block}"`);
            }
        expect(faults).toEqual([]);
    });

    // A site section is a band exactly when it paints one. On web the flag barely shows (the
    // format bleeds everything), so this is what keeps a format switch to doc reading as one
    // column with photo bands breaking wide, never a mix of unmarked widths.
    it("a web section carries bleed exactly when it carries a background", () => {
        for (const entry of TEMPLATE_INDEX) {
            const art = templateBody(entry.id)!;
            if (art.format !== "web") continue;
            for (const section of art.sections) {
                const paints = !!section.background && section.background.kind !== "none";
                expect(!!section.bleed, `${entry.id}/${section.id}`).toBe(paints);
            }
        }
    });
});
