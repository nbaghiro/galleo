import { bandStack, registerDiagram } from "./utils";

// Stacked trapezoid bands narrowing toward the top — a triangle silhouette (see `bandStack`).
registerDiagram({ id: "pyramid", label: "Pyramid", render: bandStack(true) });
