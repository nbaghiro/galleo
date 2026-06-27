import type { Region } from "@engine/render-command";
import type { ElementAddress, Target } from "@model/address";
import type { ArtifactContent, Section } from "@model/content";
import { createSignal } from "solid-js";
import { createStore } from "solid-js/store";
import { duplicateSection, insertSection, moveSection, removeSection } from "@elements/ops";
import { targetsEqual } from "@model/address";
import { DEMOS } from "./demos";

// The editor's reactive state: the open artifact + computed section offsets, the current selection /
// hover target, and the geometry regions the canvas reports (in canvas-content coordinates).

interface EditorState {
    artifact: ArtifactContent;
    sectionTops: number[];
}

const FIRST = DEMOS[0]!;

export const [editor, setEditor] = createStore<EditorState>({ artifact: FIRST.artifact, sectionTops: [] });

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

// Demo document switcher: load another sample artifact and reset transient editor state.
export const [demoId, setDemoId] = createSignal(FIRST.id);

export function loadDemo(id: string): void {
    const d = DEMOS.find((x) => x.id === id);
    if (!d) return;
    past.length = 0;
    future.length = 0;
    editBefore = null;
    setEditing(null);
    setSelection(null);
    setHover(null);
    setDemoId(id);
    setEditor("artifact", d.artifact);
}

// --- section management ---
function newSectionId(): string {
    return `s-${crypto.randomUUID().slice(0, 8)}`;
}

export function addSectionAfter(afterId: string | null): void {
    const sec: Section = { id: newSectionId(), grid: "full", cells: { a: {} } };
    const at = afterId
        ? editor.artifact.sections.findIndex((s) => s.id === afterId) + 1
        : editor.artifact.sections.length;
    commit(insertSection(editor.artifact, at, sec));
    setSelection({ kind: "section", section: sec.id });
}

export function duplicateSectionAt(id: string): void {
    commit(duplicateSection(editor.artifact, id, newSectionId()));
}

export function removeSectionAt(id: string): void {
    commit(removeSection(editor.artifact, id));
    setSelection(null);
}

export function moveSectionBy(id: string, delta: number): void {
    commit(moveSection(editor.artifact, id, delta));
}

// --- present mode ---
export const [presenting, setPresenting] = createSignal(false);
export const [slideIndex, setSlideIndex] = createSignal(0);

export function present(): void {
    setSlideIndex(0);
    setPresenting(true);
}
export function exitPresent(): void {
    setPresenting(false);
}
export function nextSlide(): void {
    setSlideIndex((i) => Math.min(editor.artifact.sections.length - 1, i + 1));
}
export function prevSlide(): void {
    setSlideIndex((i) => Math.max(0, i - 1));
}

export function jumpToSection(index: number): void {
    const el = canvasEl();
    if (!el) return;
    const top = editor.sectionTops[index] ?? 0;
    el.scrollTo({ top: Math.max(0, top - 18), behavior: "smooth" });
}
