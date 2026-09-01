import type {
    ArtifactContent,
    ElementInstance,
    Section,
    SectionBackground,
    SectionFrame,
    SectionTone,
} from "@model/artifact";
import { emptyRegion, rowGroup, withWidth } from "@model/artifact";
import type { Mark } from "./text";

export const t = (
    text: string,
    style: string,
    align?: "start" | "center" | "end",
): ElementInstance => ({
    type: "text",
    data: align ? { text, style, align } : { text, style },
});

/**
 * Text whose spans are real links: parts concatenate in order, and a `[label, href]` pair carries a
 * link mark over its label, so a footer's `Work · Services` reads as prose but clicks as a nav.
 * `href` follows `button`: a URL (or mailto:/tel:), or `#<section id>` for a move within the piece.
 */
export const linked = (
    style: string,
    ...parts: (string | [label: string, href: string])[]
): ElementInstance => {
    let text = "";
    const marks: Mark[] = [];
    for (const part of parts) {
        if (typeof part === "string") {
            text += part;
            continue;
        }
        const [label, href] = part;
        marks.push({
            from: text.length,
            to: text.length + label.length,
            type: "link",
            value: href,
        });
        text += label;
    }
    return { type: "text", data: { text, style, marks } };
};

// seedOrSrc: a full http URL, or a seed for a deterministic placeholder
const photo = (seedOrSrc: string, w: number, h: number): string =>
    seedOrSrc.startsWith("http") ? seedOrSrc : `https://picsum.photos/seed/${seedOrSrc}/${w}/${h}`;

export const img = (seedOrSrc: string, aspect: number, radius = 14): ElementInstance => ({
    type: "media",
    data: {
        kind: "photo",
        src: photo(seedOrSrc, 1100, 900),
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

/** A bullet list marked with ticks: an inclusion list, where `bullets` is a plain one. */
export const checks = (...items: string[]): ElementInstance => ({
    type: "bullets",
    data: { children: items.map((i) => t(i, "body")), marker: "check" },
});

// A container takes an optional leading options object; an element always carries `type`, so the
// two are told apart without a second entry point.
interface ContainerOpts {
    gap?: number;
    align?: "start" | "center" | "end" | "baseline";
    justify?: "between" | "around" | "evenly";
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

interface ButtonOpts {
    variant?: "filled" | "outline" | "soft" | "ghost";
    size?: "sm" | "md" | "lg";
    shape?: "sharp" | "rounded" | "pill";
}

/** `href` is a URL, or `#<section id>` to move within the same piece (a nav link, a hero CTA). */
export const button = (label: string, href?: string, opts?: ButtonOpts): ElementInstance => ({
    type: "button",
    data: { label, ...(href ? { href } : {}), ...opts },
});

/** The popup's menu variant: one trigger over a tight column of linked buttons. */
export const menu = (label: string, ...items: ElementInstance[]): ElementInstance => ({
    type: "popup",
    data: { label, variant: "menu", children: items },
});

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
    opts?: {
        background?: SectionBackground;
        bleed?: boolean;
        // paged: the page shape. Continuous: a minimum band height, which is what makes a hero tall.
        frame?: SectionFrame;
        // sticks to the top of a scrolling page; a nav bar wants a solid background with it
        pinned?: boolean;
    },
): Section => ({ id, root, ...opts });

export const bgImage = (seedOrSrc: string, scrim = 0.5): SectionBackground => ({
    kind: "image",
    image: seedOrSrc.startsWith("http")
        ? seedOrSrc
        : `https://picsum.photos/seed/${seedOrSrc}/1700/1100`,
    scrim,
});

export const bgColor = (color: string): SectionBackground => ({ kind: "color", color });

// Prefer this over bgColor for a band whose job is a step in the page's rhythm rather than one
// specific colour: a tone re-derives from whatever theme the piece is read under.
export const bgTone = (tone: SectionTone): SectionBackground => ({ kind: "tone", tone });

// The poster is what every static surface paints (thumbnail, PDF, the editor canvas); without one a
// YouTube src falls back to the provider's own frame, which is rarely the shot the page wants.
export const video = (src: string, posterSeedOrSrc?: string): ElementInstance => ({
    type: "media",
    data: {
        kind: "video",
        src,
        controls: true,
        ...(posterSeedOrSrc ? { poster: photo(posterSeedOrSrc, 1280, 720) } : {}),
    },
});

export const badge = (text: string): ElementInstance => ({ type: "badge", data: { text } });

export const code = (codeText: string): ElementInstance => ({
    type: "code",
    data: { code: codeText },
});

export const table = (data: string, header = true, clamp?: number): ElementInstance => ({
    type: "table",
    data: clamp ? { data, header, clamp } : { data, header },
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

/** Lift out of the flow, anchored to the parent's box; offsets in px at compose scale. */
export const pin = (
    el: ElementInstance,
    x: "start" | "center" | "end",
    y: "start" | "center" | "end",
    opts?: { dx?: number; dy?: number; z?: number; rotate?: number },
): ElementInstance => ({ ...el, layout: { width: "fit", ...el.layout, pin: { x, y, ...opts } } });

/** A photo and its caption on one small card, ready to pin and turn. */
export const polaroid = (src: string, aspect: number, caption: string): ElementInstance =>
    col({ surface: "solid" }, img(src, aspect, 8), t(caption, "caption"));

/** Clamp a text element to n painted lines. */
export const clampLines = (el: ElementInstance, lines: number): ElementInstance => ({
    ...el,
    data: { ...(el.data as Record<string, unknown>), maxLines: lines },
});

//
// Each composite element reads its children by position (testimonial indexes four fixed slots,
// faq walks question/answer pairs), so these builders are how an author gets the order right.

const avatar = (size: number, src?: string): ElementInstance => ({
    type: "media",
    data: {
        kind: "photo",
        shape: "circle",
        size,
        ...(src ? { src } : {}),
    },
});

/** One priced tier: eyebrow, price, the line under it, what's included, and the action. */
export const pricing = (
    tier: string,
    price: string,
    note: string,
    includes: string[],
    action: ElementInstance,
): ElementInstance => ({
    type: "pricing",
    data: {
        children: [
            t(tier, "label"),
            t(price, "h1"),
            t(note, "caption"),
            checks(...includes),
            action,
        ],
    },
});

export const feature = (title: string, body: string, eyebrow?: string): ElementInstance => ({
    type: "feature",
    data: {
        children: eyebrow
            ? [t(eyebrow, "label"), t(title, "h3"), t(body, "body")]
            : [t(title, "h3"), t(body, "body")],
    },
});

/** Four fixed slots: the quote, the face, the name, the line under the name. */
export const testimonial = (
    said: string,
    name: string,
    role: string,
    face?: string,
): ElementInstance => ({
    type: "testimonial",
    data: { children: [t(said, "quote"), avatar(52, face), t(name, "body"), t(role, "caption")] },
});

export const profile = (
    name: string,
    role: string,
    face?: string,
    note?: string,
): ElementInstance => ({
    type: "profile",
    data: {
        children: [
            avatar(88, face),
            t(name, "h3", "center"),
            t(role, "caption", "center"),
            ...(note ? [t(note, "caption", "center")] : []),
        ],
    },
});

/** The tinted closing card: headline, one line, one action. */
export const cta = (headline: string, line: string, action: ElementInstance): ElementInstance => ({
    type: "cta",
    data: { children: [t(headline, "h2", "center"), t(line, "body", "center"), action] },
});

// `open` on the ANSWER is what the accordion toggles, so an authored one starts expanded.
const answer = (text: string, open: boolean): ElementInstance =>
    open ? { type: "text", data: { text, style: "body", open: true } } : t(text, "body");

/**
 * Question/answer pairs. `collapsible` turns each question into a disclosure a reader presses;
 * `openFirst` leaves the top answer showing so the block does not read as a bare list of questions.
 */
export const faq = (
    collapse: "expanded" | "collapsible",
    items: [string, string][],
    openFirst = false,
): ElementInstance => ({
    type: "faq",
    data: {
        collapse,
        children: items.flatMap(([q, a], i) => [t(q, "h3"), answer(a, openFirst && i === 0)]),
    },
});

/** One panel per tab; `labels` is the comma-separated strip, positional. */
export const tabs = (labels: string, ...panels: ElementInstance[]): ElementInstance => ({
    type: "tabs",
    data: { labels, active: 0, children: panels },
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
