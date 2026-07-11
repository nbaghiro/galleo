// Side-effect module: importing it runs every tool's register(), so the whole implemented catalog is in the
// registry regardless of which tools a given surface imports directly. Import once from the runtime entry
// (services/ai/run). No exports — it exists purely for its imports' side effects.

import "./generate";
import "./section";
import "./element";
import "./text";
import "./suggest";
import "./inspect";
import "./library";
import "./manage";
import "./structure";
import "./media";
import "./theme";
