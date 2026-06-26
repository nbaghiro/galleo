import type { LayoutCtx } from "@elements/element-spec";
import type { FormatDescriptor } from "@model/format";
import "@elements/text";
import "@elements/image";
import "@elements/card";
import "@elements/stat";
import "@elements/bullets";
import "@elements/button";
import "@elements/divider";
import "@elements/quote";
import { layout } from "@engine/layout";
import { paint } from "./dom-backend";
import { measureText } from "./measure";
import { buildShowcase } from "./palette";

const format: FormatDescriptor = {
    id: "deck",
    name: "Deck",
    kind: "paged",
    width: 1000,
    height: 625,
    tokenScale: 1,
    splitMinWidth: 520,
    paginate: "always",
};

function render(): void {
    const host = document.getElementById("stage");
    if (!host) return;
    const width = 880;
    const ctx: LayoutCtx = {
        box: { x: 0, y: 0, w: width, h: 0 },
        availWidth: width,
        format,
        tokens: {},
        theme: {},
    };
    const node = buildShowcase(ctx);
    const commands = layout(node, { x: 0, y: 0, w: width, h: 100000 }, measureText);
    const bottom = commands.reduce((mx, c) => Math.max(mx, c.box.y + c.box.h), 0);
    host.style.width = `${width}px`;
    host.style.height = `${bottom}px`;
    paint(commands, host);
}

render();
