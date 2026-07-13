import { bandStack, registerDiagram } from "./utils";

registerDiagram({ id: "pyramid", label: "Pyramid", render: bandStack(true) });
