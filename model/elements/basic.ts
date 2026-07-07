// Basic-category value-sets — the small standalone elements (button / badge / embed / gradient / divider /
// spacer / shape). Only `button` carries a shared enum today; others are plain scalar fields.

export const BUTTON_VARIANTS = ["filled", "outline"] as const;
export type ButtonVariant = (typeof BUTTON_VARIANTS)[number];
