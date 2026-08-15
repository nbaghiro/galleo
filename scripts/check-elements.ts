// Element drift guard: the three registries that must name the same world.
//
// 1. The chart registry's ids must equal the CHART_TYPES value-set (mirrors the vitest guard).
// 2. The diagram registry's ids must equal the DIAGRAM_TYPES value-set (ditto).
// 3. Every element type the AI catalog can emit must be a registered element spec, or generation
//    produces content the canvas renders as the unknown-type error box.
//
// Lives in scripts/ because it deliberately crosses the layer law (services catalog + canvas
// registry in one process); scripts sit outside the law. Run: pnpm check:elements

import "@elements/register";
import { listElements } from "@elements/spec";
import { chartTypeOptions } from "@elements/chart/render";
import { diagramTypeOptions } from "@elements/diagram/render";
import { CHART_TYPES, DIAGRAM_TYPES } from "@model/elements";
import { ELEMENTS } from "@services/core/ai/prompts/catalog";

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

if (failed) process.exit(1);
w("check:elements clean");
