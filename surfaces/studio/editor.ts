import type { ArtifactContent } from "@model/content";
import { createSignal } from "solid-js";
import { createStore } from "solid-js/store";
import { artifact as demo } from "./demo-artifact";

// The editor's reactive state. P1 holds the open artifact + computed section offsets; selection,
// history, and drag state land here in P2/P3.

interface EditorState {
    artifact: ArtifactContent;
    sectionTops: number[];
}

export const [editor, setEditor] = createStore<EditorState>({ artifact: demo, sectionTops: [] });

const [canvasEl, setCanvasEl] = createSignal<HTMLElement | null>(null);
export { canvasEl, setCanvasEl };

export function jumpToSection(index: number): void {
    const el = canvasEl();
    if (!el) return;
    const top = editor.sectionTops[index] ?? 0;
    el.scrollTo({ top: Math.max(0, top - 18), behavior: "smooth" });
}
