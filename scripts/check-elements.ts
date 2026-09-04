// Element drift guard: the three registries that must name the same world.
//
// 1. The chart registry's ids must equal the CHART_TYPES value-set (mirrors the vitest guard).
// 2. The diagram registry's ids must equal the DIAGRAM_TYPES value-set (ditto).
// 3. Every element type the AI catalog can emit must be a registered element spec, or generation
//    produces content the canvas renders as the unknown-type error box.
// 4. AGENTS.md's palette tally must match the registry. A hardcoded count rots by the week (composite
//    went 8 to 9 the day this was written), and the tally is the first thing a contributor reads to
//    judge whether the library already covers what they are about to add.
// 5. Every element's default instance lays out AND stays visible: composed into a section, it must
//    emit at least one command, and no text it emits may be erased by a zero-area box or a clip that
//    leaves nothing showing. "Renders" without this was only "does not throw": the comparison element
//    shipped for months painting its cards at height zero, every word clipped away, and nothing said so.
//
// Lives in scripts/ because it deliberately crosses the layer law (services catalog + canvas
// registry in one process); scripts sit outside the law. Run: pnpm check:elements

import { readFileSync } from "node:fs";
import "@elements/register";
import { listElements } from "@elements/spec";
import { chartTypeOptions } from "@elements/chart/render";
import { diagramTypeOptions } from "@elements/diagram/render";
import { CHART_TYPES, DIAGRAM_TYPES } from "@model/elements";
import { ELEMENTS } from "@services/core/ai/prompts/catalog";
import { layoutSection, layoutRuns, leafForRuns } from "@canvas/render/commands";
import type { MeasureText, RenderCommand } from "@engine/node";
import type { Section } from "@model/artifact";

const w = (s: string): boolean => process.stdout.write(`${s}\n`);

let failed = false;
const fail = (msg: string): void => {
    failed = true;
    w(`FAIL ${msg}`);
};

function assertSetsEqual(label: string, actual: string[], expected: readonly string[]): void {
    const a = [...actual].sort();
    const e = [...expected].sort();
    const missing = e.filter((x) => !a.includes(x));
    const extra = a.filter((x) => !e.includes(x));
    if (missing.length || extra.length) {
        fail(
            `${label}: registry and value-set disagree` +
                (missing.length ? `; missing from registry: ${missing.join(", ")}` : "") +
                (extra.length ? `; not in value-set: ${extra.join(", ")}` : ""),
        );
    } else {
        w(`ok   ${label} (${a.length} types)`);
    }
}

assertSetsEqual(
    "chart registry == CHART_TYPES",
    chartTypeOptions().map((o) => o.value),
    CHART_TYPES,
);
assertSetsEqual(
    "diagram registry == DIAGRAM_TYPES",
    diagramTypeOptions().map((o) => o.value),
    DIAGRAM_TYPES,
);

const registered = new Set(listElements().map((s) => s.type));
const unregistered = ELEMENTS.map((e) => e.type).filter((t) => !registered.has(t));
if (unregistered.length) {
    fail(`AI catalog emits unregistered element types: ${unregistered.join(", ")}`);
} else {
    w(`ok   AI catalog types all registered (${ELEMENTS.length} entries)`);
}

// Palette-hidden: `avatar` and the two storage elements the chart/diagram variants live behind.
const HIDDEN = new Set(["avatar", "chart", "diagram", "media"]);
const AGENTS = "AGENTS.md";

const palette = listElements().filter((s) => !HIDDEN.has(s.type));
const byCategory = new Map<string, number>();
for (const s of palette) byCategory.set(s.category, (byCategory.get(s.category) ?? 0) + 1);

/** What the tally in `doc` gets wrong about `total`/`cats`; empty means it is right. */
function tallyDrift(doc: string, total: number, cats: Map<string, number>): string[] | null {
    const stated = doc.match(/\*\*(\d+) palette elements\*\*/)?.[1];
    const breakdown = doc.match(/\(([^)]*?\d+ diagram)\)/)?.[1];
    if (stated === undefined || breakdown === undefined) return null; // the sentence itself is gone
    const wrong: string[] = [];
    if (Number(stated) !== total) wrong.push(`total: says ${stated}, registry has ${total}`);
    for (const [cat, n] of [...cats].sort()) {
        const said = breakdown.match(new RegExp(`(\\d+) ${cat}\\b`))?.[1];
        if (said === undefined) wrong.push(`${cat}: not in the breakdown (registry has ${n})`);
        else if (Number(said) !== n) wrong.push(`${cat}: says ${said}, registry has ${n}`);
    }
    return wrong;
}

const doc = readFileSync(AGENTS, "utf8");

// Self-check against a synthetic doc rather than the real one, so it proves the comparison is live
// without depending on what AGENTS.md happens to say. Planting `palette.length + 1` against the real
// doc reported "the check is dead" whenever the tally was merely stale by one, which is the state a
// removed element leaves behind.
const PROBE_DOC = "**1 palette elements** (1 basic · 1 diagram)";
if (!tallyDrift(PROBE_DOC, 99, new Map([["basic", 99]]))?.length) {
    w(`FAIL self-check: a planted tally drift was NOT reported; the check in this script is dead`);
    process.exit(1);
}

const drift = tallyDrift(doc, palette.length, byCategory);
if (drift === null) {
    fail(`${AGENTS}: no "**N palette elements**" tally to check — did the sentence get reworded?`);
} else if (drift.length) {
    fail(`${AGENTS} palette tally is stale — ${drift.join("; ")}`);
    w(`     update the "**N palette elements**" sentence in ${AGENTS}`);
} else {
    const shape = [...byCategory]
        .sort()
        .map(([c, n]) => `${n} ${c}`)
        .join(" · ");
    w(`ok   ${AGENTS} palette tally (${palette.length}: ${shape})`);
}

// Deterministic glyph metrics (8px/char), the same substitution the engine tests make: line boxes
// and offsets are genuine, only advance widths are fake, so geometry findings are real. layoutRuns
// only ever assigns `font` and calls `measureText`, so the fake carries exactly that surface.
const fakeMetrics: Pick<CanvasRenderingContext2D, "font" | "measureText"> = {
    font: "",
    measureText: (t: string) => ({ width: t.length * 8 }) as TextMetrics,
};
const metricsCtx = fakeMetrics as CanvasRenderingContext2D;
const measure: MeasureText = (leaf, maxW) => {
    const laid = layoutRuns(metricsCtx, leafForRuns(leaf), maxW);
    return { width: laid.width, height: laid.height, lines: laid.lines };
};

/** Text commands nothing will ever show: a zero-area box, or a clip leaving under a pixel of it. */
function erasedText(commands: RenderCommand[]): string[] {
    const out: string[] = [];
    for (const c of commands) {
        if (c.kind !== "text") continue;
        let vw = c.box.w;
        let vh = c.box.h;
        if (c.clip) {
            vw = Math.min(c.box.x + c.box.w, c.clip.x + c.clip.w) - Math.max(c.box.x, c.clip.x);
            vh = Math.min(c.box.y + c.box.h, c.clip.y + c.clip.h) - Math.max(c.box.y, c.clip.y);
        }
        if (vw < 1 || vh < 1) out.push(c.id ?? "(unnamed)");
    }
    return out;
}

// Self-check: a planted fully-clipped text must be reported, or the detector below is dead.
const PLANT: RenderCommand[] = [
    {
        kind: "text",
        id: "planted",
        box: { x: 0, y: 20, w: 100, h: 30 },
        clip: { x: 0, y: 0, w: 100, h: 0 },
        text: { text: "x", fontId: "f", size: 12, wrap: "words" },
    },
];
if (!erasedText(PLANT).includes("planted")) {
    w("FAIL self-check: a planted erased text was NOT reported; the check in this script is dead");
    process.exit(1);
}

let visible = 0;
for (const spec of listElements()) {
    const section: Section = {
        id: "probe",
        root: { type: spec.type, data: spec.create() },
    };
    let commands: RenderCommand[];
    try {
        commands = layoutSection(section, 1280, measure).commands;
    } catch (e) {
        fail(`${spec.type}: default instance throws in layout — ${String(e)}`);
        continue;
    }
    if (!commands.length) {
        fail(`${spec.type}: default instance emits no commands`);
        continue;
    }
    const erased = erasedText(commands);
    if (erased.length) {
        fail(`${spec.type}: text erased by zero-area box or clip — ${erased.join(", ")}`);
        continue;
    }
    visible++;
}
if (visible) w(`ok   every element's default instance lays out with its text visible (${visible})`);

if (failed) process.exit(1);
w("check:elements clean");
