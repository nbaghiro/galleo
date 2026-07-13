import { bandStack, registerDiagram } from "./utils";

registerDiagram({ id: "funnel", label: "Funnel", render: bandStack(false) });
