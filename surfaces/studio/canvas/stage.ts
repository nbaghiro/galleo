import type { RenderCommand, Region } from "@engine/render-command";
import type { Section } from "@model/content";
import type { FormatDescriptor } from "@model/format";
import type { Tokens } from "@themes/theme";
import { paint } from "./dom-backend";
import { measureText } from "./measure";
import { layoutSection, SECTION_GAP } from "./render";

// Paint a vertical stack of sections into `host` — deck = centered content columns with gaps, doc/web =
// seamless full-bleed bands. Each section is laid out by the engine and painted into an absolutely-
// positioned layer. Returns the per-section top offsets, the hit-test regions (in stage coords), and the
// total height (incl. the trailing gap). Callers own the host element, its clearing, and any background —
// this is only the loop the studio canvas, present view, and read-only preview share.
export function paintSectionStack(
    host: HTMLElement,
    sections: Section[],
    profile: FormatDescriptor,
    theme: Tokens,
    opts: { fullW: number; startY?: number; hideId?: string | null },
): { tops: number[]; regions: Region[]; height: number } {
    const web = profile.id === "web";
    const gap = profile.kind === "continuous" ? 0 : SECTION_GAP; // doc/web merge seamlessly
    const contentW = Math.min(opts.fullW - 64, profile.maxContentWidth ?? 1080);
    const tops: number[] = [];
    const regions: Region[] = [];
    let y = opts.startY ?? 0;
    for (const section of sections) {
        const bleed = (section.bleed ?? false) || web;
        const layoutW = bleed ? opts.fullW : contentW;
        const x = bleed ? 0 : Math.round((opts.fullW - contentW) / 2);
        const res = layoutSection(section, layoutW, measureText, theme, profile);
        const commands = opts.hideId
            ? res.commands.filter((c) => !(c.kind === "text" && c.id === opts.hideId))
            : res.commands;
        const layer = document.createElement("div");
        layer.style.cssText = `left:${x}px;top:${y}px;width:${layoutW}px;height:${res.height}px`;
        paint(commands, layer);
        layer.style.position = "absolute"; // paint() forces relative; keep layers out of flow
        host.appendChild(layer);
        for (const r of res.regions)
            regions.push({
                id: r.id,
                box: { x: r.box.x + x, y: r.box.y + y, w: r.box.w, h: r.box.h },
            });
        tops.push(y);
        y += res.height + gap;
    }
    return { tops, regions, height: y };
}

// Fit render commands (of natural height contentH) into a slideW × slideH frame — scaled down + centered
// — and paint them. Returns the positioned content element; the caller wraps it in its own slide frame.
export function fitSlideContent(
    commands: RenderCommand[],
    contentH: number,
    slideW: number,
    slideH: number,
): HTMLDivElement {
    const fit = Math.min(1, slideH / contentH);
    const content = document.createElement("div");
    content.style.cssText = `position:absolute;width:${slideW}px;height:${contentH}px;transform:scale(${fit});transform-origin:top left;left:${(slideW - slideW * fit) / 2}px;top:${(slideH - contentH * fit) / 2}px`;
    paint(commands, content);
    return content;
}
