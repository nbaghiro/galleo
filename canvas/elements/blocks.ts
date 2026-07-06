import type { ElementSpec, LayoutCtx } from "@elements/spec";
import type { EngineNode } from "@engine/node";
import type { ElementInstance } from "@model/artifact";
import {
    getElement,
    register,
    bar,
    pill,
    dot,
    GHOST,
    GHOST_PANEL,
    GHOST_LINE,
} from "@elements/spec";
import { fit, fixed, grow } from "@model/geometry";
import { mix } from "@themes/theme";

// Composite blocks — pre-structured elements built from real `text`/`icon`/`avatar`/`bullets`/`button`
// children (each individually selectable + editable), following the `stat`/`quote` pattern. They arrange
// their children by position; `container` exposes them for compose recursion + content ops. Category is
// `container` so they sit in the (relabeled) Composite rail alongside card/group. Each ships a
// hand-crafted `skeleton` (the ghost shown as the live drop preview when added to the canvas).

interface CompositeData {
    children: ElementInstance[];
}

// --- child-instance builders (author the default content) ---
const t = (text: string, style: string, align?: "start" | "center"): ElementInstance => ({
    type: "text",
    data: align ? { text, style, align } : { text, style },
});
const avatar = (size: number): ElementInstance => ({ type: "avatar", data: { size } });
const button = (label: string): ElementInstance => ({ type: "button", data: { label } });
const checklist = (...items: string[]): ElementInstance => ({
    type: "bullets",
    data: { children: items.map((i) => t(i, "body")), marker: "check" },
});

// Compose each child instance to its render node (recurses through nested containers via their layout).
const composeKids = (children: ElementInstance[], ctx: LayoutCtx): EngineNode[] =>
    children.map((inst): EngineNode => {
        const spec = getElement(inst.type);
        return spec ? spec.layout(inst.data, ctx) : { w: grow(), h: fit(10) };
    });

// Child at index i, or an empty node if the user has deleted it (keeps arrange index-safe).
const at = (kids: EngineNode[], i: number): EngineNode => kids[i] ?? { w: grow(), h: fit() };

const pad = (n: number): { top: number; right: number; bottom: number; left: number } => ({
    top: n,
    right: n,
    bottom: n,
    left: n,
});
// A ghost text bar of a fixed width (for skeletons where percent-width can't resolve).
const gbar = (w: number, h: number): EngineNode => ({
    w: fixed(w),
    h: fixed(h),
    fill: { color: GHOST, radius: Math.min(4, h / 2) },
});

// Build a composite spec from an arrange fn + default children (+ an optional hand-crafted skeleton).
function composite(
    type: string,
    label: string,
    create: () => CompositeData,
    arrange: (d: CompositeData, ctx: LayoutCtx, kids: EngineNode[]) => EngineNode,
    skeleton?: (ctx: LayoutCtx) => EngineNode,
): ElementSpec<CompositeData> {
    return {
        type,
        label,
        category: "container",
        tier: "smart",
        create,
        layout: (d, ctx) => arrange(d, ctx, composeKids(d.children, ctx)),
        container: {
            children: (d) => d.children,
            arrange,
            withChildren: (d, children) => ({ ...d, children }),
        },
        controls: [],
        ...(skeleton ? { skeleton } : {}),
    };
}

// --- feature: icon + heading + body, stacked ---
export const featureElement = composite(
    "feature",
    "Feature",
    () => ({
        children: [
            t("⚡", "h1"),
            t("Fast by default", "h3"),
            t("Sub-second layout keeps editing fluid at any size.", "body"),
        ],
    }),
    (_d, _ctx, kids) => ({ w: grow(), h: fit(), direction: "col", gap: 10, children: kids }),
    (): EngineNode => ({
        w: grow(),
        h: fit(),
        direction: "col",
        gap: 10,
        children: [dot(40), bar(0.6, 13), bar(1, 8), bar(0.85, 8)],
    }),
);
register(featureElement);

// --- profile: avatar + name + role, centered (a team member) ---
export const profileElement = composite(
    "profile",
    "Profile",
    () => ({
        children: [
            avatar(72),
            t("Ada Lovelace", "h3", "center"),
            t("Founder & CEO", "caption", "center"),
        ],
    }),
    (_d, _ctx, kids) => ({
        w: fit(),
        h: fit(),
        direction: "col",
        gap: 8,
        alignX: "center",
        children: kids,
    }),
    (): EngineNode => ({
        w: fit(),
        h: fit(),
        direction: "col",
        gap: 8,
        alignX: "center",
        children: [dot(72), gbar(110, 12), gbar(78, 8)],
    }),
);
register(profileElement);

// --- testimonial: quote, then avatar + name/role row ---
export const testimonialElement = composite(
    "testimonial",
    "Testimonial",
    () => ({
        children: [
            t(
                "Galleo replaced three tools and made our deck, doc, and site one source of truth.",
                "quote",
            ),
            avatar(52),
            t("Grace Hopper", "body"),
            t("VP Design, Northwind", "caption"),
        ],
    }),
    (_d, _ctx, kids) => ({
        w: grow(),
        h: fit(),
        direction: "col",
        gap: 16,
        children: [
            at(kids, 0),
            {
                w: fit(),
                h: fit(),
                direction: "row",
                gap: 12,
                alignY: "center",
                children: [
                    at(kids, 1),
                    {
                        w: fit(),
                        h: fit(),
                        direction: "col",
                        gap: 2,
                        children: [at(kids, 2), at(kids, 3)],
                    },
                ],
            },
        ],
    }),
    (): EngineNode => ({
        w: grow(),
        h: fit(),
        direction: "col",
        gap: 14,
        children: [
            bar(1, 9),
            bar(0.9, 9),
            {
                w: fit(),
                h: fit(),
                direction: "row",
                gap: 12,
                alignY: "center",
                children: [
                    dot(48),
                    {
                        w: fit(),
                        h: fit(),
                        direction: "col",
                        gap: 5,
                        children: [gbar(100, 9), gbar(70, 7)],
                    },
                ],
            },
        ],
    }),
);
register(testimonialElement);

// --- pricing: plan · price · features · button, in a bordered box ---
export const pricingElement = composite(
    "pricing",
    "Pricing",
    () => ({
        children: [
            t("STARTER", "label"),
            t("$0", "h1"),
            checklist("1 workspace", "5 artifacts", "PNG export"),
            button("Choose plan"),
        ],
    }),
    (_d, ctx, kids) => ({
        w: grow(),
        h: fit(),
        direction: "col",
        gap: 14,
        padding: pad(24),
        fill: {
            color: ctx.theme.surface,
            radius: ctx.theme.radius,
            border: { color: ctx.theme.line, width: 1 },
        },
        children: kids,
    }),
    (): EngineNode => ({
        w: grow(),
        h: fit(),
        direction: "col",
        gap: 12,
        padding: pad(20),
        fill: { color: GHOST_PANEL, radius: 12, border: { color: GHOST_LINE, width: 1 } },
        children: [
            bar(0.3, 8),
            bar(0.45, 20),
            bar(0.9, 8),
            bar(0.85, 8),
            bar(0.7, 8),
            pill(0.55, 30),
        ],
    }),
);
register(pricingElement);

// --- cta: heading + subtext + button, centered on a tinted band ---
export const ctaElement = composite(
    "cta",
    "Call to action",
    () => ({
        children: [
            t("Ship your first artifact today", "h2", "center"),
            t("One canvas for decks, docs, and sites.", "body", "center"),
            button("Get started"),
        ],
    }),
    (_d, ctx, kids) => ({
        w: grow(),
        h: fit(),
        direction: "col",
        gap: 12,
        alignX: "center",
        padding: pad(32),
        fill: { color: mix(ctx.theme.surface, ctx.theme.accent, 0.08), radius: ctx.theme.radius },
        children: kids,
    }),
    (): EngineNode => ({
        w: grow(),
        h: fit(),
        direction: "col",
        gap: 10,
        alignX: "center",
        padding: pad(26),
        fill: { color: GHOST_PANEL, radius: 12 },
        children: [bar(0.7, 12), bar(0.5, 8), pill(0.35, 30)],
    }),
);
register(ctaElement);

// --- faq: a list of question + answer pairs (all shown; correct for deck/doc/site + print) ---
export const faqElement = composite(
    "faq",
    "FAQ",
    () => ({
        children: [
            t("What is Galleo?", "h3"),
            t("One canvas that renders as a deck, a doc, or a site — authored once.", "body"),
            t("Can I export?", "h3"),
            t("Yes — PDF, PNG, and print, pixel-for-pixel with what you edit.", "body"),
            t("Is it themeable?", "h3"),
            t("Themes are data; switching one repaints every block instantly.", "body"),
        ],
    }),
    (_d, _ctx, kids) => {
        const pairs: EngineNode[] = [];
        for (let i = 0; i < kids.length; i += 2) {
            pairs.push({
                w: grow(),
                h: fit(),
                direction: "col",
                gap: 4,
                children: [at(kids, i), at(kids, i + 1)],
            });
        }
        return { w: grow(), h: fit(), direction: "col", gap: 16, children: pairs };
    },
    (): EngineNode => ({
        w: grow(),
        h: fit(),
        direction: "col",
        gap: 16,
        children: [
            {
                w: grow(),
                h: fit(),
                direction: "col",
                gap: 4,
                children: [bar(0.5, 10), bar(1, 7), bar(0.8, 7)],
            },
            {
                w: grow(),
                h: fit(),
                direction: "col",
                gap: 4,
                children: [bar(0.45, 10), bar(1, 7), bar(0.7, 7)],
            },
        ],
    }),
);
register(faqElement);
