import type { JSX, Component } from "solid-js";
import { createMemo, Show } from "solid-js";
import type { Tokens } from "@themes";
import { themeCssVars } from "@themes";
import { Canvas } from "./canvas/Canvas";
import { DataEditor } from "./inspect/DataEditor";
import { DragGhost } from "./canvas/insert";
import { editorTokens, leftOpen, setLeftOpen } from "./editor";
import { IconButton } from "@ui/button";
import { Icon, UiThemeProvider } from "@ui/icons";
import { Minimap } from "./chrome/Minimap";
import { Panel } from "./chrome/Panel";
import { Present } from "./canvas/Present";
import { Topbar } from "./chrome/Topbar";

// A theme-independent floating-overlay depth, so panels always read as lifted above the canvas. Kept
// compact (small offset + spread) so the whole shadow fits within a panel's margin inside the
// overflow-hidden canvas — otherwise a tall panel (the Minimap) has its shadow clipped by the container.
const BASE_PANEL_SHADOW = "0 8px 24px -8px rgba(0,0,0,0.5)";

// A dampened echo of the theme's card shadow — reduce every color's alpha by `k`, so a glow / hard-offset /
// soft-lift theme tints the panel chrome but a step softer than its content sections (chrome < content).
function dampenShadow(shadow: string | undefined, k: number): string {
    if (!shadow || shadow === "none") return "";
    return shadow
        .replace(/rgba?\(([^)]+)\)/g, (_m, inner: string) => {
            const p = inner.split(",").map((x) => x.trim());
            const a = (p.length === 4 ? parseFloat(p[3]!) : 1) * k;
            return `rgba(${p[0]}, ${p[1]}, ${p[2]}, ${a.toFixed(3)})`;
        })
        .replace(/#([0-9a-fA-F]{6})\b/g, (_m, hex: string) => {
            const n = (i: number): number => parseInt(hex.slice(i, i + 2), 16);
            return `rgba(${n(0)}, ${n(2)}, ${n(4)}, ${k.toFixed(3)})`;
        });
}

// The floating-panel shadow: base depth + the dampened theme echo (an empty theme shadow → just the depth).
function panelShadow(t: Tokens): string {
    const echo = dampenShadow(t.shadow, 0.6);
    return echo ? `${BASE_PANEL_SHADOW}, ${echo}` : BASE_PANEL_SHADOW;
}

// The studio shell: topbar over a canvas with floating panels. The chrome follows the artifact's
// theme by overriding the shared theme CSS variables on the root. (Persistence lives in the app.)
export const Studio: Component = () => {
    const vars = createMemo(
        (): JSX.CSSProperties =>
            ({
                ...themeCssVars(editorTokens()),
                "--panel-shadow": panelShadow(editorTokens()),
            }) as JSX.CSSProperties,
    );

    return (
        <UiThemeProvider tokens={editorTokens}>
            <div
                class="grid h-screen grid-rows-[52px_1fr] overflow-hidden bg-canvas text-ink"
                style={vars()}
            >
                <Topbar />
                <div class="relative min-h-0 overflow-hidden">
                    <Canvas />
                    <Show
                        when={leftOpen()}
                        fallback={
                            <IconButton
                                size="xl"
                                bordered
                                tone="muted"
                                rounded="xl"
                                class="absolute left-3 top-1/2 z-panel -translate-y-1/2 bg-panel/95 shadow-lg backdrop-blur-md"
                                title="Sections"
                                onClick={() => setLeftOpen(true)}
                            >
                                <Icon name="sections" />
                            </IconButton>
                        }
                    >
                        <Minimap />
                    </Show>
                    <Panel />
                </div>
                <DragGhost />
                <Present />
                <DataEditor />
            </div>
        </UiThemeProvider>
    );
};
