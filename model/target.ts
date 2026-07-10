import type { Id } from "@model/artifact";

// Stable addressing of selectable entities within an artifact. The engine tags geometry regions with
// these ids; the editor parses them back into targets for selection, overlays, and content ops.
// A section's content is one recursive tree (`section.root`), so an element is addressed purely by its
// index PATH into that tree — `[]` is the root itself, `[0]` its first child, `[0,1]` a grandchild.
// (Section ids are simple slugs without ":", so ":" is a safe separator.)

export interface ElementAddress {
    section: Id;
    path: number[]; // index path into the section's root tree; [] = the root node
}

export type Target =
    | { kind: "section"; section: Id }
    | { kind: "element"; address: ElementAddress };

export const sectionRegionId = (section: Id): string => `section:${section}`;
export const elementRegionId = (a: ElementAddress): string =>
    a.path.length ? `el:${a.section}:${a.path.join(".")}` : `el:${a.section}`;

export function regionId(t: Target): string {
    if (t.kind === "section") return sectionRegionId(t.section);
    return elementRegionId(t.address);
}

export function parseTarget(id: string): Target | null {
    const p = id.split(":");
    if (p[0] === "section" && p[1]) return { kind: "section", section: p[1] };
    if (p[0] === "el" && p[1]) {
        const path = p[2] ? p[2].split(".").map(Number) : [];
        return { kind: "element", address: { section: p[1], path } };
    }
    return null;
}

// On click, the most specific target under the cursor wins: deeper element > element > section.
export function specificity(t: Target): number {
    if (t.kind === "section") return 0;
    return 1 + t.address.path.length;
}

export function targetsEqual(a: Target | null, b: Target | null): boolean {
    if (!a || !b) return a === b;
    return regionId(a) === regionId(b);
}

// Esc walks up: nested element → parent element → the section's root → section → nothing.
export function parentTarget(t: Target): Target | null {
    if (t.kind === "section") return null;
    const a = t.address;
    if (a.path.length > 0)
        return { kind: "element", address: { section: a.section, path: a.path.slice(0, -1) } };
    return { kind: "section", section: a.section };
}
