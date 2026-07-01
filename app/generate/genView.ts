import { createSignal } from "solid-js";
import { readLS, writeLS } from "../data/persist";

// Hidden dev switch for trying generation-view DIRECTIONS in-app (no visible control — for fast
// compare/contrast). The backtick (`) key (or ⌃⌥V) on the build screen opens a small picker; choosing a
// direction switches it + flashes a confirmation. Persisted to localStorage so it survives reloads + the
// next generation. Switching mid-build also works, since every direction reads the same session store.
export const GEN_VIEWS = ["console", "rail", "spotlight", "hud"] as const;
export type GenView = (typeof GEN_VIEWS)[number];
export const GEN_VIEW_LABEL: Record<GenView, string> = {
    console: "Console",
    rail: "Director's rail",
    spotlight: "Spotlight",
    hud: "HUD",
};
export const GEN_VIEW_DESC: Record<GenView, string> = {
    console: "Canvas over a docked terminal",
    rail: "Canvas + a right rail of beats",
    spotlight: "Spotlit slide + storyboard strip",
    hud: "Full-bleed canvas + a glass HUD",
};

const KEY = "galleo.genview";
const isGenView = (v: string): v is GenView => (GEN_VIEWS as readonly string[]).includes(v);
const stored = (): GenView => {
    const v = readLS(KEY) ?? "";
    return isGenView(v) ? v : "console";
};

const [genView, setGenViewRaw] = createSignal<GenView>(stored());
export { genView };

export function setGenView(v: GenView): void {
    setGenViewRaw(v);
    writeLS(KEY, v);
}
