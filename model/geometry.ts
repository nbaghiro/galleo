import type { Id } from "@model/artifact";

export type Size =
    | { mode: "fit"; min?: number; max?: number }
    | { mode: "grow"; min?: number; max?: number }
    | { mode: "percent"; value: number }
    | { mode: "fixed"; value: number };

export const fit = (min?: number, max?: number): Size => ({ mode: "fit", min, max });
export const grow = (min?: number, max?: number): Size => ({ mode: "grow", min, max });
export const percent = (value: number): Size => ({ mode: "percent", value });
export const fixed = (value: number): Size => ({ mode: "fixed", value });

export interface BoxInsets {
    top: number;
    right: number;
    bottom: number;
    left: number;
}

// how an element sits in its parent row/column, independent of element data
export interface ElementLayout {
    width?: "fit" | "fill" | { pct: number }; // pct = percent of the row
    height?: "fit" | "fill"; // fill = stretch to the row's cross-height
    align?: "start" | "center" | "end"; // self cross-axis alignment
    radius?: number; // corner radius override on the element's frame (fill/image)
    // section chrome: lifted out of the content flow and anchored to the section's own band, so a
    // topbar hugs a hero's top edge while the content centres below it
    dock?: "top";
}

export type FormatKind = "paged" | "continuous";

export interface FormatDescriptor {
    id: Id;
    name: string;
    kind: FormatKind;
    width: number | "fill";
    height: number | "auto";
    maxContentWidth?: number;
    bleedSections?: boolean; // sections span the host width instead of sitting in a gutter
    tokenScale: number; // type + space multiplier; 1 leaves the composed tree untouched
    // Fluid type: below `reference` px of container width, tokenScale ramps down linearly with the
    // width, floored at `min` so hierarchy survives. Absent = fixed type at every width.
    ramp?: { reference: number; min: number };
    // Backdrop a non-bleed section keeps visible inside a narrow stack (the effective gutter once
    // the container is narrower than maxContentWidth + inset). Default 64.
    stackInset?: number;
    splitMinWidth: number;
    // What a paged render does with a section taller than its frame: split it across pages, or keep
    // one page and let the caller scale the content down. A card format wants "fit" — silently
    // becoming two cards changes what the author publishes.
    overflow: "paginate" | "fit";
}
