import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build } from "esbuild";
import { chromium, type Browser, type Page } from "playwright";
import type { ArtifactContent, GenMeta } from "@model/artifact";
import type { EvalCheck } from "@model/eval";
import type { SectionShape } from "@canvas/render/archetype";

// Headless capture in real Chromium. The point is fidelity, not convenience: ~70 webfonts drive
// `measureText`, which drives the solver, which decides every box, so a canvas shim would not render
// the same layout the user sees. That makes this the only place the height-derived checks
// (fits-frame, fills-frame) can be measured honestly outside a browser tab.

const FONT_LINK = (() => {
    // reuse the app's own font list rather than a second copy that can drift out of step
    const html = readFileSync(join(process.cwd(), "app/index.html"), "utf8");
    return /<link[^>]+fonts\.googleapis\.com\/css2[^>]*>/.exec(html)?.[0] ?? "";
})();

const PAGE = (bundle: string): string => `<!doctype html>
<html><head><meta charset="utf-8"/>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
${FONT_LINK}
<style>html,body{margin:0;padding:0}#stage{margin:0}</style>
</head><body><div id="stage"></div><script>${bundle}</script></body></html>`;

// A spot-check rather than all ~70: these are the faces the corpus themes actually paint with, so a
// CDN that failed or was blocked shows up here immediately.
const REQUIRED_FONTS = ["Fraunces", "Hanken Grotesk", "DM Mono"];

const FONT_TIMEOUT_MS = 20_000;

export interface Shot {
    id: string;
    png: Buffer;
}

export interface Capture {
    shots: Shot[];
    /** The whole stack in one image: the seams between sections show only here. */
    strip: Buffer;
    /** `@canvas/render/fit-checks` run inside the page, so these are the same checks the /eval UI
     *  reports rather than a second implementation of them. */
    checks: EvalCheck[];
    shapes: SectionShape[];
}

async function bundleEntry(): Promise<string> {
    const out = await build({
        entryPoints: [join(process.cwd(), "scripts/shot.entry.ts")],
        bundle: true,
        write: false,
        format: "iife",
        platform: "browser",
        target: "es2022",
        tsconfig: join(process.cwd(), "tsconfig.json"),
        logLevel: "silent",
    });
    const text = out.outputFiles?.[0]?.text;
    if (!text) throw new Error("failed to bundle scripts/shot.entry.ts");
    return text;
}

async function openPage(browser: Browser, bundle: string): Promise<{ page: Page; dir: string }> {
    const dir = mkdtempSync(join(tmpdir(), "galleo-shot-"));
    const file = join(dir, "shot.html");
    writeFileSync(file, PAGE(bundle));
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    // proves the font guard below actually fires; see scripts/__tests__/shoot.test.ts
    if (process.env.GALLEO_BLOCK_FONTS)
        await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
    await page.goto(`file://${file}`);
    // Without this every metric is a fallback font's, and the whole capture is quietly wrong. It is
    // raced against a timeout because a blocked CDN leaves `fonts.ready` pending forever, which
    // would hang a CI job instead of failing it; the probe below is what actually decides.
    await page.evaluate(
        (ms) =>
            Promise.race([
                document.fonts.ready.then(() => undefined),
                new Promise((r) => setTimeout(r, ms as number)),
            ]),
        FONT_TIMEOUT_MS,
    );
    const missing = await page.evaluate(
        (f) => window.__galleo.fontsLoaded(f as string[]),
        REQUIRED_FONTS as unknown,
    );
    if (missing.length)
        throw new Error(
            `fonts did not load: ${missing.join(", ")}. Every height-derived check would be ` +
                `measured against a fallback face. Check network access to fonts.googleapis.com.`,
        );
    return { page, dir };
}

/** One browser, many artifacts: startup dominates, so callers should batch through `session`. */
export async function session<T>(run: (shoot: Shooter) => Promise<T>): Promise<T> {
    const bundle = await bundleEntry();
    const browser = await chromium.launch();
    const { page, dir } = await openPage(browser, bundle);
    try {
        return await run((content, meta) => capture(page, content, meta));
    } finally {
        await browser.close();
        rmSync(dir, { recursive: true, force: true });
    }
}

export type Shooter = (content: ArtifactContent, meta?: GenMeta) => Promise<Capture>;

async function capture(page: Page, content: ArtifactContent, meta?: GenMeta): Promise<Capture> {
    const boxes = await page.evaluate(
        (c) => window.__galleo.paint(c as ArtifactContent),
        content as unknown,
    );
    const checks = await page.evaluate(
        ([c, m]) => window.__galleo.checks(c as ArtifactContent, m as GenMeta | undefined),
        [content, meta] as unknown[],
    );
    const shapes = await page.evaluate(
        (c) => window.__galleo.shapes(c as ArtifactContent),
        content as unknown,
    );
    const stage = page.locator("#stage");
    const strip = await stage.screenshot();

    const shots: Shot[] = [];
    for (const b of boxes) {
        if (b.height < 1) continue;
        const el = page.locator(`[data-section="${b.id}"]`);
        if (!(await el.count())) continue;
        shots.push({ id: b.id, png: await el.screenshot() });
    }
    return { shots, strip, checks, shapes };
}
