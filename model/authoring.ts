import type { ArtifactContent, ElementInstance, Section, SectionBackground } from "@model/artifact";
import { emptyRegion, rowGroup } from "@model/section";

// Concise builders for authoring demo artifacts (real content, full element variety).

export const t = (text: string, style: string): ElementInstance => ({
    type: "text",
    data: { text, style },
});

// `seedOrSrc` is a full image URL when it starts with http (e.g. a resolved Unsplash photo); otherwise
// it's a seed for a deterministic placeholder — so fixtures keep working and the agent can pass real URLs.
export const img = (seedOrSrc: string, aspect: number, radius = 14): ElementInstance => ({
    type: "image",
    data: {
        src: seedOrSrc.startsWith("http")
            ? seedOrSrc
            : `https://picsum.photos/seed/${seedOrSrc}/1100/900`,
        aspect,
        radius,
        fit: "cover",
    },
});

export const stat = (value: string, label: string): ElementInstance => ({
    type: "stat",
    data: { children: [t(value, "h1"), t(label, "caption")] },
});

export const quote = (text: string, by: string): ElementInstance => ({
    type: "quote",
    data: { children: [t(text, "h3"), t(by, "caption")] },
});

export const bullets = (...items: string[]): ElementInstance => ({
    type: "bullets",
    data: { children: items.map((i) => t(i, "body")) },
});

export const group = (...children: ElementInstance[]): ElementInstance => ({
    type: "group",
    data: { children },
});

export const button = (label: string): ElementInstance => ({ type: "button", data: { label } });

export const chart = (kind: string, values: string, height = 240): ElementInstance => ({
    type: "chart",
    data: { kind, values, height },
});

export const divider = (): ElementInstance => ({ type: "divider", data: {} });

// Column helpers for authoring a section's recursive `root`. `row(...)` lays children side by side in an
// even split; `split(pct, a, b)` weights a two-column row; a plain `group(...)` stacks vertically;
// `emptyRegion()` is a droppable blank column. A section's `root` is any element — a single leaf for a
// full-width section, or a row of columns for a split.
export const row = (...children: ElementInstance[]): ElementInstance => rowGroup(children);

export const split = (
    leftPct: number,
    left: ElementInstance,
    right: ElementInstance,
): ElementInstance => rowGroup([left, right], [leftPct / 100, 1 - leftPct / 100]);

export { emptyRegion };

export const section = (
    id: string,
    root: ElementInstance,
    opts?: { background?: SectionBackground; bleed?: boolean },
): Section => ({ id, root, ...opts });

export const bgImage = (seedOrSrc: string, scrim = 0.5): SectionBackground => ({
    kind: "image",
    image: seedOrSrc.startsWith("http")
        ? seedOrSrc
        : `https://picsum.photos/seed/${seedOrSrc}/1700/1100`,
    scrim,
});

export const video = (url: string): ElementInstance => ({ type: "video", data: { url } });

export const badge = (text: string): ElementInstance => ({ type: "badge", data: { text } });

export const code = (codeText: string): ElementInstance => ({
    type: "code",
    data: { code: codeText },
});

export const table = (data: string, header = true): ElementInstance => ({
    type: "table",
    data: { data, header },
});

export const diagram = (kind: string, items: string, height = 220): ElementInstance => ({
    type: "diagram",
    data: { kind, items, height },
});

export const embed = (title: string, url: string): ElementInstance => ({
    type: "embed",
    data: { title, url },
});

export const callout = (tone: string, ...children: ElementInstance[]): ElementInstance => ({
    type: "callout",
    data: { tone, children },
});

export const card = (...children: ElementInstance[]): ElementInstance => ({
    type: "card",
    data: { children },
});

const artifact = (
    format: string,
    theme: string,
    sections: Section[],
    background?: SectionBackground,
): ArtifactContent => ({ format, theme, sections, ...(background ? { background } : {}) });

export const deck = (
    theme: string,
    sections: Section[],
    background?: SectionBackground,
): ArtifactContent => artifact("deck", theme, sections, background);

export const doc = (
    theme: string,
    sections: Section[],
    background?: SectionBackground,
): ArtifactContent => artifact("doc", theme, sections, background);

export const web = (
    theme: string,
    sections: Section[],
    background?: SectionBackground,
): ArtifactContent => artifact("web", theme, sections, background);
