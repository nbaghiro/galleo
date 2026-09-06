import type { ElementInstance } from "@model/artifact";
import type { Rect, Region, RenderCommand } from "@engine/node";
import type { MotionTokens } from "@themes";
import { parseDatumRegion, parseTarget } from "@model/artifact";
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

// past this a stagger reads as a stall, and a dense scatter is not a story told point by point
const DRAWON_MAX = 40;

/**
 * One surface that draws on: its node, its command box, and its datum regions in paint order
 * (all in the command's coordinate space). A surface with fewer than two datums, a rotated one
 * (its regions were rotated into stage space, so the local subtraction no longer holds), or one
 * whose ancestor clip already owns the clip slot, stays with the block build.
 */
export interface DrawOnPlan<N = HTMLElement> {
    node: N;
    box: Rect;
    datums: Region[];
}

export function drawOnPlans<N>(
    commands: RenderCommand[],
    nodes: N[],
    regions: Region[],
): DrawOnPlan<N>[] {
    const byElement = new Map<string, Region[]>();
    for (const r of regions) {
        const d = parseDatumRegion(r.id);
        if (!d) continue;
        const list = byElement.get(d.element) ?? [];
        list.push(r);
        byElement.set(d.element, list);
    }
    if (!byElement.size) return [];
    const out: DrawOnPlan<N>[] = [];
    const claimed = new Set<string>();
    let current = "";
    commands.forEach((c, i) => {
        const t = c.id ? parseTarget(c.id) : null;
        if (t) current = t.kind === "element" ? c.id! : "";
        if (c.kind !== "surface" || !current || claimed.has(current)) return;
        claimed.add(current);
        const node = nodes[i];
        const datums = byElement.get(current) ?? [];
        if (!node || datums.length < 2 || datums.length > DRAWON_MAX || c.rotate || c.clip) return;
        out.push({ node, box: c.box, datums });
    });
    return out;
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

const SVG_NS = "http://www.w3.org/2000/svg";
const DRAWON_TAIL_MS = 700;
let drawOnSeq = 0;

// a datum's outline as one path, in the surface's own coordinates (also a punch hole subpath)
function regionPath(r: Region, dx: number, dy: number): string {
    if (r.shape) return `M${r.shape.points.map(([px, py]) => `${px - dx} ${py - dy}`).join("L")}Z`;
    const { w, h } = r.box;
    const x = r.box.x - dx;
    const y = r.box.y - dy;
    const c = Math.max(0, Math.min(r.radius ?? 0, w / 2, h / 2));
    if (!c) return `M${x} ${y}H${x + w}V${y + h}H${x}Z`;
    const a = (ex: number, ey: number): string => `A${c} ${c} 0 0 1 ${ex} ${ey}`;
    return (
        `M${x + c} ${y}H${x + w - c}${a(x + w, y + c)}V${y + h - c}${a(x + w - c, y + h)}` +
        `H${x + c}${a(x, y + h - c)}V${y + c}${a(x + c, y)}Z`
    );
}

const clipDef = (id: string, d: string, evenodd = false): SVGElement => {
    const clip = document.createElementNS(SVG_NS, "clipPath");
    clip.setAttribute("id", id);
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", d);
    if (evenodd) path.setAttribute("clip-rule", "evenodd");
    clip.appendChild(path);
    return clip;
};

// The chrome arrives with the node's own block build while a static evenodd clip veils the
// datums; each datum then lands as a clone clipped to its own shape, animated with the same
// frames the build uses. Opacity and transform are the only animated properties; the punch is
// set once and always cleared, cancelled choreography included, so the pristine paint survives.
function runDrawOn(plan: DrawOnPlan, m: MotionTokens, delay: number): void {
    const el = plan.node;
    const art = el.querySelector("svg");
    if (!art) return;
    const uid = ++drawOnSeq;
    const { x, y, w, h } = plan.box;
    const defs = document.createElementNS(SVG_NS, "svg");
    defs.setAttribute("width", "0");
    defs.setAttribute("height", "0");
    defs.style.position = "absolute";
    const holes = plan.datums.map((d) => regionPath(d, x, y)).join("");
    defs.appendChild(clipDef(`don-p-${uid}`, `M0 0H${w}V${h}H0Z${holes}`, true));
    const frames = buildFrames(m);
    const step = Math.min(m.duration * 0.35, DRAWON_TAIL_MS / Math.max(1, plan.datums.length - 1));
    const transient: Element[] = [defs];
    const anims = plan.datums.map((d, j) => {
        defs.appendChild(clipDef(`don-${uid}-${j}`, regionPath(d, x, y)));
        const wrap = document.createElement("div");
        wrap.style.cssText = `position:absolute;inset:0;clip-path:url(#don-${uid}-${j})`;
        wrap.appendChild(art.cloneNode(true));
        el.appendChild(wrap);
        transient.push(wrap);
        return run(wrap, frames, {
            duration: m.duration,
            easing: m.easing,
            delay: delay + m.duration / 2 + j * step,
        });
    });
    el.appendChild(defs);
    el.style.clipPath = `url(#don-p-${uid})`;
    void Promise.allSettled(anims.map((a) => a.finished)).then(() => {
        el.style.clipPath = "";
        for (const t of transient) t.remove();
    });
}

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

export function runBuild(groups: BuildGroup[], m: MotionTokens, plans: DrawOnPlan[] = []): void {
    const frames = buildFrames(m);
    if (prefersReducedMotion() || !frames.length || !groups.length) return;
    const step = staggerMs(m, groups.length);
    groups.forEach((group, i) => {
        for (const node of group.nodes)
            run(node, frames, { duration: m.duration, easing: m.easing, delay: i * step });
        for (const plan of plans) if (group.nodes.includes(plan.node)) runDrawOn(plan, m, i * step);
    });
}
