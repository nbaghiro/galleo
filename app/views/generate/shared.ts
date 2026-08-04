import { createSignal } from "solid-js";
import { resolveProfile } from "@engine/profile";
import type { Surface } from "../../stores/generate";

export const reduced = (): boolean =>
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

// the longest land animation (image de-blur); the board waits it out before scrolling onward
export const REVEAL_MS = 640;
// deliberate linger on the finished section before the board moves on — reading time, not lag
export const DWELL_MS = 500;

// shared by the compose panel's format selector and the board's live view-toggle
const [previewFormat, setPreviewFormat] = createSignal<Surface>("deck");
export { previewFormat, setPreviewFormat };

// the console rail's open state, remembered between runs — someone who works with it shut shouldn't
// have to shut it again every time
const RAIL_KEY = "galleo:generate:rail";
const store = (): Storage | null => (typeof localStorage === "undefined" ? null : localStorage);
export const RAIL_WIDTH = 352; // w-88, in px — the width the rail animates to

const [railOpen, setRailOpen] = createSignal(store()?.getItem(RAIL_KEY) !== "closed");
export { railOpen };

export function toggleRail(): void {
    const next = !railOpen();
    setRailOpen(next);
    store()?.setItem(RAIL_KEY, next ? "open" : "closed");
}

// format's maxContentWidth clamped to the board; web bleeds to fill
export const frameWidth = (avail: number): number => {
    const p = resolveProfile(previewFormat());
    return Math.max(
        320,
        p.id === "web" ? avail - 48 : Math.min(avail - 48, p.maxContentWidth ?? 1080),
    );
};

// the outline's narrative-role vocabulary (the beat editor's role picker)
export const BEAT_ROLES = ["scene", "tension", "turn", "proof", "momentum", "close", "detail"];

export const LAYOUT_LABELS: Record<string, string> = {
    full: "Full",
    "split-6040": "60 · 40",
    "split-4060": "40 · 60",
    "two-col": "50 · 50",
    "three-up": "Thirds",
};
