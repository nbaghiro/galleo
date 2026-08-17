import { bandsArrange, registerDiagram } from "./utils";

// bands taper to widths with no room for a leading glyph
registerDiagram({ id: "funnel", label: "Funnel", icons: false, arrange: bandsArrange(false) });
