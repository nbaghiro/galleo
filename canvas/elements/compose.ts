import type { LayoutCtx } from "@elements/spec";
import type { EngineNode, Rect, Region } from "@engine/node";
import type {
    ElementAddress,
    ElementInstance,
    Section,
    SectionBackground,
    SectionTone,
} from "@model/artifact";
import type { TextLeaf } from "@engine/node";
import type { Tokens } from "@themes";
import { getElement } from "@elements/spec";
import { SECTION_TONES, elementRegionId, sectionRegionId } from "@model/artifact";
import { scaleDrawContext } from "@engine/drawscale";
import { rampScale } from "@engine/profile";
import type { ElementLayout, Size } from "@model/geometry";
import { fit, fixed, grow, percent } from "@model/geometry";
import { fontStack, hexA, hexToRgb, hsl2hex, luminance, mix, rgb2hsl } from "@themes";

const card = (title: string, body: string): ElementInstance => ({
    type: "container",
    data: {
        surface: "solid",
        children: [
            { type: "text", data: { text: title, style: "h3" } },
            { type: "text", data: { text: body, style: "body" } },
        ],
    },
});

export interface Preset {
    id: string;
    label: string;
    previewType: string; // element-preview svg key for the thumbnail
    build: () => ElementInstance;
}

export const PRESETS: Preset[] = [
    {
        id: "cards",
        label: "Cards",
        previewType: "cards",
        build: () => ({
            type: "container",
            data: {
                direction: "row",
                children: [
                    card("First idea", "A short supporting line."),
                    card("Second idea", "A short supporting line."),
                    card("Third idea", "A short supporting line."),
                ],
            },
        }),
    },
];

export const GUTTER = 14; // inset around a section column's top-level element (content width = colW - 2*GUTTER)
const SECTION_PAD = 36;
const BLEED_PAD_X = 72;
const pad = (n: number) => ({ top: n, right: n, bottom: n, left: n });

// `tokenScale` in one place. Type sizes live as constants inside each of the ~20 element specs, so
// scaling them per-element is something every future element would have to remember; scaling the
// composed tree cannot be forgotten. Multiplies type and space only — ratios (`aspect`) and relative
// sizes (`percent`) are already scale-free. A `surface` draws itself and so is handled by scaling its
// coordinate space instead (see @engine/drawscale).
const scaleSize = (s: Size, k: number): Size =>
    s.mode === "fixed"
        ? fixed(s.value * k)
        : s.mode === "percent"
          ? s
          : {
                ...s,
                ...(s.min !== undefined ? { min: s.min * k } : {}),
                ...(s.max !== undefined ? { max: s.max * k } : {}),
            };

const scaleRegion = (r: Region, k: number): Region => ({
    ...r,
    box: { x: r.box.x * k, y: r.box.y * k, w: r.box.w * k, h: r.box.h * k },
    ...(r.radius !== undefined ? { radius: r.radius * k } : {}),
    ...(r.shape
        ? {
              shape: {
                  kind: "poly" as const,
                  points: r.shape.points.map(([x, y]): [number, number] => [x * k, y * k]),
              },
          }
        : {}),
});

export function scaleTokens(node: EngineNode, k: number): EngineNode {
    if (k === 1) return node;
    const out: EngineNode = { ...node, w: scaleSize(node.w, k), h: scaleSize(node.h, k) };
    if (node.gap !== undefined) out.gap = node.gap * k;
    if (node.padding)
        out.padding = {
            top: node.padding.top * k,
            right: node.padding.right * k,
            bottom: node.padding.bottom * k,
            left: node.padding.left * k,
        };
    if (node.float)
        out.float = {
            ...node.float,
            ...(node.float.dx !== undefined ? { dx: node.float.dx * k } : {}),
            ...(node.float.dy !== undefined ? { dy: node.float.dy * k } : {}),
        };
    if (node.text)
        out.text = {
            ...node.text,
            size: node.text.size * k,
            ...(node.text.lineHeight !== undefined ? { lineHeight: node.text.lineHeight * k } : {}),
        };
    if (node.fill?.radius !== undefined) out.fill = { ...node.fill, radius: node.fill.radius * k };
    if (node.image?.radius !== undefined)
        out.image = { ...node.image, radius: node.image.radius * k };
    // A surface draws its own text and geometry, out of reach of this walk, so scale its space instead:
    // it is handed a k-times-smaller box and a context that multiplies everything it emits.
    const surface = node.surface;
    if (surface) {
        const unscaled = (box: Rect): Rect => ({ x: 0, y: 0, w: box.w / k, h: box.h / k });
        const report = surface.regions;
        out.surface = {
            paint: (g, box) => surface.paint(scaleDrawContext(g, k), unscaled(box)),
            // the surface reports in its own smaller space, so the geometry scales back out with it
            ...(report
                ? { regions: (box) => report(unscaled(box)).map((r) => scaleRegion(r, k)) }
                : {}),
        };
    }
    if (node.children) out.children = node.children.map((c) => scaleTokens(c, k));
    return out;
}

function emptyRegionNode(ctx: LayoutCtx): EngineNode {
    // read-only render: same slot geometry, without the editor affordance
    if (ctx.plain) return { w: grow(), h: fit(90) };
    return {
        w: grow(),
        h: fit(90),
        alignX: "center",
        alignY: "center",
        fill: {
            color: ctx.theme.bg,
            radius: 10,
            border: { color: ctx.theme.line, width: 1.5, style: "dashed" },
        },
        children: [
            {
                w: fit(),
                h: fit(),
                text: {
                    text: "+ drop element",
                    fontId: fontStack("mono", ctx.theme),
                    size: 12,
                    color: ctx.theme.muted,
                    align: "center",
                    wrap: "none",
                },
            },
        ],
    };
}

function applyLayout(node: EngineNode, layout: ElementLayout | undefined): EngineNode {
    if (!layout) return node;
    if (layout.width === "fit") node.w = fit();
    else if (layout.width === "fill") node.w = grow();
    else if (layout.width && typeof layout.width === "object")
        node.w = percent(layout.width.pct / 100);
    // fill = stretch to row cross-height; drop aspect so it can grow (images then cover-fill via `fit`)
    if (layout.height === "fill") {
        node.h = grow();
        node.aspect = undefined;
    }
    if (layout.align) node.alignSelf = layout.align;
    if (layout.dock === "top") node.float = { x: "start", y: "start", z: 1 };
    if (layout.radius !== undefined) {
        if (node.image) node.image.radius = layout.radius;
        else if (node.fill) node.fill.radius = layout.radius;
    }
    return node;
}

// group/card are pre-migration aliases for container; see scripts/migrate-container.ts
const STACK_TYPES = new Set(["container", "group", "card"]);

// fraction of the parent's width each child of a row occupies; null when the parent isn't a row
function rowShares(inst: ElementInstance, kids: ElementInstance[]): number[] | null {
    const row =
        STACK_TYPES.has(inst.type) && (inst.data as { direction?: string }).direction === "row";
    if (!row || kids.length === 0) return null;
    const pct = kids.map((k) => {
        const w = k.layout?.width;
        return w && typeof w === "object" ? w.pct / 100 : null;
    });
    return pct.every((p) => p !== null) ? (pct as number[]) : kids.map(() => 1 / kids.length);
}

export function composeElement(
    inst: ElementInstance,
    ctx: LayoutCtx,
    addr: ElementAddress,
): EngineNode {
    const id = elementRegionId(addr);
    const spec = getElement(inst.type);
    if (!spec) {
        return { id, w: grow(), h: fit(40), fill: { color: "#f6dede", radius: 6 } };
    }
    const ectx: LayoutCtx = { ...ctx, region: id };
    let node: EngineNode;
    if (spec.container) {
        const childInstances = spec.container.children(inst.data);
        if (childInstances.length === 0) {
            node = emptyRegionNode(ectx);
        } else {
            // a child of a row only gets its share of the width; elements that must decide layout at
            // compose time (a diagram's wrap) would otherwise size against the whole section
            const share = rowShares(inst, childInstances);
            const kids = childInstances.map((child, i) =>
                composeElement(
                    child,
                    share ? { ...ctx, availWidth: ctx.availWidth * share[i]! } : ctx,
                    { section: addr.section, path: [...addr.path, i] },
                ),
            );
            node = spec.container.arrange(inst.data, ectx, kids);
        }
    } else {
        node = spec.layout(inst.data, ectx);
    }
    node.id = id;
    return applyLayout(node, inst.layout);
}

const HEX6 = /^#[0-9a-fA-F]{6}$/;
const NEAR_BLACK = "#0c0c0c";

// lift a too-dark accent to a legible luminance so it reads on a dark/scrimmed bg — by raising
// HSL lightness, which keeps the hue: a channel-space mix toward white washes the color out, and
// everything downstream (the accent ramp, tinted washes) then degrades to gray
const ACCENT_DARK_TRIGGER = 0.45;
const ACCENT_LIFT_TARGET = 0.62;
function readableAccentOnDark(hex: string): string {
    if (!HEX6.test(hex)) return hex;
    if (luminance(hex) >= ACCENT_DARK_TRIGGER) return hex;
    const [h, s, l] = rgb2hsl(...hexToRgb(hex));
    let lift = Math.max(l, ACCENT_LIFT_TARGET);
    let out = hsl2hex(h, s, lift);
    // a saturated blue is dim at any mid lightness; step until the perceived target is reached
    while (luminance(out) < ACCENT_LIFT_TARGET && lift < 0.9) {
        lift += 0.05;
        out = hsl2hex(h, s, lift);
    }
    return out;
}

// the same move from the other end, for an accent too light to read on a light band: drop the HSL
// lightness rather than mixing toward black, for the reason above (a channel-space mix muddies the
// hue and the ramp built from it). The thresholds are the dark ones measured from the other end of
// the range, so neither side is tuned against the other.
const ACCENT_LIGHT_TRIGGER = 1 - ACCENT_DARK_TRIGGER;
const ACCENT_DROP_TARGET = 1 - ACCENT_LIFT_TARGET;
function readableAccentOnLight(hex: string): string {
    if (!HEX6.test(hex)) return hex;
    if (luminance(hex) <= ACCENT_LIGHT_TRIGGER) return hex;
    const [h, s, l] = rgb2hsl(...hexToRgb(hex));
    let drop = Math.min(l, ACCENT_DROP_TARGET);
    let out = hsl2hex(h, s, drop);
    // a saturated yellow stays bright at any mid lightness; step until the perceived target is met
    while (luminance(out) > ACCENT_DROP_TARGET && drop > 0.1) {
        drop -= 0.05;
        out = hsl2hex(h, s, drop);
    }
    return out;
}

function bgIsDark(bg: SectionBackground | undefined): boolean {
    if (!bg || bg.kind === "none") return false;
    if (bg.dark !== undefined) return bg.dark;
    if (bg.kind === "image") return true; // the scrim makes images dark
    if (bg.kind === "color" && bg.color) return luminance(bg.color) < 0.5;
    if (bg.kind === "gradient" && bg.gradient) return luminance(bg.gradient.from) < 0.5;
    return false;
}

// Not `!bgIsDark`: a section with no background of its own is neither, it just follows the theme.
// Only an explicit light band answers true here, read the way bgIsDark reads its own.
function bgIsLight(bg: SectionBackground | undefined): boolean {
    if (!bg || bg.kind === "none") return false;
    if (bg.dark !== undefined) return !bg.dark;
    if (bg.kind === "image") return false; // the scrim makes images dark
    if (bg.kind === "color" && bg.color) return luminance(bg.color) >= 0.5;
    if (bg.kind === "gradient" && bg.gradient) return luminance(bg.gradient.from) >= 0.5;
    return false;
}

// once the accent is lifted, onAccent must re-pair dark so solid fills keep contrast
function onDark(t: Tokens): Tokens {
    const accent = readableAccentOnDark(t.accent);
    return {
        ...t,
        ink: "#ffffff",
        soft: "rgba(255,255,255,0.86)",
        muted: "rgba(255,255,255,0.64)",
        line: "rgba(255,255,255,0.24)",
        surface: "rgba(255,255,255,0.10)",
        bg: "rgba(255,255,255,0.06)",
        accent,
        onAccent: accent !== t.accent ? NEAR_BLACK : t.onAccent,
    };
}

// onDark's inverse: the same tiers in black, alpha for alpha, so a band that swaps one way and a
// band that swaps the other are the same design decision rather than two calibrations
function onLight(t: Tokens): Tokens {
    const accent = readableAccentOnLight(t.accent);
    return {
        ...t,
        ink: NEAR_BLACK,
        soft: "rgba(0,0,0,0.86)",
        muted: "rgba(0,0,0,0.64)",
        line: "rgba(0,0,0,0.24)",
        surface: "rgba(0,0,0,0.10)",
        bg: "rgba(0,0,0,0.06)",
        accent,
        onAccent: accent !== t.accent ? "#ffffff" : t.onAccent,
    };
}

// An accent band: the ground is the accent, so its content is anchored on the token the theme
// already names as what reads on the accent, tiered the way onDark tiers white. Accent and onAccent
// trade places so an accent-marked eyebrow or a filled button still separates from the ground.
function onAccentGround(t: Tokens): Tokens {
    return {
        ...t,
        ink: t.onAccent,
        soft: hexA(t.onAccent, 0.86),
        muted: hexA(t.onAccent, 0.64),
        line: hexA(t.onAccent, 0.24),
        surface: hexA(t.onAccent, 0.1),
        bg: hexA(t.onAccent, 0.06),
        accent: t.onAccent,
        onAccent: t.accent,
    };
}

// Whether the base theme is a dark one, read from `ink` rather than `bg`: ink is the token these
// swaps replace, and it stays a plain hex in every token set, while `bg` may already be a
// translucent wash (both swaps write one) that `luminance` cannot read.
const inkIsLight = (t: Tokens): boolean => HEX6.test(t.ink) && luminance(t.ink) >= 0.5;

// How far a tint band travels from the surface toward the ink. Fraction of that whole range rather
// than a colour, so every theme gets a band of the same perceived strength and none of them can
// land on a ground its own ink cannot read. Calibrated against the bands the templates hand-picked
// before tones existed: press sits at 0.118 of its range, orchard at 0.084.
const TINT_MIX = 0.09;

// An unreadable stored value reads as the quietest tone rather than failing the section
const toneOf = (bg: SectionBackground): SectionTone =>
    bg.tone && SECTION_TONES.includes(bg.tone) ? bg.tone : "tint";

/** The ground a tone paints, derived from the theme so every theme yields a legible pair. */
export function toneGround(tone: SectionTone, t: Tokens): string {
    if (tone === "accent") return t.accent;
    if (tone === "contrast") return t.ink; // the inverted band: the page's own ink as a ground
    return mix(t.surface, t.ink, TINT_MIX);
}

// A tint keeps the page's own ink, but moving the ground toward that ink is contrast every tier
// BELOW ink loses, and `muted` runs near the AA-large floor in most themes: left alone it drops
// through. The tiers travel at twice the ground's rate because they do not start at the same
// distance from the ink; at 2x every shipped theme reads a caption on a tint band at least as well
// as the same caption on its page, which is the guarantee that makes a tone safe to pick blind.
const TINT_TIER_MIX = TINT_MIX * 2;
function onTint(t: Tokens): Tokens {
    const toward = (c: string): string => mix(c, t.ink, TINT_TIER_MIX);
    return { ...t, soft: toward(t.soft), muted: toward(t.muted), line: toward(t.line) };
}

// The content set that goes with a tone's ground. No luminance guessing: a tone's ground is built
// from the tokens, so which set reads on it is known from which token it was built from.
function toneTokens(tone: SectionTone, t: Tokens): Tokens {
    if (tone === "accent") return onAccentGround(t);
    // contrast grounds on `ink`, so a light theme's band is dark and a dark theme's band is light
    if (tone === "contrast") return inkIsLight(t) ? onLight(t) : onDark(t);
    return onTint(t);
}

// The one place the contrast swap is decided; composeSection calls it, and so do the callers that
// must match what it paints (the inline text editor, the live overlay).
export function sectionContentTokens(section: Section, theme: Tokens): Tokens {
    const bg = section.background;
    if (bg?.kind === "tone") return toneTokens(toneOf(bg), theme);
    if (bgIsDark(bg)) return onDark(theme);
    // The inverse case: an explicit light band under a dark theme keeps the theme's light ink and
    // the text vanishes into the band. Reached both when a preview re-themes stored content to the
    // viewer's app theme and when an author picks a light band colour while working in a dark theme.
    if (bgIsLight(bg) && inkIsLight(theme)) return onLight(theme);
    return theme;
}

// The engine subtree for an address exactly as the canvas composes it — token ramp, container
// restyling and the section's contrast swap included (pass the BASE theme; the swap applies here
// as it does in composeSection). Lay it out at the address's painted box to reproduce the pixels.
export function composedNodeFor(
    section: Section,
    address: ElementAddress,
    ctx: LayoutCtx,
): EngineNode | null {
    return nodeById(composeSection(section, ctx), elementRegionId(address));
}

/** The node carrying a region id, anywhere in a composed tree. */
export function nodeById(root: EngineNode, id: string): EngineNode | null {
    if (root.id === id) return root;
    for (const c of root.children ?? []) {
        const hit = nodeById(c, id);
        if (hit) return hit;
    }
    return null;
}

// the text leaf at an address; an overlay styled from the child's own spec would render at the
// wrong scale (a diagram cell shrinks its label to node size)
export function composedLeafFor(
    section: Section,
    address: ElementAddress,
    ctx: LayoutCtx,
): TextLeaf | null {
    return composedNodeFor(section, address, ctx)?.text ?? null;
}

export function composeSection(section: Section, ctx: LayoutCtx): EngineNode {
    const bg = section.background;
    const bleed = section.bleed ?? false;
    const continuous = ctx.format.kind === "continuous";
    const webBand = ctx.format.id === "web"; // full-bleed band, content stays in a centered column
    const innerMax = ctx.format.maxContentWidth ?? 1180;
    const contentTheme = sectionContentTokens(section, ctx.theme);
    // The section's own gutters scale here rather than in scaleTokens, because contentW is what
    // children size against (stacksAtWidth, rowShares): scaling padding afterwards would leave them
    // measured against a width the section no longer has. Autofit rides the same factor for the
    // same reason.
    const k = rampScale(ctx.format, ctx.availWidth) * (ctx.fitScale ?? 1);
    const sidePad = (bleed ? BLEED_PAD_X : SECTION_PAD) * k;
    const gutter = GUTTER * k;
    const outerW = ctx.availWidth - sidePad * 2;
    // exact for the top-level row; a nested row inherits it and stacks a step late, self-correcting
    const contentW = Math.max(0, (webBand ? Math.min(outerW, innerMax) : outerW) - gutter * 2);
    const cctx: LayoutCtx = { ...ctx, theme: contentTheme, availWidth: contentW };

    const content = scaleTokens(
        composeElement(section.root, cctx, { section: section.id, path: [] }),
        k,
    );
    const inner: EngineNode = {
        w: webBand ? grow(undefined, innerMax) : grow(),
        h: fit(),
        padding: pad(gutter),
        children: [content],
    };

    // continuous (doc/web) merges sections seamlessly → no card radius/border
    const radius = bleed || continuous ? 0 : ctx.theme.radius;
    // `frame.aspect` is the page shape a paged format cuts to. A continuous one has no page, so the
    // same field reads as a minimum band: a hero opens at 16:7 of the viewport and centres in it,
    // and content taller than the band still grows past it.
    const aspect = section.frame?.aspect;
    const band = continuous && aspect && aspect > 0 ? ctx.availWidth / aspect : 0;
    const node: EngineNode = {
        id: sectionRegionId(section.id),
        w: grow(),
        h: band ? fit(band) : fit(),
        alignY: band ? "center" : undefined,
        alignX: webBand ? "center" : undefined,
        padding: bleed
            ? { top: 64 * k, bottom: 64 * k, left: sidePad, right: sidePad }
            : pad(sidePad),
        // crop over-wide elements at the edge; height stays free for fit-growth + slide-fitting
        clip: { x: true },
        children: [inner],
    };
    // A docked child (layout.dock) is section chrome: hoisted out of the content flow so it anchors
    // to the band's own box, while the rest centres in the band without it.
    const docked = (content.children ?? []).filter(
        (c) => c.float?.y === "start" && c.float.z === 1,
    );
    if (docked.length) {
        content.children = (content.children ?? []).filter((c) => !docked.includes(c));
        node.children = [inner, ...docked];
    }

    // a tone's ground is a colour we derived, so reading it back is not the luminance guess about an
    // arbitrary hex that bgIsDark makes; it is the same token arithmetic answered a second time
    const toneFill = bg?.kind === "tone" ? toneGround(toneOf(bg), ctx.theme) : null;
    const darkGround = toneFill ? luminance(toneFill) < 0.5 : bgIsDark(bg);
    // border only on a light bg: over dark a hairline reads as an awkward frame
    const framed = !bleed && !continuous;
    const shadow = framed ? ctx.theme.shadow : undefined;
    const border =
        framed && !darkGround ? { color: ctx.theme.line, width: ctx.theme.border ?? 1 } : undefined;

    if (toneFill) {
        node.fill = { color: toneFill, radius, border, shadow };
    } else if (bg?.kind === "image" && bg.image) {
        node.image = {
            src: bg.image,
            fit: "cover",
            radius,
            scrim: bg.scrim ?? ctx.theme.scrim ?? 0.45,
            border,
            shadow,
        };
    } else if (bg?.kind === "gradient" && bg.gradient) {
        node.fill = { gradient: bg.gradient, radius, border, shadow };
    } else if (bg?.kind === "color" && bg.color) {
        node.fill = { color: bg.color, radius, border, shadow };
    } else {
        node.fill = continuous
            ? { color: ctx.theme.surface }
            : { color: ctx.theme.surface, radius, border, shadow };
    }
    return node;
}
