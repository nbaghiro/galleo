import "@elements/register";
import type { ArtifactContent, GenMeta } from "@model/artifact";
import type { EvalCheck } from "@model/eval";
import { measureText } from "@canvas/render/commands";
import { createSectionStackCache, paintSectionStack } from "@canvas/render/backends";
import { fitChecks } from "@canvas/render/fit-checks";
import type { SectionShape } from "@canvas/render/archetype";
import { classifySections } from "@canvas/render/archetype";
import { profileFor } from "@engine/profile";
import { resolveTheme } from "@themes";

// Browser entry for headless capture. Bundled with esbuild and loaded into real Chromium by
// scripts/shoot.ts, it paints through the exact path the studio uses: the engine solver with the
// real canvas `measureText`, then the DOM paint backend. Lives in scripts/ (outside the layer law)
// so it may reach both canvas and services.
//
// Why a real browser rather than a canvas shim: ~70 webfonts drive `measureText`, `measureText`
// drives the solver, and the solver decides every box. Measure with the wrong font and you are not
// looking at a slightly different picture, you are looking at a different layout.

const WIDTH = 1280;

declare global {
    interface Window {
        __galleo: {
            paint: (content: ArtifactContent) => { id: string; top: number; height: number }[];
            checks: (content: ArtifactContent, meta?: GenMeta) => EvalCheck[];
            shapes: (content: ArtifactContent) => SectionShape[];
            fontsLoaded: (families: string[]) => Promise<string[]>;
            imagesSettled: (deadlineMs: number) => Promise<number>;
            width: number;
        };
    }
}

/**
 * Which of these families the browser will not actually paint, tested by measuring rather than by
 * asking. `document.fonts.check()` is useless here: it answers true both when a face is loaded and
 * when it is entirely unknown, because an absent family needs no loading before the browser falls
 * back. So we render a probe string in `"Family", monospace` and in bare `monospace` and compare
 * widths. Identical widths mean the family did nothing, which is exactly the failure we must catch:
 * every height-derived check would otherwise be measured against a fallback face and report
 * confident nonsense.
 */
async function fontsLoaded(families: string[]): Promise<string[]> {
    const cx = document.createElement("canvas").getContext("2d");
    if (!cx) return families; // no 2D context at all: nothing here can be trusted
    const PROBE = "MMMWWWiiillm 0123456789";
    const widthIn = (font: string): number => {
        cx.font = font;
        return cx.measureText(PROBE).width;
    };

    // Retried, because a CDN that drops one request should not red-build the repo. A genuinely
    // blocked host still fails: every attempt returns the fallback width.
    let missing = families;
    for (let attempt = 0; attempt < 3 && missing.length; attempt++) {
        if (attempt) await new Promise((r) => setTimeout(r, 500 * attempt));
        await Promise.all(
            missing.map((f) => document.fonts.load(`16px "${f}"`).catch(() => undefined)),
        );
        const base = widthIn("32px monospace");
        missing = missing.filter((f) => widthIn(`32px "${f}", monospace`) === base);
    }
    return missing;
}

/**
 * Resolves once every image the paint produced has actually arrived, or the deadline passes. The
 * backend draws photos as CSS `background-image` divs, which fire no load events, so a screenshot
 * taken straight after paint races the network and captures voids where photos belong: the judge
 * then scores imagery nobody would ship. Each URL is pushed through a real `Image()` (a cache hit
 * resolves instantly) and failures retry with backoff, because picsum rate-limits bursts and one
 * dropped request should cost a retry, not the capture. Returns how many URLs never arrived; a
 * missing image changes pixels, never layout, so unlike a missing font it degrades the shot
 * instead of invalidating the run.
 */
async function imagesSettled(deadlineMs: number): Promise<number> {
    const started = performance.now();
    const urls = new Set<string>();
    for (const el of document.querySelectorAll<HTMLElement>("#stage, #stage *"))
        for (const m of (el.style.backgroundImage || "").matchAll(/url\("(.*?)"\)/g))
            urls.add(m[1]!);
    for (const img of document.images) if (img.src) urls.add(img.src);
    const load = (u: string): Promise<boolean> =>
        new Promise((done) => {
            const probe = new Image();
            probe.onload = () => done(true);
            probe.onerror = () => done(false);
            probe.src = u;
        });

    let pending = [...urls];
    for (let round = 0; pending.length; round++) {
        const remaining = deadlineMs - (performance.now() - started);
        if (remaining <= 0) break;
        const settled = await Promise.race([
            Promise.all(pending.map(async (u) => ((await load(u)) ? null : u))),
            // deadline mid-round: whatever is still in flight stays pending
            new Promise<null>((r) => setTimeout(() => r(null), remaining)),
        ]);
        if (settled === null) break;
        pending = settled.filter((u): u is string => u !== null);
        if (pending.length)
            await new Promise((r) => setTimeout(r, Math.min(1200 * (round + 1), 5000)));
    }
    return pending.length;
}

/** Paints the stack into the page and reports where each section landed, for per-section crops. */
function paintStack(content: ArtifactContent): { id: string; top: number; height: number }[] {
    const host = document.getElementById("stage") as HTMLElement;
    host.style.width = `${WIDTH}px`;
    host.style.position = "relative";
    const theme = resolveTheme(content.theme).tokens;
    const { tops, heights, height } = paintSectionStack(
        host,
        content.sections,
        profileFor(content),
        theme,
        // no window: a shot must contain every section, not the ones near a viewport
        { fullW: WIDTH, cache: createSectionStackCache() },
    );
    host.style.height = `${height}px`;
    document.body.style.background = theme.bg;
    // paintSectionStack replaces the host's children with one layer per section, in order, and no
    // window is passed so every section is painted. Tagging them lets Playwright screenshot each as
    // an element, which scrolls it into view rather than fighting the viewport with a clip box.
    const layers = [...host.children];
    content.sections.forEach((s, i) => layers[i]?.setAttribute("data-section", s.id));
    return content.sections.map((s, i) => ({
        id: s.id,
        top: tops[i] ?? 0,
        height: heights[i] ?? 0,
    }));
}

/**
 * The deterministic checks, run inside the page because this is the half that cannot run in Node:
 * every height here depends on font metrics. Calling `fitChecks` rather than re-deriving the checks
 * from raw measurements is the point: CI and the /eval UI then hold content to the same rules by
 * construction instead of by two copies staying in step.
 */
const checks = (content: ArtifactContent, meta?: GenMeta): EvalCheck[] =>
    fitChecks(content, meta, measureText);

/** Only for reporting the shape of a stack; the checks over shapes are already in `fitChecks`. */
const shapes = (content: ArtifactContent): SectionShape[] =>
    classifySections(
        content.sections,
        WIDTH,
        measureText,
        resolveTheme(content.theme).tokens,
        profileFor(content),
    );

window.__galleo = { paint: paintStack, checks, shapes, fontsLoaded, imagesSettled, width: WIDTH };
