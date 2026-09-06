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
// 6. Every control a spec puts on the floating bar has a compact form (a text input or a slider does
//    not, and rendered the panel widget over the canvas), and no bar packs more wide widgets than the
//    text bar, the densest one we ship, so the bar stays a bar.
//
// 6. Every file that registers an element is reachable from register.ts's import graph, so a new
//    element cannot be forgotten silently by the manifest.
// 7. Every palette-visible spec has drawn preview art, so a new element cannot silently ship the
//    generic fallback tile.
//
// Lives in scripts/ because it deliberately crosses the layer law (services catalog + canvas
// registry in one process); scripts sit outside the law. Run: pnpm check:elements

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import "@elements/register";
import type { ControlField, ElementSpec } from "@elements/spec";
import {
    BAR_KINDS,
    BAR_WIDE_BUDGET,
    WIDE_BAR_KINDS,
    barControls,
    listElements,
} from "@elements/spec";
import { hasOwnPreview } from "@elements/previews";
import { fit, grow } from "@model/geometry";
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

const AGENTS = "AGENTS.md";

// the registry's own flag, so this guard and the editor palette can never disagree (L1)
const palette = listElements().filter((s) => !s.hidden);
const byCategory = new Map<string, number>();
for (const s of palette) byCategory.set(s.category, (byCategory.get(s.category) ?? 0) + 1);

/** What the tally in `doc` gets wrong about `total`/`cats`; empty means it is right. */
function tallyDrift(doc: string, total: number, cats: Map<string, number>): string[] | null {
    const m = doc.match(/\*\*(\d+) palette elements\*\*[^(]*\(([^)]+)\)/);
    const stated = m?.[1];
    const breakdown = m?.[2];
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

/** What is wrong with a spec's bar; empty means it is a bar the bar can draw. */
function barProblems(spec: ElementSpec): string[] {
    const out: string[] = [];
    for (const key of spec.bar ?? []) {
        const c = spec.controls.find((f) => f.key === key);
        if (!c) out.push(`bar names "${key}", which is not one of its controls`);
        else if (!BAR_KINDS.has(c.control))
            out.push(`bar control "${key}" is a ${c.control}, which has no compact form`);
        else if (c.control === "toggle" && !c.icon)
            out.push(`bar toggle "${key}" needs an icon, since the bar drops labels`);
    }
    const wide = barControls(spec, spec.create() as Record<string, unknown>).filter((c) =>
        WIDE_BAR_KINDS.has(c.control),
    ).length;
    if (wide > BAR_WIDE_BUDGET)
        out.push(
            `bar shows ${wide} wide controls for its default data; the budget is ${BAR_WIDE_BUDGET}`,
        );
    return out;
}

// Self-check: a planted bar with a text input and five selects must be reported twice over.
const PLANT_CONTROLS: ControlField[] = [
    { key: "a", label: "A", control: "text" },
    ...["s1", "s2", "s3", "s4", "s5"].map(
        (key): ControlField => ({ key, label: key, control: "select", options: [] }),
    ),
];
const PLANT_SPEC: ElementSpec = {
    type: "planted",
    label: "Planted",
    category: "basic",
    tier: "primitive",
    create: () => ({}),
    layout: () => ({ w: grow(), h: fit() }),
    bar: PLANT_CONTROLS.map((c) => c.key),
    controls: PLANT_CONTROLS,
};
if (barProblems(PLANT_SPEC).length !== 2) {
    w(
        "FAIL self-check: a planted bad bar was NOT reported twice; the check in this script is dead",
    );
    process.exit(1);
}

let honestBars = 0;
for (const spec of listElements()) {
    const problems = barProblems(spec);
    if (problems.length) fail(`${spec.type}: ${problems.join("; ")}`);
    else honestBars++;
}
if (honestBars) w(`ok   every bar draws compactly and within budget (${honestBars} specs)`);

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

// 6. registration reachability: walk register.ts's import graph and compare against every file
// under canvas/elements that calls register( — an unreached one registers nothing at runtime.
const ROOT = "canvas/elements";
const resolveSpec = (from: string, spec: string): string | null => {
    if (spec.startsWith("@elements/")) return join(ROOT, spec.slice("@elements/".length) + ".ts");
    if (spec.startsWith("./") || spec.startsWith("../"))
        return join(from, "..", spec) + (spec.endsWith(".ts") ? "" : ".ts");
    return null; // out of the elements tree: model, themes, d3 — not a registration path
};
const reachable = new Set<string>();
const walk = (file: string): void => {
    const norm = join(file); // collapse ../ segments so set membership matches scan paths
    if (reachable.has(norm)) return;
    reachable.add(norm);
    let src: string;
    try {
        src = readFileSync(norm, "utf8");
    } catch {
        return;
    }
    for (const m of src.matchAll(/from "([^"]+)"|import "([^"]+)"/g)) {
        const next = resolveSpec(norm, m[1] ?? m[2] ?? "");
        if (next) walk(next);
    }
};
walk(join(ROOT, "register.ts"));
const allFiles = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory()
            ? e.name === "__tests__"
                ? []
                : allFiles(join(dir, e.name))
            : e.name.endsWith(".ts")
              ? [join(dir, e.name)]
              : [],
    );
const registrars = allFiles(ROOT).filter(
    (f) => !f.endsWith("spec.ts") && /\bregister\(/.test(readFileSync(f, "utf8")),
);
// a scan finding almost nothing is a dead scan, not a clean tree
if (registrars.length < 10) {
    w(
        `FAIL self-check: only ${registrars.length} register() callers found; the registrar scan is dead`,
    );
    process.exit(1);
}
// self-check: a name outside the graph must read as unreachable, or the walk is dead
if (reachable.has(join(ROOT, "not-a-real-file.ts"))) {
    w("FAIL self-check: a nonexistent file reads as reachable; the import walk is dead");
    process.exit(1);
}
const unreached = registrars.filter((f) => !reachable.has(f));
if (unreached.length)
    fail(`register() callers unreachable from register.ts: ${unreached.join(", ")}`);
else w(`ok   every register() caller is reachable from register.ts (${registrars.length} files)`);

// 7. palette art: a visible spec falling back to the generic tile is an oversight, not a choice
if (hasOwnPreview("not-a-real-type")) {
    w("FAIL self-check: a nonexistent type claims preview art; the preview probe is dead");
    process.exit(1);
}
const bare = palette.filter((sp) => !hasOwnPreview(sp.type)).map((sp) => sp.type);
if (bare.length) fail(`palette elements with only the fallback preview tile: ${bare.join(", ")}`);
else w(`ok   every palette element has drawn preview art (${palette.length})`);

if (failed) process.exit(1);
w("check:elements clean");
