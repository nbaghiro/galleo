// Diagram rendering entry point. Importing this registers every diagram type (via the grouped modules
// below) and exposes `renderDiagram` — so diagrams flow through every backend + export unchanged, just
// like charts. Diagram fills reuse the charts' accent-derived palette (categorical, for distinct nodes).
import "./templated";
import "./hierarchy";
import "./flow";

import type { DrawContext, Rect } from "@engine/node";
import type { Tokens } from "@themes/theme";
import type { DiagramData } from "./types";
import { normalizeDiagram } from "./data";
import { getDiagram } from "./registry";
import { seriesColors } from "@canvas/charts/palette";

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

export { diagramTypeOptions } from "./registry";
export type { DiagramData } from "./types";
