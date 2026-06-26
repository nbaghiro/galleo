import type { LayoutCtx } from "@elements/element-spec";
import type { FormatDescriptor } from "@model/format";
import "@elements/card";
import "@elements/image";
import "@elements/text";
import { getElement } from "@elements/registry";
import { layout } from "@engine/layout";
import { paint } from "./dom-backend";
import { measureText } from "./measure";
import { sample } from "./sample";

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
    const width = 860;
    const ctx: LayoutCtx = {
        box: { x: 0, y: 0, w: width, h: 0 },
        availWidth: width,
        format,
        tokens: {},
        theme: {},
    };
    const spec = getElement(sample.type);
    if (!spec) return;
    const node = spec.layout(sample.data, ctx);
    const commands = layout(node, { x: 0, y: 0, w: width, h: 10000 }, measureText);
    const bottom = commands.reduce((mx, c) => Math.max(mx, c.box.y + c.box.h), 0);
    host.style.width = `${width}px`;
    host.style.height = `${bottom}px`;
    paint(commands, host);
}

render();
