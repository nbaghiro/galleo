import type { Size } from "@model/content";

// Sizing constructors (Clay-style): fit to content, grow to fill, percent of parent, fixed px.

export const fit = (min?: number, max?: number): Size => ({ mode: "fit", min, max });
export const grow = (min?: number, max?: number): Size => ({ mode: "grow", min, max });
export const percent = (value: number): Size => ({ mode: "percent", value });
export const fixed = (value: number): Size => ({ mode: "fixed", value });
