import { ELEMENTS, LAYOUTS } from "@model/ai";
import type { ElementSchema, FieldSpec } from "@model/ai";
import { TEXT_STYLES } from "@model/elements";
import { THEME_LIST, resolveTheme } from "@themes";

// Generated from the same @model/ai data the Zod schema validates against, so catalog and accepted shape can't drift.

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

export function elementCatalog(): string {
    return [
        "## Elements",
        "A section's content is ONE element tree. A leaf is `{ type, data }`; a container (`group`/`card`/…) nests children in `data.children`. Available element types:",
        "",
        ELEMENTS.map(elementBlock).join("\n"),
        "",
        `Text \`style\` values (typographic roles): ${TEXT_STYLES.join(", ")}. Use exactly one \`h1\` per section.`,
        "To place several elements together, wrap them in a `group` (direction 'col' to stack, 'row' for side-by-side) or a `card`. Set `group.columns` for an N-up grid.",
    ].join("\n");
}

export function layoutCatalog(): string {
    const rows = LAYOUTS.map(
        (g) =>
            `- \`${g.id}\` — ${g.widths} (${g.columns} column${g.columns > 1 ? "s" : ""}) — ${g.when}`,
    ).join("\n");
    return [
        "## Section layout",
        'A section is `{ id, root }`, where `root` is one element tree. For side-by-side columns, make `root` a `group` with `direction: "row"` whose children each carry `layout: { width: { pct } }` (their column share, summing to ~100). To stack, use `direction: "col"`. Nest to any depth. For a full-width section, `root` is a single element. These named presets are handy starting splits (custom widths are fine too):',
        "",
        rows,
    ].join("\n");
}

export function describeTheme(id: string): string {
    const t = resolveTheme(id);
    const mode = t.dark ? "dark" : "light";
    return `The active theme is "${t.name}" (${t.tag}, ${mode}). Write in a register that fits a ${t.tag} ${mode} design.`;
}

export function themeCatalog(): string {
    const rows = THEME_LIST.map(
        (t) => `- \`${t.id}\` — ${t.name} (${t.tag}, ${t.dark ? "dark" : "light"})`,
    ).join("\n");
    return ["## Themes", "Pick a theme id whose mood fits the content:", "", rows].join("\n");
}
