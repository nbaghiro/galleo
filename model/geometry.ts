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
    splitMinWidth: number;
    // What a paged render does with a section taller than its frame: split it across pages, or keep
    // one page and let the caller scale the content down. A card format wants "fit" — silently
    // becoming two cards changes what the author publishes.
    overflow: "paginate" | "fit";
    // Every page is the same shape, so `Section.frame.aspect` is ignored. A carousel is posted as one
    // set and the host enforces a single aspect across it, so a mixed-shape carousel is rejected or
    // cropped. Enforced in sectionFrame rather than by hiding the control, since converting a deck
    // (where mixing shapes is a feature) would otherwise carry stale per-section aspects across.
    uniformFrame?: boolean;
    // How the editor canvas arranges sections.
    //   "stack"    — a vertical run at natural height (default): deck, doc, site
    //   "framed"   — a vertical run, each section inside its page frame
    //   "carousel" — a horizontal run of framed pages, the focused one full size
    // A deck tolerates natural-height editing because it frames only in Present. A card format cannot:
    // its shape IS the artifact, and a carousel is read sideways, so the editor should be too.
    canvas?: "stack" | "framed" | "carousel";
}
