// Side-effect imports that register every element into the registry (canvas/elements/spec.ts) — one per
// element file, grouped by category (mirrors the canvas/elements/<category>/ folders + the palette groups).
// The element library lives in canvas, so its aggregate registration lives here; editor/register.ts (the
// app-startup path) re-exports this, and canvas-level tests import it to populate the registry in-boundary.

import "@elements/text/text";
import "@elements/text/callout";
import "@elements/text/bullets";
import "@elements/text/quote";
import "@elements/text/code";

import "@elements/media/image";
import "@elements/media/video";
import "@elements/media/gif";
import "@elements/media/illustration";
import "@elements/media/sticker";
import "@elements/media/icon";
import "@elements/media/avatar";

import "@elements/table/table";
import "@elements/table/stat";

import "@elements/composite/card";
import "@elements/composite/group";
import "@elements/composite/feature";
import "@elements/composite/profile";
import "@elements/composite/testimonial";
import "@elements/composite/pricing";
import "@elements/composite/cta";
import "@elements/composite/faq";

import "@elements/basic/button";
import "@elements/basic/badge";
import "@elements/basic/embed";
import "@elements/basic/gradient";
import "@elements/basic/divider";
import "@elements/basic/spacer";
import "@elements/basic/shape";

import "@elements/chart/element";
import "@elements/diagram/element";

// The internal, palette-hidden drop-preview — a framework element (root of elements/), not a category.
import "@elements/dropghost";
