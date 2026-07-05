import type { Id } from "@model/artifact";

// The dimensional contract: how content is sized and placed. Element sizing (Clay-style `Size` + its
// constructors), box insets, per-instance layout, and the format profiles (deck/doc/web) that set page
// geometry. Pure types + a handful of constructors — no DOM, no engine.

export type Size =
    | { mode: "fit"; min?: number; max?: number }
    | { mode: "grow"; min?: number; max?: number }
    | { mode: "percent"; value: number }
    | { mode: "fixed"; value: number };

// Sizing constructors (Clay-style): fit to content, grow to fill, percent of parent, fixed px.
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

// Per-instance layout (how an element sits in its parent row/column) — independent of element data.
export interface ElementLayout {
    width?: "fit" | "fill" | { pct: number }; // fit content · grow to fill · percent of the row
    height?: "fit" | "fill"; // fit content · stretch to the row's cross-height (match a sibling column)
    align?: "start" | "center" | "end"; // self cross-axis alignment
}

// --- format profiles: the deck / doc / web modes and the page geometry each imposes ---

export type FormatKind = "paged" | "continuous";

export interface FormatDescriptor {
    id: Id;
    name: string;
    kind: FormatKind;
    width: number | "fill";
    height: number | "auto";
    maxContentWidth?: number;
    tokenScale: number;
    splitMinWidth: number;
    paginate: "always" | "export" | "never";
    group?: string; // picker grouping: "Presentation" | "Document" | "Web" | "Custom"
    icon?: string; // Icon name for the format pickers
    fullBleed?: boolean; // content fills the frame edge-to-edge (generalizes the id === "web" checks)
    frame?: boolean; // the editor renders each section at the page frame (fixed-frame editing)
}
