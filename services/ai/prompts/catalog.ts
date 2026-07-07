import { ELEMENTS, GRIDS } from "@model/ai";
import type { ElementSchema, FieldSpec } from "@model/ai";
import { TEXT_STYLES } from "@model/elements";
import { THEME_LIST, resolveTheme } from "@themes";

// Renders the model-level authoring descriptor (@model/ai) + the theme registry into the reference
// text the LLM sees. Because it is generated from the same data the Zod schema validates against, the
// catalog the model reads and the shape the module accepts can never drift.

function fieldLine(f: FieldSpec): string {
    const bits: string[] = [];
    if (f.required) bits.push("required");
    if (f.type === "enum" && f.values) bits.push(`one of: ${f.values.join(" | ")}`);
    else bits.push(f.type);
    if (f.default !== undefined) bits.push(`default ${JSON.stringify(f.default)}`);
    return `    - ${f.key} (${bits.join(", ")}) — ${f.desc}`;
}

function elementBlock(e: ElementSchema): string {
    const head = `- \`${e.type}\`${e.container ? " [container]" : ""} — ${e.when}`;
    const fields = e.fields.map(fieldLine).join("\n");
    return `${head}\n${fields}`;
}

// The full element reference — types, when to use each, and the exact `data` fields with their enums.
export function elementCatalog(): string {
    return [
        "## Elements",
        "Each cell holds one element: `{ type, data }`. Containers nest elements in `data.children`. Available element types:",
        "",
        ELEMENTS.map(elementBlock).join("\n"),
        "",
        `Text \`style\` values (typographic roles): ${TEXT_STYLES.join(", ")}. Use exactly one \`h1\` per section.`,
        "For several elements in one cell, wrap them in a `group` (or `card`). Set `group.columns` to lay out an N-up grid.",
    ].join("\n");
}

// The section grid reference.
export function gridCatalog(): string {
    const rows = GRIDS.map(
        (g) => `- \`${g.id}\` — ${g.widths}; cells [${g.cells.join(", ")}] — ${g.when}`,
    ).join("\n");
    return [
        "## Section grids",
        "A section is `{ id, grid, cells }`. `grid` names a column template; put one element in each of the grid's cells:",
        "",
        rows,
    ].join("\n");
}

// A compact description of one theme — what mood the writing should match. The theme is usually the user's
// pick; the writer only needs its feel, not the palette.
export function describeTheme(id: string): string {
    const t = resolveTheme(id);
    const mode = t.dark ? "dark" : "light";
    return `The active theme is "${t.name}" (${t.tag}, ${mode}). Write in a register that fits a ${t.tag} ${mode} design.`;
}

// The full pickable theme list, for the rare turn where the AI chooses a theme itself.
export function themeCatalog(): string {
    const rows = THEME_LIST.map(
        (t) => `- \`${t.id}\` — ${t.name} (${t.tag}, ${t.dark ? "dark" : "light"})`,
    ).join("\n");
    return ["## Themes", "Pick a theme id whose mood fits the content:", "", rows].join("\n");
}
