import type { ArtifactContent, GenMeta } from "@model/artifact";
import type { EvalCheck } from "@model/eval";
import { CLOSING_ARCHETYPES, OPENING_ARCHETYPES, archetypeFitsRole, roleWants } from "@model/eval";
import type { SectionShape } from "./archetype";
import { classifySections } from "./archetype";
import type { SectionFit } from "./diagnose";
import {
    CONTRAST_FLOOR,
    MAX_LEFT_EDGES,
    MAX_TYPE_SIZES,
    SPARSE_BELOW,
    diagnoseSections,
} from "./diagnose";
import type { MeasureText } from "@engine/node";
import { measureText } from "./commands";
import { profileFor } from "@engine/profile";
import { resolveTheme } from "@themes";

// The layout half of the deterministic checks: the ones whose answer depends on where a box actually
// landed. They need the engine, which services may not import, so they live here rather than beside
// the structural checks, and every consumer runs this one copy: the /eval UI (which posts its
// results back to be stored alongside the structural ones), and both CI entry points through
// scripts/shot.entry.ts. Measurement is the painter's own `measureText` by default, so a fit
// reflects what the user sees rather than an approximation of it.

const FRAME_WIDTH = 1280; // the deck profile's own width, so fits read in authored pixels

/**
 * `meta` carries the outline's beat roles, which is what lets a section be judged against the job its
 * position was given rather than in the abstract. Without it the shape checks still run; only the
 * role-fit one stands down.
 */
export function fitChecks(
    content: ArtifactContent,
    meta?: GenMeta,
    // the painter's own measurer by default, so a fit reflects what the user sees; injectable so a
    // calibration run can measure without a DOM
    measure: MeasureText = measureText,
): EvalCheck[] {
    const format = profileFor(content);
    const theme = resolveTheme(content.theme).tokens;
    const fits = diagnoseSections(content.sections, FRAME_WIDTH, measure, theme, format);
    const shapes = classifySections(content.sections, FRAME_WIDTH, measure, theme, format);
    return [...fits.flatMap(toChecks), ...shapeChecks(shapes, content.format, meta)];
}

/** The visual half: what shape each section took, and whether that suits where it sits. */
function shapeChecks(shapes: SectionShape[], format: string, meta?: GenMeta): EvalCheck[] {
    const out: EvalCheck[] = [];
    const roleOf = new Map((meta?.beats ?? []).map((b) => [b.id, b.role]));

    for (const s of shapes) {
        const role = roleOf.get(s.id);
        // only a section whose role we know can be held to it
        if (roleWants(role)) {
            const fits = archetypeFitsRole(role, s.archetype);
            out.push({
                id: "suits-its-beat",
                dimension: "layout",
                target: `section:${s.id}`,
                pass: fits,
                ...(fits
                    ? {}
                    : {
                          detail: `a ${role} beat rendered as ${s.archetype}; ${roleWants(role)!.join(" or ")} reads right`,
                      }),
            });
        }
    }

    const first = shapes[0];
    if (first) {
        const ok = OPENING_ARCHETYPES.includes(first.archetype);
        out.push({
            id: "opens-with-impact",
            dimension: "layout",
            target: "artifact",
            pass: ok,
            ...(ok ? {} : { detail: `opens as ${first.archetype}` }),
        });
    }

    // A website ends in a footer, which is chrome rather than the end of the argument, so the
    // commitment lands one section earlier and this rule does not apply. Deck and doc do end where
    // they end.
    const last = format !== "web" && shapes.length > 1 ? shapes[shapes.length - 1] : undefined;
    if (last) {
        const ok = CLOSING_ARCHETYPES.includes(last.archetype);
        out.push({
            id: "closes-with-commitment",
            dimension: "layout",
            target: "artifact",
            pass: ok,
            ...(ok ? {} : { detail: `closes as ${last.archetype}` }),
        });
    }

    // the fine key, so a chart then a diagram then a table counts as variety
    const keys = shapes.map((s) => s.key);
    let repeat: string | null = null;
    for (let i = 2; i < keys.length; i++)
        if (keys[i] && keys[i] === keys[i - 1] && keys[i] === keys[i - 2])
            repeat = `sections ${i - 1}–${i + 1} are all ${keys[i]}`;
    if (keys.length >= 3)
        out.push({
            id: "shape-rhythm",
            dimension: "variety",
            target: "artifact",
            pass: !repeat,
            ...(repeat ? { detail: repeat } : {}),
        });

    if (shapes.length >= 4) {
        const distinct = new Set(shapes.map((s) => s.archetype)).size;
        const ok = distinct > 1;
        out.push({
            id: "shape-variety",
            dimension: "variety",
            target: "artifact",
            pass: ok,
            ...(ok ? {} : { detail: `every section is a ${shapes[0]!.archetype}` }),
        });
    }
    return out;
}

function toChecks(fit: SectionFit): EvalCheck[] {
    const target = `section:${fit.id}`;
    const out: EvalCheck[] = [
        {
            id: "fits-frame",
            dimension: "layout",
            target,
            pass: fit.overflow === 0,
            // the fit scale rides along rather than becoming its own check: it says how much of the
            // spill the renderer absorbs, which is a number to read across runs, not a bar to pass
            ...(fit.overflow
                ? {
                      detail:
                          `spills ${Math.round(fit.overflow)}px past the frame` +
                          (fit.fitScale < 1 ? `, rendered at ${fit.fitScale.toFixed(2)}` : ""),
                  }
                : {}),
        },
    ];
    if (fit.minContrast !== null) {
        const legible = fit.minContrast >= CONTRAST_FLOOR;
        out.push({
            id: "text-is-legible",
            dimension: "layout",
            target,
            pass: legible,
            ...(legible
                ? {}
                : {
                      detail: `contrast ${fit.minContrast.toFixed(1)}:1, below ${CONTRAST_FLOOR}:1`,
                  }),
        });
    }
    if (fit.leftEdges > 0) {
        const tidy = fit.leftEdges <= MAX_LEFT_EDGES;
        out.push({
            id: "aligns-to-a-grid",
            dimension: "layout",
            target,
            pass: tidy,
            ...(tidy ? {} : { detail: `${fit.leftEdges} different left edges` }),
        });
    }
    if (fit.typeSizes > 0) {
        const scaled = fit.typeSizes <= MAX_TYPE_SIZES;
        out.push({
            id: "type-scale-holds",
            dimension: "layout",
            target,
            pass: scaled,
            ...(scaled ? {} : { detail: `${fit.typeSizes} distinct type sizes` }),
        });
    }
    // only a fixed frame can be underfilled; an elastic page has no empty space to leave
    if (fit.fill !== null) {
        const sparse = fit.fill < SPARSE_BELOW;
        out.push({
            id: "fills-frame",
            dimension: "layout",
            target,
            pass: !sparse,
            ...(sparse ? { detail: `fills only ${Math.round(fit.fill * 100)}% of the frame` } : {}),
        });
    }
    return out;
}
