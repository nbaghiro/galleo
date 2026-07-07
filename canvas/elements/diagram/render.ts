// Diagram rendering entry point. Importing this registers every diagram type (via the per-type modules
// below) and exposes `renderDiagram` — so diagrams flow through every backend + export unchanged, just
// like charts. Diagram fills reuse the charts' accent-derived palette (categorical, for distinct nodes).
import "./process";
import "./cycle";
import "./pyramid";
import "./funnel";
import "./timeline";
import "./venn";
import "./quadrant";
import "./matrix";
import "./tree";
import "./org";
import "./mindmap";
import "./flow";

import type { DrawContext, Rect } from "@engine/node";
import type { Tokens } from "@themes/theme";
import type { DiagramData } from "./utils";
import { getDiagram, normalizeDiagram } from "./utils";
import { seriesColors } from "@elements/chart/utils";

export function renderDiagram(g: DrawContext, box: Rect, data: DiagramData, theme: Tokens): void {
    const diagram = normalizeDiagram(data);
    if (diagram.items.length === 0) return;
    const type = getDiagram(diagram.type) ?? getDiagram("process");
    if (!type) return;
    const palette = data.palette === "ramp" ? "ramp" : "categorical";
    type.render(diagram, {
        g,
        W: box.w,
        H: box.h,
        theme,
        colors: (n) => seriesColors(theme, n, palette),
    });
}

export { diagramTypeOptions } from "./utils";
export type { DiagramData } from "./utils";
