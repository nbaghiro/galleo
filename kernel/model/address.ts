import type { Id } from "@model/content";

// Stable addressing of selectable entities within an artifact. The engine tags geometry regions with
// these ids; the editor parses them back into targets for selection, overlays, and content ops.
// (Section/cell ids are simple slugs without ":", so ":" is a safe separator.)

export interface ElementAddress {
    section: Id;
    cell: string;
    path: number[]; // index path into nested containers; [] = the cell's root element
}

export type Target =
    | { kind: "section"; section: Id }
    | { kind: "cell"; section: Id; cell: string }
    | { kind: "element"; address: ElementAddress };

export const sectionRegionId = (section: Id): string => `section:${section}`;
export const cellRegionId = (section: Id, cell: string): string => `cell:${section}:${cell}`;
export const elementRegionId = (a: ElementAddress): string => `el:${a.section}:${a.cell}:${a.path.join(".")}`;

export function regionId(t: Target): string {
    if (t.kind === "section") return sectionRegionId(t.section);
    if (t.kind === "cell") return cellRegionId(t.section, t.cell);
    return elementRegionId(t.address);
}

export function parseTarget(id: string): Target | null {
    const p = id.split(":");
    if (p[0] === "section" && p[1]) return { kind: "section", section: p[1] };
    if (p[0] === "cell" && p[1] && p[2]) return { kind: "cell", section: p[1], cell: p[2] };
    if (p[0] === "el" && p[1] && p[2] !== undefined) {
        const path = p[3] ? p[3].split(".").map(Number) : [];
        return { kind: "element", address: { section: p[1], cell: p[2], path } };
    }
    return null;
}

// On click, the most specific target under the cursor wins: deeper element > element > cell > section.
export function specificity(t: Target): number {
    if (t.kind === "section") return 0;
    if (t.kind === "cell") return 1;
    return 2 + t.address.path.length;
}

export function targetsEqual(a: Target | null, b: Target | null): boolean {
    if (!a || !b) return a === b;
    return regionId(a) === regionId(b);
}

// Esc walks up: nested element → parent element → cell → section → nothing.
export function parentTarget(t: Target): Target | null {
    if (t.kind === "section") return null;
    if (t.kind === "cell") return { kind: "section", section: t.section };
    const a = t.address;
    if (a.path.length > 0) return { kind: "element", address: { ...a, path: a.path.slice(0, -1) } };
    return { kind: "cell", section: a.section, cell: a.cell };
}
