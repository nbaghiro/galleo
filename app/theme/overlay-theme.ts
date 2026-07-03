import type { JSX } from "solid-js";
import { useLocation } from "@solidjs/router";
import { editorTokens } from "@studio/editor";
import { themeCssVars } from "@themes/theme";

// App-level overlays (theme drawer, modals) mount at the app root, so they inherit the app-chrome theme.
// Floated over the editor that clashes with the editor-themed studio underneath — so they adopt the
// artifact/editor theme there instead, matching the surrounding surface (the same idea as the themed
// Dropdown). Off the editor they keep the app theme.

// The active editor/artifact theme as inline CSS vars, to apply on an overlay root.
export const editorThemeCssVars = (): JSX.CSSProperties =>
    themeCssVars(editorTokens()) as JSX.CSSProperties;

// Snapshot for a mount-on-open overlay (modal): the editor theme when over the editor, else undefined
// (keep the app theme). Call once in the component body — it reads location + theme untracked there, so
// the overlay is stamped at open and won't restyle while the theme is previewed/changed underneath.
export function overlayThemeVars(): JSX.CSSProperties | undefined {
    return useLocation().pathname.includes("/edit/") ? editorThemeCssVars() : undefined;
}
