import { bandsArrange, registerDiagram } from "./utils";

// bands taper to widths with no room for a leading glyph
registerDiagram({ id: "pyramid", label: "Pyramid", icons: false, arrange: bandsArrange(true) });
