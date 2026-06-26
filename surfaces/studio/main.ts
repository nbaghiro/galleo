import type { LayoutCtx } from "@elements/element-spec";
import type { FormatDescriptor } from "@model/format";
import "@elements/text";
import "@elements/image";
import "@elements/card";
import "@elements/group";
import "@elements/stat";
import "@elements/bullets";
import "@elements/button";
import "@elements/divider";
import "@elements/quote";
import { renderCanvas } from "./canvas";
import { measureText } from "./measure";
import { renderMinimap } from "./minimap";
import { renderPanel } from "./right-panel";
import { artifact } from "./store";

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

function baseCtx(): LayoutCtx {
    return { box: { x: 0, y: 0, w: 0, h: 0 }, availWidth: 0, format, tokens: {}, theme: {} };
}

function mount(): void {
    const canvasHost = document.getElementById("canvas");
    const minimapHost = document.getElementById("minimap");
    const panelHost = document.getElementById("panel");
    if (!canvasHost || !minimapHost || !panelHost) return;

    const ctx = baseCtx();

    const draw = (): void => {
        const tops = renderCanvas(artifact, canvasHost, ctx, measureText);
        renderMinimap(artifact, minimapHost, ctx, measureText, (i) => {
            canvasHost.scrollTo({ top: Math.max(0, (tops[i] ?? 0) - 18), behavior: "smooth" });
        });
        renderPanel(panelHost, ctx, measureText);
    };

    draw();

    let raf = 0;
    window.addEventListener("resize", () => {
        window.cancelAnimationFrame(raf);
        raf = window.requestAnimationFrame(draw);
    });
}

mount();
