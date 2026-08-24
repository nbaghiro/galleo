import type { ElementInstance } from "@model/artifact";
import type { RenderCommand } from "@engine/node";
import type { MotionTokens } from "@themes";
import { parseTarget } from "@model/artifact";
import { getElement } from "@elements/spec";
import { prefersReducedMotion } from "./viewport";

// Opacity and transform only, never geometry: that is what keeps every static render identical
// whatever the theme's motion says.

// Generic over the node so the pairing math is testable with plain stand-ins; every runtime
// caller passes real elements and N infers to HTMLElement.
export interface BuildGroup<N = HTMLElement> {
    path: number[]; // the element that arrives as one piece
    nodes: N[];
}

const BUILD_TAIL_MS = 700;
const SETTLE_PX = 10;
const RISE_PX = 26;
const PUSH_PCT = 6;

const samePrefix = (unit: number[], path: number[]): boolean =>
    unit.length <= path.length && unit.every((v, i) => v === path[i]);

/**
 * The elements that arrive one at a time. A bare layout container is descended into, so two cards
 * in a row arrive separately; anything that paints something of its own is a piece, so a card
 * arrives with its contents rather than assembling itself.
 */
export function buildUnits(root: ElementInstance, paints: ReadonlySet<string>): number[][] {
    const units: number[][] = [];
    const walk = (inst: ElementInstance, path: number[]): void => {
        const spec = getElement(inst.type);
        const kids = spec?.tier === "container" ? (spec.container?.children(inst.data) ?? []) : [];
        if (!kids.length || paints.has(path.join("."))) {
            units.push(path);
            return;
        }
        kids.forEach((kid, i) => walk(kid, [...path, i]));
    };
    walk(root, []);
    return units;
}

/**
 * Each unit with the nodes that paint it, in document order. A command carrying no id belongs to
 * whatever was addressed most recently: `emit` walks depth-first, so that is its own element.
 */
export function buildGroups<N>(
    root: ElementInstance,
    commands: RenderCommand[],
    nodes: N[],
): BuildGroup<N>[] {
    const paints = new Set<string>();
    for (const c of commands) {
        const t = c.id ? parseTarget(c.id) : null;
        if (t?.kind === "element") paints.add(t.address.path.join("."));
    }
    const units = buildUnits(root, paints);
    const groups = new Map<string, BuildGroup<N>>();
    let current = "";
    commands.forEach((command, i) => {
        const node = nodes[i];
        if (!node) return;
        const target = command.id ? parseTarget(command.id) : null;
        if (target?.kind === "section") {
            current = ""; // the section's ground is there before its content
            return;
        }
        if (target?.kind === "element") {
            const unit = units.find((u) => samePrefix(u, target.address.path));
            current = unit ? `u${unit.join(".")}` : "";
            if (unit && !groups.has(current)) groups.set(current, { path: unit, nodes: [] });
        }
        const group = groups.get(current);
        if (group) group.nodes.push(node);
    });
    return [...groups.values()];
}

export function staggerMs(m: MotionTokens, count: number): number {
    return Math.min(m.duration * 0.4, BUILD_TAIL_MS / Math.max(1, count - 1));
}

export function buildFrames(m: MotionTokens): Keyframe[] {
    if (m.build === "none") return [];
    const dy = m.build === "rise" ? RISE_PX : SETTLE_PX;
    return [
        { opacity: 0, transform: `translateY(${dy}px)` },
        { opacity: 1, transform: "none" },
    ];
}

export function transitionFrames(
    m: MotionTokens,
    dir: 1 | -1,
): { out: Keyframe[]; in: Keyframe[] } {
    if (m.transition === "cut") return { out: [], in: [] };
    if (m.transition === "fade")
        return { out: [{ opacity: 1 }, { opacity: 0 }], in: [{ opacity: 0 }, { opacity: 1 }] };
    const away = `translateX(${-dir * PUSH_PCT}%)`;
    const from = `translateX(${dir * PUSH_PCT}%)`;
    return {
        out: [
            { opacity: 1, transform: "none" },
            { opacity: 0, transform: away },
        ],
        in: [
            { opacity: 0, transform: from },
            { opacity: 1, transform: "none" },
        ],
    };
}

const run = (el: HTMLElement, frames: Keyframe[], options: KeyframeAnimationOptions): Animation =>
    el.animate(frames, { fill: "both", ...options });

/** Resolves once the incoming slide has arrived, so the caller can drop the outgoing one. */
export function runTransition(
    outgoing: HTMLElement | null,
    incoming: HTMLElement,
    m: MotionTokens,
    dir: 1 | -1,
): Promise<void> {
    const frames = transitionFrames(m, dir);
    if (prefersReducedMotion() || !frames.in.length) return Promise.resolve();
    const timing = { duration: m.duration, easing: m.easing };
    if (outgoing) run(outgoing, frames.out, timing);
    return run(incoming, frames.in, timing).finished.then(
        () => undefined,
        () => undefined, // a cancelled transition is a newer one taking over, not a failure
    );
}

export function runBuild(groups: BuildGroup[], m: MotionTokens): void {
    const frames = buildFrames(m);
    if (prefersReducedMotion() || !frames.length || !groups.length) return;
    const step = staggerMs(m, groups.length);
    groups.forEach((group, i) => {
        for (const node of group.nodes)
            run(node, frames, { duration: m.duration, easing: m.easing, delay: i * step });
    });
}
