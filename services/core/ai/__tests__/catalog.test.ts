import { describe, expect, it } from "vitest";
import { CHART_TYPES, DIAGRAM_ICONS, DIAGRAM_TYPES } from "@model/elements";
import { ELEMENTS } from "@services/core/ai/prompts/catalog";

const field = (type: string, key: string): { values?: readonly string[]; desc: string } => {
    const f = ELEMENTS.find((e) => e.type === type)?.fields.find((x) => x.key === key);
    if (!f) throw new Error(`no ${type}.${key} in the catalog`);
    return f;
};

describe("the element catalog covers what it offers", () => {
    // The prompt is the only place a type's data shape is explained, so a type that reaches the
    // enum without a sentence is one the model can select and then fill in wrongly.
    it("names every chart type in its own guidance", () => {
        const desc = field("chart", "type").desc;
        expect(CHART_TYPES.filter((t) => !desc.includes(`\`${t}\``))).toEqual([]);
    });

    it("names every diagram type in its own guidance", () => {
        const desc = field("diagram", "type").desc;
        expect(DIAGRAM_TYPES.filter((t) => !desc.includes(`\`${t}\``))).toEqual([]);
    });

    it("offers the value-sets the canvas actually reads", () => {
        expect(field("chart", "type").values).toEqual(CHART_TYPES);
        expect(field("diagram", "type").values).toEqual(DIAGRAM_TYPES);
    });

    it("lists the icon vocabulary in full, so the model never invents a key", () => {
        const desc = field("diagram", "itemsMeta").desc;
        expect(DIAGRAM_ICONS.filter((i) => !desc.includes(i))).toEqual([]);
    });

    // every type that reads a per-item number has to say so, or the model omits `value`
    it("explains the fields the newer types read", () => {
        const items = field("diagram", "items").desc;
        for (const t of ["funnel", "pictogram", "roadmap"]) expect(items).toContain(t);
        const axes = field("diagram", "axes").desc;
        for (const t of ["quadrant", "matrix", "roadmap"]) expect(axes).toContain(t);
        const links = field("diagram", "links").desc;
        for (const t of ["org", "mindmap", "flow"]) expect(links).toContain(t);
        const values = field("chart", "values").desc;
        for (const t of ["waterfall", "pack", "progress", "heatmap"]) expect(values).toContain(t);
    });
});
