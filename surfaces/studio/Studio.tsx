import type { JSX } from "solid-js";
import type { Component } from "solid-js";
import { createEffect, createMemo } from "solid-js";
import { resolveTheme } from "@themes/library";
import { Canvas } from "./Canvas";
import { DragGhost } from "./DragGhost";
import { demoId, editor, saveDoc } from "./editor";
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
        <div class="grid h-screen grid-rows-[52px_1fr] bg-canvas text-ink" style={vars()}>
            <Topbar />
            <div class="grid min-h-0 grid-cols-[188px_1fr_296px]">
                <Minimap />
                <Canvas />
                <Panel />
            </div>
            <DragGhost />
            <Present />
        </div>
    );
};
