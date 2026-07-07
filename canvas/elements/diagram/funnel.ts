import { bandStack, registerDiagram } from "./utils";

// Stacked trapezoid bands widening toward the top — a funnel silhouette (see `bandStack`).
registerDiagram({ id: "funnel", label: "Funnel", render: bandStack(false) });
