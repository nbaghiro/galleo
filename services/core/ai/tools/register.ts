// side-effect imports: each runs the tool's implement()

import "./generate";
import "./plan";
import "./generation";
import "./section";
import "./element";
import "./text";
import "./refine";
import "./relayout";
import "./suggest";
import "./notes";
import "./inspect";
import "./library";
import "./manage";
import "./structure";
import "./media";
import "./audio";
import "./files";
import "./theme";
import "./context-search";
// the agent turn is a tool body too, and nothing else in the server imports its file
import "@services/core/ai/chat";
