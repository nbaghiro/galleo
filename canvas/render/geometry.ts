// Scaled-canvas geometry shared by the minimap/library thumbnails and the present surfaces. Pure
// strings/numbers consumed by the imperative paint path (no Solid) — so it lives in canvas/render, not
// @ui. These centralize the "lay out at a logical width, then CSS-scale to fit" formula that was
// copy-pasted across Thumb · MiniCanvas · SectionThumb · StoryTile · fitSlideContent.

// The cssText for a scaled-canvas host: a box laid out at logical (layoutW × height), CSS-scaled by
// `scale` from the top-left so it shrinks in place with identical text wrapping. Pass `center` instead to
// fit-scale the content and center it inside a fixed frame (the present-slide letterbox variant).
export function scaledHostCss(
    layoutW: number,
    height: number,
    scale: number,
    center?: { frameW: number; frameH: number },
): string {
    const base = `width:${layoutW}px;height:${height}px;transform:scale(${scale});transform-origin:top left`;
    if (!center) return base;
    const left = (center.frameW - center.frameW * scale) / 2;
    const top = (center.frameH - height * scale) / 2;
    return `position:absolute;${base};left:${left}px;top:${top}px`;
}

// The scale that fits a (w × h) slide inside the viewport with a small margin. Matches the present
// surfaces' scale-to-window factor (no upper clamp — a large viewport scales a slide up to fill it).
export function fitToViewport(w: number, h: number, margin = 24): number {
    return Math.min((window.innerWidth - margin) / w, (window.innerHeight - margin) / h);
}
