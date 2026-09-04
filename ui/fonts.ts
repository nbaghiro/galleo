import { createSignal } from "solid-js";
import type { SectionStackCache } from "@canvas/render/backends";

// Layout is solved from glyph metrics, so a wrap solved before the real faces arrive is wrong and
// not merely unstyled. The measure cache flushes itself on the same event (`render/commands.ts`);
// this is the repaint half, for the surfaces that hold a solved layout of their own. One listener
// for the whole app, and `ready` as well as `loadingdone` because a cached face can settle before
// a surface has even mounted.
const [generation, bump] = createSignal(0);

if (typeof document !== "undefined" && document.fonts) {
    const settled = (): void => {
        bump((n) => n + 1);
    };
    void document.fonts.ready.then(settled);
    document.fonts.addEventListener("loadingdone", settled);
}

/** Bumped once every time the browser finishes settling a batch of font faces. */
export const fontsGeneration = generation;

/**
 * A paint effect's dependency on the fonts: read it inside the effect. It tracks the generation
 * and, when the faces settled since this surface last painted, drops the cached layers so the
 * repaint it triggers re-measures for real.
 */
export function createFontsInvalidator(cache: SectionStackCache): () => void {
    let painted = generation();
    return () => {
        const gen = generation();
        if (gen === painted) return;
        painted = gen;
        cache.entries.clear();
    };
}
