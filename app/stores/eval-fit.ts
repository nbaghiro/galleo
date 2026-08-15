import type { ArtifactContent } from "@model/artifact";
import type { EvalCheck } from "@model/eval";
import type { SectionFit } from "@canvas/render/diagnose";
import { SPARSE_BELOW, diagnoseSections } from "@canvas/render/diagnose";
import { measureText } from "@canvas/render/commands";
import { profileFor } from "@engine/profile";
import { THEMES } from "@themes";

// The layout half of the deterministic checks. These need the engine, which services may not
// import, so they are computed here (the app already runs the engine) and posted back to be stored
// alongside the structural ones. Measurement is the painter's own `measureText`, so a fit reflects
// what the user sees rather than an approximation of it.

const FRAME_WIDTH = 1280; // the deck profile's own width, so fits read in authored pixels

export function fitChecks(content: ArtifactContent): EvalCheck[] {
    const format = profileFor(content);
    const theme = THEMES[content.theme]?.tokens;
    const fits = diagnoseSections(content.sections, FRAME_WIDTH, measureText, theme, format);
    return fits.flatMap(toChecks);
}

function toChecks(fit: SectionFit): EvalCheck[] {
    const target = `section:${fit.id}`;
    const out: EvalCheck[] = [
        {
            id: "fits-frame",
            dimension: "layout",
            target,
            pass: fit.overflow === 0,
            ...(fit.overflow
                ? { detail: `spills ${Math.round(fit.overflow)}px past the frame` }
                : {}),
        },
    ];
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
