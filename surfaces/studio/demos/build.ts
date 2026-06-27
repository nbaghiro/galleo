import type { ArtifactContent, Cell, ElementInstance, Section, SectionBackground } from "@model/content";

// Concise builders for authoring demo artifacts (real content, full element variety).

export const t = (text: string, style: string): ElementInstance => ({ type: "text", data: { text, style } });

export const img = (seed: string, aspect: number, radius = 14): ElementInstance => ({
    type: "image",
    data: { src: `https://picsum.photos/seed/${seed}/1100/900`, aspect, radius, fit: "cover" },
});

export const stat = (value: string, label: string): ElementInstance => ({
    type: "stat",
    data: { children: [t(value, "stat"), t(label, "caption")] },
});

export const quote = (text: string, by: string): ElementInstance => ({
    type: "quote",
    data: { children: [t(text, "title"), t(by, "byline")] },
});

export const bullets = (...items: string[]): ElementInstance => ({
    type: "bullets",
    data: { children: items.map((i) => t(i, "body")) },
});

export const group = (...children: ElementInstance[]): ElementInstance => ({ type: "group", data: { children } });

export const button = (label: string): ElementInstance => ({ type: "button", data: { label } });

export const chart = (kind: string, values: string, height = 240): ElementInstance => ({
    type: "chart",
    data: { kind, values, height },
});

export const divider = (): ElementInstance => ({ type: "divider", data: {} });

export const cell = (element: ElementInstance): Cell => ({ element });

export const empty: Cell = {};

export const section = (
    id: string,
    grid: string,
    cells: Record<string, Cell>,
    opts?: { background?: SectionBackground; bleed?: boolean },
): Section => ({ id, grid, cells, ...opts });

export const bgImage = (seed: string, scrim = 0.5): SectionBackground => ({
    kind: "image",
    image: `https://picsum.photos/seed/${seed}/1700/1100`,
    scrim,
});

export const deck = (theme: string, sections: Section[]): ArtifactContent => ({ format: "deck", theme, sections });
