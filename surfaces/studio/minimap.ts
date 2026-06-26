import type { LayoutCtx } from "@elements/element-spec";
import type { MeasureText } from "@engine/node";
import type { ArtifactContent } from "@model/content";
import { composeSection } from "@elements/compose";
import { layout } from "@engine/layout";
import { paint } from "./dom-backend";

const THUMB_LAYOUT_WIDTH = 760; // lay out at a realistic width, then scale down

function bottomOf(commands: { box: { y: number; h: number } }[]): number {
    return commands.reduce((m, c) => Math.max(m, c.box.y + c.box.h), 0);
}

// A left rail of live section thumbnails. Each is a real engine render of the section, scaled down.
// Clicking one jumps the canvas to that section.
export function renderMinimap(
    artifact: ArtifactContent,
    host: HTMLElement,
    ctx: LayoutCtx,
    measure: MeasureText,
    onJump: (index: number) => void,
): void {
    host.replaceChildren();
    const miniW = Math.max(120, (host.clientWidth || 168) - 28);
    const scale = miniW / THUMB_LAYOUT_WIDTH;

    artifact.sections.forEach((section, i) => {
        const node = composeSection(section, {
            ...ctx,
            box: { x: 0, y: 0, w: THUMB_LAYOUT_WIDTH, h: 0 },
            availWidth: THUMB_LAYOUT_WIDTH,
        });
        const commands = layout(node, { x: 0, y: 0, w: THUMB_LAYOUT_WIDTH, h: 100000 }, measure);
        const h = bottomOf(commands);

        const item = document.createElement("button");
        item.className = "thumb";
        item.style.height = `${Math.round(h * scale) + 2}px`;
        item.title = `Section ${i + 1}`;

        const inner = document.createElement("div");
        inner.style.position = "absolute";
        inner.style.top = "0";
        inner.style.left = "0";
        inner.style.width = `${THUMB_LAYOUT_WIDTH}px`;
        inner.style.height = `${h}px`;
        inner.style.transformOrigin = "top left";
        inner.style.transform = `scale(${scale})`;
        paint(commands, inner);
        item.appendChild(inner);

        const num = document.createElement("span");
        num.className = "thumb-num";
        num.textContent = String(i + 1);
        item.appendChild(num);

        item.addEventListener("click", () => onJump(i));
        host.appendChild(item);
    });
}
