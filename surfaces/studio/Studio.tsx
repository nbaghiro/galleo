import type { JSX } from "solid-js";
import type { Component } from "solid-js";
import { createEffect, createMemo, Show } from "solid-js";
import { resolveTheme } from "@themes/library";
import { AgentPanel } from "./AgentPanel";
import { Canvas } from "./Canvas";
import { DragGhost } from "./DragGhost";
import { demoId, editor, leftOpen, saveDoc, setLeftOpen } from "./editor";
import { Icon } from "./icons";
import { Minimap } from "./Minimap";
import { Panel } from "./Panel";
import { Present } from "./Present";
import { Topbar } from "./Topbar";

// The studio shell: topbar over a three-column body (minimap · canvas · right panel). The chrome
// follows the artifact's theme by overriding Tailwind's color variables on the root.
export const Studio: Component = () => {
    // Debounced autosave of the current doc.
    let saveTimer = 0;
    createEffect(() => {
        const art = editor.artifact;
        const id = demoId();
        window.clearTimeout(saveTimer);
        saveTimer = window.setTimeout(() => saveDoc(id, art), 500);
    });

    const vars = createMemo((): JSX.CSSProperties => {
        const tk = resolveTheme(editor.artifact.theme).tokens;
        return {
            "--color-canvas": tk.bg,
            "--color-panel": tk.surface,
            "--color-line": tk.line,
            "--color-ink": tk.ink,
            "--color-muted": tk.muted,
            "--color-accent": tk.accent,
            "--color-onaccent": tk.onAccent,
        };
    });

    return (
        <div class="grid h-screen grid-rows-[52px_1fr] overflow-hidden bg-canvas text-ink" style={vars()}>
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
        </div>
    );
};
