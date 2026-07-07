// Side-effect imports that register every element into the registry — one per element file, grouped by
// category (mirrors the canvas/elements/<category>/ folders + the palette groups). Import once at startup
// (app/main.tsx imports it before mount).

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
import "@elements/basic/dropghost";

import "@elements/chart/element";
import "@elements/diagram/element";
