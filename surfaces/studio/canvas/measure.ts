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

export const measureText = (leaf: TextLeaf, maxWidth: number): Measured => {
    const cx = getCtx();
    cx.font = `${leaf.weight ?? 400} ${leaf.size}px ${leaf.fontId}`;
    const lineHeight = leaf.lineHeight ?? leaf.size * 1.35;
    const hard = leaf.text.split("\n"); // explicit (shift-enter) line breaks

    if (leaf.wrap === "none" || !Number.isFinite(maxWidth)) {
        const width = Math.max(0, ...hard.map((l) => cx.measureText(l).width));
        return { width, height: hard.length * lineHeight };
    }

    let lines = 0;
    let widest = 0;
    for (const seg of hard) {
        const words = seg.split(/\s+/).filter(Boolean);
        if (words.length === 0) {
            lines += 1; // an empty hard line still occupies a row
            continue;
        }
        let line = "";
        let segLines = 1;
        for (const word of words) {
            const candidate = line === "" ? word : `${line} ${word}`;
            if (cx.measureText(candidate).width > maxWidth && line !== "") {
                widest = Math.max(widest, cx.measureText(line).width);
                line = word;
                segLines += 1;
            } else {
                line = candidate;
            }
        }
        widest = Math.max(widest, cx.measureText(line).width);
        lines += segLines;
    }
    return { width: Math.min(widest, maxWidth), height: lines * lineHeight };
};
