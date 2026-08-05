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
import type { DiagramData } from "./utils";
import { diagramColors, getDiagram, normalizeDiagram } from "./utils";

export function renderDiagram(g: DrawContext, box: Rect, data: DiagramData, theme: Tokens): void {
    const diagram = normalizeDiagram(data);
    if (diagram.items.length === 0) return;
    const type = getDiagram(diagram.type) ?? getDiagram("process");
    if (!type) return;
    const palette = data.palette === "categorical" ? "categorical" : "ramp";
    type.render(diagram, {
        g,
        W: box.w,
        H: box.h,
        theme,
        opts: diagram.options,
        colors: (n) => diagramColors(theme, n, palette),
    });
}

export { diagramTypeOptions } from "./utils";
export type { DiagramData } from "./utils";
