import type { JSX, Component } from "solid-js";
import { createMemo, Show } from "solid-js";
import { themeCssVars } from "@themes";
import { AgentPanel } from "./chrome/AgentPanel";
import { Canvas } from "./canvas/Canvas";
import { DataEditor } from "./inspect/DataEditor";
import { DragGhost } from "./canvas/insert";
import { editorTokens, leftOpen, setLeftOpen } from "./editor";
import { Icon } from "./icons";
import { Minimap } from "./chrome/Minimap";
import { Panel } from "./chrome/Panel";
import { Present } from "./canvas/Present";
import { Topbar } from "./chrome/Topbar";

// The studio shell: topbar over a canvas with floating panels. The chrome follows the artifact's
// theme by overriding the shared theme CSS variables on the root. (Persistence lives in the app.)
export const Studio: Component = () => {
    const vars = createMemo(
        (): JSX.CSSProperties => themeCssVars(editorTokens()) as JSX.CSSProperties,
    );

    return (
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
                        <button
                            class="absolute left-3 top-1/2 z-20 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-xl border border-line bg-panel/95 text-muted shadow-lg backdrop-blur-md transition-colors hover:text-ink"
                            title="Sections"
                            onClick={() => setLeftOpen(true)}
                        >
                            <Icon name="sections" />
                        </button>
                    }
                >
                    <Minimap />
                </Show>
                <Panel />
            </div>
            <DragGhost />
            <Present />
            <AgentPanel />
            <DataEditor />
        </div>
    );
};
