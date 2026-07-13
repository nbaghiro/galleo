import { rankItems } from "./fuzzy";
import { GROUP_LABEL, GROUP_ORDER, type CommandGroup, type PaletteItem } from "./keys";

export interface Row extends PaletteItem {
    group?: CommandGroup;
}

export const haystack = (r: Row): string => `${r.title} ${(r.keywords ?? []).join(" ")}`;

/** Root + empty query → rows grouped (Recent, then by CommandGroup) with a header per section; else a flat ranked list. */
export function paletteDisplay(
    rows: Row[],
    query: string,
    atRoot: boolean,
    recentIds: string[],
): { row: Row; header?: string }[] {
    if (query.trim() || !atRoot) return rankItems(query, rows, haystack).map((row) => ({ row }));
    const sections: { label: string; rows: Row[] }[] = [];
    const rec = recentIds.map((id) => rows.find((r) => r.id === id)).filter((r): r is Row => !!r);
    if (rec.length) sections.push({ label: "Recent", rows: rec });
    for (const g of GROUP_ORDER) {
        const gr = rows.filter((r) => r.group === g);
        if (gr.length) sections.push({ label: GROUP_LABEL[g], rows: gr });
    }
    return sections.flatMap((s) =>
        s.rows.map((row, j) => ({ row, header: j === 0 ? s.label : undefined })),
    );
}
