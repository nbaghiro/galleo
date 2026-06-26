import type { Measured, TextLeaf } from "@engine/node";

// Canvas-based text measurement injected into the engine (keeps the kernel DOM-free).

let ctx2d: CanvasRenderingContext2D | undefined;

function getCtx(): CanvasRenderingContext2D {
    if (!ctx2d) {
        const canvas = document.createElement("canvas");
        const cx = canvas.getContext("2d");
        if (!cx) throw new Error("no 2d canvas context available");
        ctx2d = cx;
    }
    return ctx2d;
}

function family(fontId: string): string {
    if (fontId === "display") return "Georgia, 'Times New Roman', serif";
    if (fontId === "mono") return "ui-monospace, 'SF Mono', monospace";
    return "system-ui, -apple-system, sans-serif";
}

export const measureText = (leaf: TextLeaf, maxWidth: number): Measured => {
    const cx = getCtx();
    cx.font = `${leaf.weight ?? 400} ${leaf.size}px ${family(leaf.fontId)}`;
    const lineHeight = leaf.lineHeight ?? leaf.size * 1.35;
    const full = cx.measureText(leaf.text).width;
    if (leaf.wrap === "none" || !Number.isFinite(maxWidth)) {
        return { width: full, height: lineHeight };
    }
    const words = leaf.text.split(/\s+/).filter(Boolean);
    let line = "";
    let widest = 0;
    let lines = words.length === 0 ? 0 : 1;
    for (const word of words) {
        const candidate = line === "" ? word : `${line} ${word}`;
        if (cx.measureText(candidate).width > maxWidth && line !== "") {
            widest = Math.max(widest, cx.measureText(line).width);
            line = word;
            lines += 1;
        } else {
            line = candidate;
        }
    }
    widest = Math.max(widest, cx.measureText(line).width);
    return { width: Math.min(widest, maxWidth), height: lines * lineHeight };
};
