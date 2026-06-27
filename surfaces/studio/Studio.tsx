import type { JSX } from "solid-js";
import type { Component } from "solid-js";
import { createEffect, createMemo, Show } from "solid-js";
import { resolveTheme } from "@themes/library";
import { AgentPanel } from "./AgentPanel";
import { Canvas } from "./Canvas";
import { DragGhost } from "./DragGhost";
import { demoId, editor, leftOpen, rightOpen, saveDoc, setLeftOpen, setRightOpen } from "./editor";
import { Minimap } from "./Minimap";
import { Panel } from "./Panel";
import { Present } from "./Present";
import { Topbar } from "./Topbar";

const reopenBtn = "absolute top-3 z-20 flex h-9 w-9 items-center justify-center rounded-xl border border-line bg-panel/95 text-[15px] text-muted shadow-lg backdrop-blur-md transition-colors hover:text-ink";

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
        <div class="grid h-screen grid-rows-[52px_1fr] bg-canvas text-ink" style={vars()}>
            <Topbar />
            <div class="relative min-h-0">
                <Canvas />
                <Show when={leftOpen()} fallback={<button class={`${reopenBtn} left-3`} title="Sections" onClick={() => setLeftOpen(true)}>▤</button>}>
                    <Minimap />
                </Show>
                <Show when={rightOpen()} fallback={<button class={`${reopenBtn} right-3`} title="Elements" onClick={() => setRightOpen(true)}>▦</button>}>
                    <Panel />
                </Show>
            </div>
            <DragGhost />
            <Present />
            <AgentPanel />
        </div>
    );
};
