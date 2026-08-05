import { createSignal } from "solid-js";
import { viewportTier } from "@ui/viewport";
import type { Surface } from "../../stores/generate";
import { frameWidthFor } from "./layout";

export const reduced = (): boolean =>
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

// the longest land animation (image de-blur); the board waits it out
export const REVEAL_MS = 640;
// deliberate linger before the board moves on: reading time, not lag
export const DWELL_MS = 500;

// shared by the compose panel's format selector and the board's live view-toggle
const [previewFormat, setPreviewFormat] = createSignal<Surface>("deck");
export { previewFormat, setPreviewFormat };

// the console rail's open state, remembered between runs
const RAIL_KEY = "galleo:generate:rail";
const store = (): Storage | null => (typeof localStorage === "undefined" ? null : localStorage);
export const RAIL_WIDTH = 352; // w-88 in px; must stay in sync with the rail's class

const [railOpen, setRailOpen] = createSignal(store()?.getItem(RAIL_KEY) !== "closed");
export { railOpen };

export function toggleRail(): void {
    const next = !railOpen();
    setRailOpen(next);
    store()?.setItem(RAIL_KEY, next ? "open" : "closed");
}

export const frameWidth = (avail: number): number =>
    frameWidthFor(avail, previewFormat(), viewportTier());

// On a phone the console is the whole body, so the board it covers stays mounted (its paint lives in
// its refs) and hides with CSS.
const [phonePane, setPhonePane] = createSignal<"board" | "chat">("board");
export { phonePane };

export function togglePhonePane(): void {
    setPhonePane((p) => (p === "board" ? "chat" : "board"));
}

export const BEAT_ROLES = ["scene", "tension", "turn", "proof", "momentum", "close", "detail"];

export const LAYOUT_LABELS: Record<string, string> = {
    full: "Full",
    "split-6040": "60 · 40",
    "split-4060": "40 · 60",
    "two-col": "50 · 50",
    "three-up": "Thirds",
};
