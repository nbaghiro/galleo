import type { LayoutCtx } from "@elements/element-spec";
import type { MeasureText } from "@engine/node";
import { layout } from "@engine/layout";
import { paint } from "./dom-backend";
import { paletteContent } from "./palette";

// The right panel: the element palette (drag source). Later it swaps to an inspector when an element
// is selected, or a layout picker when a section is selected.
export function renderPanel(host: HTMLElement, ctx: LayoutCtx, measure: MeasureText): void {
    host.replaceChildren();
    const width = Math.max(180, (host.clientWidth || 280) - 36);
    const node = paletteContent({ ...ctx, box: { x: 0, y: 0, w: width, h: 0 }, availWidth: width });
    const commands = layout(node, { x: 0, y: 0, w: width, h: 100000 }, measure);
    const h = commands.reduce((m, c) => Math.max(m, c.box.y + c.box.h), 0);

    const inner = document.createElement("div");
    inner.style.position = "relative";
    inner.style.width = `${width}px`;
    inner.style.height = `${h}px`;
    paint(commands, inner);
    host.appendChild(inner);
}
