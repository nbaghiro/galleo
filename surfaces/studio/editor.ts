import type { Region } from "@engine/render-command";
import type { ElementAddress, Target } from "@model/address";
import type { ArtifactContent } from "@model/content";
import { createSignal } from "solid-js";
import { createStore } from "solid-js/store";
import { targetsEqual } from "@model/address";
import { artifact as demo } from "./demo-artifact";

// The editor's reactive state: the open artifact + computed section offsets, the current selection /
// hover target, and the geometry regions the canvas reports (in canvas-content coordinates).

interface EditorState {
    artifact: ArtifactContent;
    sectionTops: number[];
}

export const [editor, setEditor] = createStore<EditorState>({ artifact: demo, sectionTops: [] });

const [canvasEl, setCanvasEl] = createSignal<HTMLElement | null>(null);
export { canvasEl, setCanvasEl };

export const [regions, setRegions] = createSignal<Region[]>([]);
export const [selection, setSelection] = createSignal<Target | null>(null, { equals: targetsEqual });
export const [hover, setHover] = createSignal<Target | null>(null, { equals: targetsEqual });

// Snapshot history. Every structural edit goes through commit() so undo/redo work uniformly.
const past: ArtifactContent[] = [];
const future: ArtifactContent[] = [];

export function commit(next: ArtifactContent): void {
    past.push(editor.artifact);
    future.length = 0;
    setEditor("artifact", next);
}

export function undo(): void {
    const prev = past.pop();
    if (prev === undefined) return;
    future.push(editor.artifact);
    setEditor("artifact", prev);
}

export function redo(): void {
    const next = future.pop();
    if (next === undefined) return;
    past.push(editor.artifact);
    setEditor("artifact", next);
}

// Inline text editing: live keystrokes update the artifact WITHOUT touching history; one history
// entry is recorded for the whole edit when it ends (so undo restores the pre-edit text).
const [editing, setEditing] = createSignal<ElementAddress | null>(null);
export { editing };

let editBefore: ArtifactContent | null = null;

export function startEditing(addr: ElementAddress): void {
    editBefore = editor.artifact;
    setEditing(addr);
}

export function stopEditing(): void {
    if (editBefore && editBefore !== editor.artifact) {
        past.push(editBefore);
        future.length = 0;
    }
    editBefore = null;
    setEditing(null);
}

export function setArtifactLive(next: ArtifactContent): void {
    setEditor("artifact", next);
}

export function jumpToSection(index: number): void {
    const el = canvasEl();
    if (!el) return;
    const top = editor.sectionTops[index] ?? 0;
    el.scrollTo({ top: Math.max(0, top - 18), behavior: "smooth" });
}
