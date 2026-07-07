// Composite-category value-sets — the container elements (card / group) and the composite presets
// (feature / profile / testimonial / pricing / cta / faq) that arrange other elements.

export const CARD_STYLES = ["solid", "outline", "sideline", "topline", "plain"] as const;
export type CardStyle = (typeof CARD_STYLES)[number];

export const FLEX_DIRECTION = ["row", "col"] as const;
export type FlexDirection = (typeof FLEX_DIRECTION)[number];
