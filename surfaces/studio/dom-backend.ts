import type { DrawContext } from "@engine/node";
import type { RenderCommand } from "@engine/render-command";

// A DOM render backend: paints absolute-positioned divs from the engine's render commands.

export function paint(commands: RenderCommand[], host: HTMLElement): void {
    host.replaceChildren();
    host.style.position = "relative";
    for (const c of commands) {
        const el = document.createElement("div");
        el.style.position = "absolute";
        el.style.left = `${c.box.x}px`;
        el.style.top = `${c.box.y}px`;
        el.style.width = `${c.box.w}px`;
        el.style.height = `${c.box.h}px`;
        el.style.boxSizing = "border-box";
        if (c.kind === "rect") {
            if (c.fill?.color) el.style.background = c.fill.color;
            if (c.fill?.radius !== undefined) el.style.borderRadius = `${c.fill.radius}px`;
            if (c.fill?.border) {
                const b = c.fill.border;
                el.style.border = `${b.width}px ${b.style ?? "solid"} ${b.color}`;
            }
        } else if (c.kind === "image") {
            el.style.backgroundImage = `url("${c.image.src}")`;
            el.style.backgroundSize = c.image.fit;
            el.style.backgroundPosition = "center";
            el.style.backgroundRepeat = "no-repeat";
            if (c.image.radius !== undefined) el.style.borderRadius = `${c.image.radius}px`;
        } else if (c.kind === "text") {
            const t = c.text;
            el.textContent = t.text;
            el.style.font = `${t.weight ?? 400} ${t.size}px ${t.fontId}`;
            el.style.lineHeight = `${t.lineHeight ?? t.size * 1.35}px`;
            el.style.color = t.color ?? "#1a1a1a";
            el.style.textAlign = t.align ?? "start";
            el.style.whiteSpace = t.wrap === "none" ? "nowrap" : "normal";
            el.style.overflow = "hidden";
        } else {
            const canvas = document.createElement("canvas");
            canvas.width = c.box.w;
            canvas.height = c.box.h;
            canvas.style.width = "100%";
            canvas.style.height = "100%";
            const cx = canvas.getContext("2d");
            if (cx) c.paint(cx as unknown as DrawContext, { x: 0, y: 0, w: c.box.w, h: c.box.h });
            el.appendChild(canvas);
        }
        host.appendChild(el);
    }
}
