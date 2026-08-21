import type { ArtifactContent, ElementInstance, Section, SectionBackground } from "@model/artifact";
import { emptyRegion, rowGroup, withWidth } from "@model/artifact";

export const t = (text: string, style: string): ElementInstance => ({
    type: "text",
    data: { text, style },
});

// seedOrSrc: a full http URL, or a seed for a deterministic placeholder
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

// A container takes an optional leading options object; an element always carries `type`, so the
// two are told apart without a second entry point.
interface ContainerOpts {
    gap?: number;
    align?: "start" | "center" | "end";
    surface?: "solid" | "outline" | "sideline" | "topline" | "plain";
    bg?: string;
    shape?: "sharp" | "rounded";
}

const isOpts = (v: ContainerOpts | ElementInstance): v is ContainerOpts =>
    !("type" in (v as Record<string, unknown>));

const container = (
    direction: "row" | "col",
    args: (ContainerOpts | ElementInstance)[],
): ElementInstance => {
    const first = args[0];
    const opts = first && isOpts(first) ? first : undefined;
    const children = (opts ? args.slice(1) : args) as ElementInstance[];
    return {
        type: "container",
        // col is the default direction, so it stays off the data unless a row asks for it
        data: { ...(direction === "row" ? { direction } : {}), ...opts, children },
    };
};

/** A column. `group` is the older spelling of the same thing. */
export const col = (...args: (ContainerOpts | ElementInstance)[]): ElementInstance =>
    container("col", args);

export const group = (...args: (ContainerOpts | ElementInstance)[]): ElementInstance =>
    container("col", args);

/**
 * Width lives on the CHILD, which is where the data model already keeps it (`layout.width.pct`),
 * so any number of columns can be weighted: `row(w(50, a), b, c)` gives a half and splits the rest.
 * This is what `split` could never express, being fixed at two.
 */
export const w = (pct: number, el: ElementInstance): ElementInstance => withWidth(el, pct);

/** Take the leftover space in the row. */
export const fill = (el: ElementInstance): ElementInstance => ({
    ...el,
    layout: { ...el.layout, width: "fill" },
});

/** Shrink to content instead of sharing the row evenly. */
export const fitW = (el: ElementInstance): ElementInstance => ({
    ...el,
    layout: { ...el.layout, width: "fit" },
});

const selfAlign =
    (align: "start" | "center" | "end") =>
    (el: ElementInstance): ElementInstance => ({ ...el, layout: { ...el.layout, align } });

export const top = selfAlign("start");
export const middle = selfAlign("center");
export const bottom = selfAlign("end");

export const button = (label: string): ElementInstance => ({ type: "button", data: { label } });

export const chart = (type: string, values: string, height = 240): ElementInstance => ({
    type: "chart",
    data: { type, values, height },
});

export const divider = (): ElementInstance => ({ type: "divider", data: {} });

// row = even split; split(pct,…) = weighted two-column, now sugar for row(w(…), w(…))
export const row = (...args: (ContainerOpts | ElementInstance)[]): ElementInstance => {
    const first = args[0];
    // rowGroup carries the row's own gap + centre alignment, so a bare row keeps going through it
    if (!first || !isOpts(first)) return rowGroup(args as ElementInstance[]);
    return container("row", args);
};

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

export const video = (src: string): ElementInstance => ({
    type: "video",
    data: { src, controls: true },
});

export const badge = (text: string): ElementInstance => ({ type: "badge", data: { text } });

export const code = (codeText: string): ElementInstance => ({
    type: "code",
    data: { code: codeText },
});

export const table = (data: string, header = true): ElementInstance => ({
    type: "table",
    data: { data, header },
});

export const diagram = (type: string, items: string, height = 220): ElementInstance => ({
    type: "diagram",
    data: { type, items, height },
});

export const embed = (title: string, url: string): ElementInstance => ({
    type: "embed",
    data: { title, url },
});

export const callout = (tone: string, ...children: ElementInstance[]): ElementInstance => ({
    type: "callout",
    data: { tone, children },
});

/** A column with a surface. The older spelling of `col({ surface: … })`. */
export const card = (...children: ElementInstance[]): ElementInstance =>
    container("col", [{ surface: "solid" }, ...children]);

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
