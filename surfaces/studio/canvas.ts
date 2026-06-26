import type { LayoutCtx } from "@elements/element-spec";
import type { MeasureText } from "@engine/node";
import type { ArtifactContent } from "@model/content";
import { composeSection } from "@elements/compose";
import { layout } from "@engine/layout";
import { paint } from "./dom-backend";

const SECTION_GAP = 22;

function bottomOf(commands: { box: { y: number; h: number } }[]): number {
    return commands.reduce((m, c) => Math.max(m, c.box.y + c.box.h), 0);
}

// Render the artifact as a continuous vertical stack of sections. Each section is laid out at the
// canvas width and painted into its own absolutely-positioned layer. Returns each section's top
// offset (for minimap jump-scroll). (Virtualization — render only the visible range — comes next.)
export function renderCanvas(
    artifact: ArtifactContent,
    host: HTMLElement,
    ctx: LayoutCtx,
    measure: MeasureText,
): number[] {
    host.replaceChildren();
    host.style.position = "relative";
    const width = host.clientWidth || 800;

    let y = 0;
    const tops: number[] = [];
    for (const section of artifact.sections) {
        const node = composeSection(section, { ...ctx, box: { x: 0, y: 0, w: width, h: 0 }, availWidth: width });
        const commands = layout(node, { x: 0, y: 0, w: width, h: 100000 }, measure);
        const h = bottomOf(commands);

        const layer = document.createElement("div");
        layer.style.position = "absolute";
        layer.style.left = "0";
        layer.style.top = `${y}px`;
        layer.style.width = `${width}px`;
        layer.style.height = `${h}px`;
        paint(commands, layer);
        host.appendChild(layer);

        tops.push(y);
        y += h + SECTION_GAP;
    }
    host.style.height = `${y}px`;
    return tops;
}
