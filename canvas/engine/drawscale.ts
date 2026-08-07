import type { DrawContext, DrawStyle, DrawTextStyle, PathSink } from "@engine/node";

// A DrawContext that turns an unscaled drawing into a k× one.
//
// `tokenScale` scales the composed node tree, but a `surface` paints through this interface using its
// own absolute constants — font sizes, gaps, arrowhead lengths — which a node walk cannot reach. Rather
// than classify every constant in every renderer as length-vs-ratio (they sit side by side: a 3px gap
// next to a 0.34 height fraction next to 0.42 radians), the renderer keeps working in its own 1× space
// — it is handed `box / k` — and every coordinate and length is multiplied on the way out.
//
// That is why ratios need no special handling: their arithmetic happens entirely in renderer space, and
// only the resulting coordinates cross this boundary. Angles are the one thing that crosses as itself,
// so `wedge` and `arc` leave theirs alone. `measureText` is likewise unscaled: the renderer asks in its
// own space and must get an answer in it.

const scaleStyle = (s: DrawStyle, k: number): DrawStyle => ({
    ...s,
    ...(s.width !== undefined ? { width: s.width * k } : {}),
    ...(s.radius !== undefined ? { radius: s.radius * k } : {}),
    ...(s.dash ? { dash: s.dash.map((d) => d * k) } : {}),
});

const scaleTextStyle = (s: DrawTextStyle, k: number): DrawTextStyle =>
    s.size !== undefined ? { ...s, size: s.size * k } : s;

const scaleSink = (sink: PathSink, k: number): PathSink => ({
    moveTo: (x, y) => sink.moveTo(x * k, y * k),
    lineTo: (x, y) => sink.lineTo(x * k, y * k),
    bezierCurveTo: (c1x, c1y, c2x, c2y, x, y) =>
        sink.bezierCurveTo(c1x * k, c1y * k, c2x * k, c2y * k, x * k, y * k),
    quadraticCurveTo: (cx, cy, x, y) => sink.quadraticCurveTo(cx * k, cy * k, x * k, y * k),
    arc: (cx, cy, r, a0, a1, ccw) => sink.arc(cx * k, cy * k, r * k, a0, a1, ccw),
    arcTo: (x1, y1, x2, y2, r) => sink.arcTo(x1 * k, y1 * k, x2 * k, y2 * k, r * k),
    rect: (x, y, w, h) => sink.rect(x * k, y * k, w * k, h * k),
    closePath: () => sink.closePath(),
});

// Typed as DrawContext, so a new method on the interface fails to compile here rather than silently
// drawing unscaled.
export function scaleDrawContext(g: DrawContext, k: number): DrawContext {
    if (k === 1) return g;
    return {
        rect: (x, y, w, h, s) => g.rect(x * k, y * k, w * k, h * k, scaleStyle(s, k)),
        line: (x1, y1, x2, y2, s) => g.line(x1 * k, y1 * k, x2 * k, y2 * k, scaleStyle(s, k)),
        circle: (cx, cy, r, s) => g.circle(cx * k, cy * k, r * k, scaleStyle(s, k)),
        polyline: (points, s) =>
            g.polyline(
                points.map(([x, y]): [number, number] => [x * k, y * k]),
                scaleStyle(s, k),
            ),
        wedge: (cx, cy, r, a0, a1, s) => g.wedge(cx * k, cy * k, r * k, a0, a1, scaleStyle(s, k)),
        path: (build, s) => g.path((sink) => build(scaleSink(sink, k)), scaleStyle(s, k)),
        text: (t, x, y, s) => g.text(t, x * k, y * k, scaleTextStyle(s, k)),
        measureText: (t, s) => g.measureText(t, s),
    };
}
