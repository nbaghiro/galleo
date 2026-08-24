import type { ElementSpec, LayoutCtx } from "@elements/spec";
import type { DrawContext, EngineNode, Rect } from "@engine/node";
import type { ElementInstance } from "@model/artifact";
import type { FaqCollapse } from "@model/elements";
import { getElement, register } from "@elements/spec";
import { hitRegionId, parseTarget } from "@model/artifact";
import { FAQ_COLLAPSE } from "@model/elements";
import { fit, fixed, grow } from "@model/geometry";
import { t, at } from "@elements/composite/shared";

interface FaqData {
    children: ElementInstance[]; // question, answer, question, answer, …
    collapse?: FaqCollapse;
}

const CHEVRON = 16;

const chevron =
    (color: string, open: boolean) =>
    (g: DrawContext, box: Rect): void => {
        const s = Math.min(box.w, box.h);
        const cx = box.x + box.w / 2;
        const cy = box.y + box.h / 2;
        const dx = s * 0.26;
        const dy = s * 0.14;
        const k = open ? -1 : 1;
        g.polyline(
            [
                [cx - dx, cy - dy * k],
                [cx, cy + dy * k],
                [cx + dx, cy - dy * k],
            ],
            { stroke: color, width: Math.max(1.25, s * 0.11), cap: "round", join: "round" },
        );
    };

const isOpen = (inst: ElementInstance | undefined): boolean =>
    (inst?.data as { open?: unknown } | undefined)?.open === true;

const pair = (children: EngineNode[]): EngineNode => ({
    w: grow(),
    h: fit(),
    direction: "col",
    gap: 4,
    children,
});

// The whole question row is the affordance: a reader presses the line, not a 16px glyph. In the
// editor a selectable region inside it still wins the press (see `affordanceAt` in editor/Canvas),
// so the question text stays editable.
function questionRow(question: EngineNode, open: boolean, ctx: LayoutCtx): EngineNode {
    return {
        w: grow(),
        h: fit(),
        direction: "row",
        gap: 12,
        alignY: "center",
        children: [
            question,
            {
                w: fixed(CHEVRON),
                h: fixed(CHEVRON),
                surface: { paint: chevron(ctx.theme.muted, open) },
            },
        ],
    };
}

function arrangeFaq(d: FaqData, ctx: LayoutCtx, kids: EngineNode[]): EngineNode {
    const collapsible = d.collapse === "collapsible";
    const pairs: EngineNode[] = [];
    for (let i = 0; i < kids.length; i += 2) {
        const question = at(kids, i);
        const answer = at(kids, i + 1);
        if (!collapsible) {
            pairs.push(pair([question, answer]));
            continue;
        }
        const open = isOpen(d.children[i + 1]);
        const row = questionRow(question, open, ctx);
        // addressed at the answer, whose `open` carries the state
        const target = parseTarget(answer.id ?? "");
        if (target?.kind === "element") row.id = hitRegionId("disclose", target.address);
        pairs.push(pair(open ? [row, answer] : [row]));
    }
    return { w: grow(), h: fit(), direction: "col", gap: 16, children: pairs };
}

const composeKids = (d: FaqData, ctx: LayoutCtx): EngineNode[] =>
    d.children.map((inst): EngineNode => {
        const spec = getElement(inst.type);
        return spec ? spec.layout(inst.data, ctx) : { w: grow(), h: fit(10) };
    });

const COLLAPSE_LABELS: Record<FaqCollapse, string> = {
    expanded: "All open",
    collapsible: "Accordion",
};

export const faqElement: ElementSpec<FaqData> = {
    type: "faq",
    label: "FAQ",
    category: "composite",
    tier: "unit",
    create: () => ({
        children: [
            t("What is Galleo?", "h3"),
            t("One canvas that renders as a deck, a doc, or a site, authored once.", "body"),
            t("Can I export?", "h3"),
            t("Yes: PDF, PNG, and print, pixel-for-pixel with what you edit.", "body"),
            t("Is it themeable?", "h3"),
            t("Themes are data; switching one repaints every block instantly.", "body"),
        ],
    }),
    layout: (d, ctx) => arrangeFaq(d, ctx, composeKids(d, ctx)),
    container: {
        children: (d) => d.children,
        arrange: arrangeFaq,
        withChildren: (d, children) => ({ ...d, children }),
        // a smart block is a unit: its children edit in place, and the block moves whole
        closed: true,
    },
    bar: ["collapse"],
    controls: [
        {
            key: "collapse",
            label: "Answers",
            control: "segmented",
            options: FAQ_COLLAPSE.map((v) => ({ value: v, label: COLLAPSE_LABELS[v] })),
        },
    ],
};
register(faqElement);
