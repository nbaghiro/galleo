import type { Id } from "@model/artifact";

// element addressed by index path into section.root ([] = root); ids never contain ":", the id separator

export interface ElementAddress {
    section: Id;
    path: number[]; // index path into section.root; [] = the root node
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

// most specific wins: deeper element > element > section
export function specificity(t: Target): number {
    if (t.kind === "section") return 0;
    return 1 + t.address.path.length;
}

export function targetsEqual(a: Target | null, b: Target | null): boolean {
    if (!a || !b) return a === b;
    return regionId(a) === regionId(b);
}

// Esc walks up: nested element → parent → root → section → nothing
export function parentTarget(t: Target): Target | null {
    if (t.kind === "section") return null;
    const a = t.address;
    if (a.path.length > 0)
        return { kind: "element", address: { section: a.section, path: a.path.slice(0, -1) } };
    return { kind: "section", section: a.section };
}
