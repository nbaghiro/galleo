import type { EngineNode } from "@engine/node";
import type { LayoutCtx } from "@elements/spec";
import { fixed, grow } from "@model/geometry";
import {
    buildTree,
    cellChrome,
    cellHeights,
    clamp,
    decorate,
    diagramCell,
    drawLink,
    itemColors,
    layoutTree,
    markScale,
    maxLabelWidth,
    nodePaint,
    registerDiagram,
    type Placed,
    type ResolvedDiagram,
    type TreeDatum,
} from "./utils";

const MIN_H = 34;
const MAX_H = 60;

interface Spot {
    label: string;
    cx: number;
    cy: number;
    parent?: string;
}

const branch = (root: TreeDatum, children: TreeDatum[]): TreeDatum => ({
    label: root.label,
    body: root.body,
    children,
});

const rootOf = (placed: Placed[]): number => placed.find((p) => p.node.depth === 0)?.cx ?? 0;

// the same hierarchy as `org`, but the root sits in the middle and its branches split both ways
function arrange(
    diagram: ResolvedDiagram,
    ctx: LayoutCtx,
    kids: EngineNode[],
    height: number,
): EngineNode {
    const data = buildTree(diagram);
    if (!data) return { w: grow(), h: fixed(height) };
    const cols = itemColors(diagram, ctx.theme);
    const byLabel = new Map(diagram.items.map((it, i) => [it.label, i] as const));
    const W = ctx.availWidth;
    const ms = markScale(height);
    const iconed = diagram.items.some((it) => it.icon);
    const chrome = cellChrome(undefined, MAX_H, iconed ? "icon" : undefined);
    const nodeW = clamp(maxLabelWidth(ctx, diagram.items) + chrome + 6, 88, Math.max(88, W / 4));
    const needs = diagram.items.map((it) =>
        cellHeights(ctx, it, nodeW - cellChrome(undefined, MAX_H, it.icon)),
    );
    const nodeH = clamp(Math.max(MIN_H, ...needs.map((m) => m.label)), MIN_H * ms, MAX_H * ms);

    const half = Math.ceil(data.children.length / 2);
    const sideW = Math.max(1, W / 2);
    const right = layoutTree(
        branch(data, data.children.slice(0, half)),
        sideW,
        height,
        nodeW,
        nodeH,
        true,
    );
    const left = layoutTree(
        branch(data, data.children.slice(half)),
        sideW,
        height,
        nodeW,
        nodeH,
        true,
    );
    const rx = rootOf(right.placed);
    const lx = rootOf(left.placed);

    const spots: Spot[] = [];
    const collect = (placed: Placed[], mapX: (x: number) => number, skipRoot: boolean): void => {
        for (const p of placed) {
            if (skipRoot && p.node.depth === 0) continue;
            spots.push({
                label: p.node.data.label,
                cx: mapX(p.cx),
                cy: p.cy,
                parent: p.node.parent?.data.label,
            });
        }
    };
    collect(right.placed, (x) => x + (W / 2 - rx), false);
    collect(left.placed, (x) => W / 2 - (x - lx), true);

    const at = new Map(spots.map((s) => [s.label, s] as const));
    // A branch is one idea, so it carries one colour down its whole length; colouring by item index
    // said "these six things descend in importance", which a map does not claim.
    const branchOf = new Map<string, number>();
    data.children.forEach((child, b) => {
        const walk = (t: TreeDatum): void => {
            branchOf.set(t.label, b);
            t.children.forEach(walk);
        };
        walk(child);
    });
    const tone = (label: string): string => {
        const b = branchOf.get(label);
        if (b === undefined) return cols[0] ?? ctx.theme.accent;
        const i = byLabel.get(data.children[b]!.label);
        return (i !== undefined ? cols[i] : undefined) ?? cols[0] ?? ctx.theme.accent;
    };
    const cells = spots.map((s) => {
        const i = byLabel.get(s.label);
        const item = i !== undefined ? diagram.items[i] : undefined;
        const detail = i !== undefined && (needs[i]?.full ?? 0) <= nodeH + 0.5;
        const cell = diagramCell(
            i !== undefined ? kids[i * 2] : undefined,
            detail ? kids[i! * 2 + 1] : undefined,
            nodePaint(s.parent ? tone(s.label) : ctx.theme.accent, ctx.theme, {
                style: diagram.options.style,
                emphasis: !s.parent || item?.emphasis,
            }),
            { icon: item?.icon },
        );
        cell.w = fixed(nodeW);
        cell.h = fixed(nodeH);
        cell.float = { x: "start", y: "start", dx: s.cx - nodeW / 2, dy: s.cy - nodeH / 2, z: 1 };
        return cell;
    });

    return {
        w: grow(),
        h: fixed(height),
        children: [
            ...cells,
            decorate((g) => {
                for (const s of spots) {
                    const p = s.parent ? at.get(s.parent) : undefined;
                    if (!p) continue;
                    const rightward = s.cx >= p.cx;
                    const x0 = p.cx + (rightward ? nodeW / 2 : -nodeW / 2);
                    const x1 = s.cx + (rightward ? -nodeW / 2 : nodeW / 2);
                    const mid = (x0 + x1) / 2;
                    drawLink(
                        g,
                        [
                            [x0, p.cy],
                            [mid, p.cy],
                            [mid, s.cy],
                            [x1, s.cy],
                        ],
                        ctx.theme,
                        // a branch, not a wiring run: the elbow is the wrong idiom here
                        // the branch's own colour, so the eye can follow one idea out from the root
                        { color: tone(s.label), width: 2 * ms, head: false, curve: "h" },
                    );
                }
            }),
        ],
    };
}

registerDiagram({ id: "mindmap", label: "Mind map", arrange, fill: "ground" });
