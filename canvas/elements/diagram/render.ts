// Side-effect imports register each diagram type.
import "./process";
import "./steps";
import "./cycle";
import "./pyramid";
import "./funnel";
import "./timeline";
import "./roadmap";
import "./venn";
import "./quadrant";
import "./matrix";
import "./hub";
import "./target";
import "./honeycomb";
import "./tree";
import "./org";
import "./mindmap";
import "./flow";

import type { DrawContext, Rect } from "@engine/node";
import type { Tokens } from "@themes";
import { getDiagram, normalizeDiagram, toDiagramData } from "./utils";
import { seriesColors } from "@elements/chart/utils";

// element data is untyped at runtime (hand-edited JSON, a half-streamed AI element), so narrow it here
export function renderDiagram(g: DrawContext, box: Rect, data: unknown, theme: Tokens): void {
    const d = toDiagramData(data);
    const diagram = normalizeDiagram(d);
    if (diagram.items.length === 0) return;
    const type = getDiagram(diagram.type) ?? getDiagram("process");
    if (!type) return;
    type.render(diagram, {
        g,
        W: box.w,
        H: box.h,
        theme,
        opts: diagram.options,
        colors: (n) => seriesColors(theme, n, diagram.palette),
    });
}

export { diagramTypeOptions } from "./utils";
export type { DiagramData } from "./utils";
