import type { ArtifactContent, Section } from "@model/artifact";
import type { Beat as PlanBeat, TurnEvent, TurnRequest } from "@model/ai";
import { createStore } from "solid-js/store";
import { applyPatch } from "@model/ai";
import { insertSection } from "@elements/ops";
import { placeholderSection } from "@canvas/elements/blueprint";
import { commitOver, content, getSectionStreamer, setArtifactLive, setSelection } from "../editor";

// Insert-a-section flow — generate ONE new section into the open artifact, aware of the sections around it.
// The transient life of the new section lives here: a placeholder skeleton is painted live (no history) so
// its box scrolls in and the in-canvas "story assembles" animation has a frame to fill; the model's plan
// swaps the skeleton to the exact grid it will fill; and when the written section lands it replaces the
// placeholder as a single undo step. The app injects the SSE transport (onSectionStream) — the editor never
// imports the app.

// A fixed id for the one placeholder (only one generation runs at a time); never collides with a real id.
const PLACEHOLDER_ID = "__gen_new__";
export const PLACEHOLDER_SECTION_ID = PLACEHOLDER_ID;

export type SectionGenStage = "prompt" | "planning" | "writing" | "done" | "error";

interface SectionGenState {
    stage: SectionGenStage | null; // null → inactive
    afterId: string | null; // the section the new one follows (null → prepend at the top)
    beat: PlanBeat | null; // the planned beat (grid + blocks) driving the live skeleton
    caption: string; // the current narration line, shown in the animation
    error: string | null;
}

const [sectionGen, setSectionGen] = createStore<SectionGenState>({
    stage: null,
    afterId: null,
    beat: null,
    caption: "",
    error: null,
});
export { sectionGen };

export const sectionGenActive = (): boolean => sectionGen.stage !== null;
export const sectionGenGenerating = (): boolean =>
    sectionGen.stage === "planning" || sectionGen.stage === "writing";

let ctrl: AbortController | null = null;
let doneTimer = 0;

// Open the prompt popup anchored to the section the new one will follow (null → prepend at the very top).
export function openSectionPrompt(afterId: string | null): void {
    window.clearTimeout(doneTimer);
    ctrl?.abort();
    ctrl = null;
    removePlaceholder();
    setSectionGen({ stage: "prompt", afterId, beat: null, caption: "", error: null });
}

// Close / cancel — abort any in-flight turn, drop the transient placeholder, and go inactive.
export function closeSectionGen(): void {
    window.clearTimeout(doneTimer);
    ctrl?.abort();
    ctrl = null;
    removePlaceholder();
    setSectionGen({ stage: null, afterId: null, beat: null, caption: "", error: null });
}

function indexAfter(c: ArtifactContent, afterId: string | null): number {
    if (afterId == null) return 0;
    const i = c.sections.findIndex((s) => s.id === afterId);
    return i < 0 ? c.sections.length : i + 1;
}

function removePlaceholder(): void {
    const c = content();
    if (c.sections.some((s) => s.id === PLACEHOLDER_ID))
        setArtifactLive({ ...c, sections: c.sections.filter((s) => s.id !== PLACEHOLDER_ID) });
}

// Insert or update the transient placeholder skeleton at the anchor (live, no history).
function putPlaceholder(section: Section): void {
    const c = content();
    if (c.sections.some((s) => s.id === PLACEHOLDER_ID))
        setArtifactLive({
            ...c,
            sections: c.sections.map((s) => (s.id === PLACEHOLDER_ID ? section : s)),
        });
    else setArtifactLive(insertSection(c, indexAfter(c, sectionGen.afterId), section));
}

// Run the section turn: reserve the slot, stream plan → skeleton → written section, then land it as one step.
export async function runSectionGen(instruction: string): Promise<void> {
    const text = instruction.trim();
    const streamer = getSectionStreamer();
    if (!text || !streamer || sectionGenGenerating()) return;
    const afterId = sectionGen.afterId;
    const baseContent = content(); // the real artifact, without any placeholder

    // reserve the slot with a generic skeleton so its box scrolls in + holds height while planning
    putPlaceholder(placeholderSection({ id: PLACEHOLDER_ID, layout: "full" }));
    setSectionGen({ stage: "planning", caption: "Reading the surrounding sections", error: null });
    setSelection(null);

    ctrl = new AbortController();
    // A holder (not a bare `let`) so TS keeps the union — it's assigned only inside the event callback,
    // which control-flow analysis can't see, and would otherwise narrow a plain variable to `never`.
    const out: { section: Section | null } = { section: null };
    const request: TurnRequest = {
        kind: "section",
        input: { instruction: text, afterId, content: baseContent },
    };

    const onEvent = (ev: TurnEvent): void => {
        switch (ev.type) {
            case "narration":
                setSectionGen("caption", ev.text);
                break;
            case "plan": {
                const b = ev.beats[0];
                if (!b) break;
                setSectionGen({ beat: b, stage: "writing" });
                // swap the generic placeholder for the planned skeleton — the exact grid the writer fills
                putPlaceholder(
                    placeholderSection({
                        id: PLACEHOLDER_ID,
                        layout: b.layout,
                        blocks: b.blocks,
                        image: b.image,
                    }),
                );
                break;
            }
            case "patch":
                for (const op of ev.ops) if (op.op === "addSection") out.section = op.section;
                break;
            case "error":
                setSectionGen({ stage: "error", error: ev.message });
                break;
        }
    };

    try {
        await streamer(request, onEvent, ctrl.signal);
    } catch (e) {
        if (ctrl?.signal.aborted) {
            removePlaceholder();
            return; // canceled — nothing to report
        }
        setSectionGen({
            stage: "error",
            error: e instanceof Error ? e.message : "the section could not be generated",
        });
    } finally {
        ctrl = null;
    }

    if (sectionGen.stage === "error" || !out.section) {
        if (!out.section && sectionGen.stage !== "error")
            setSectionGen({ stage: "error", error: "no section was produced" });
        removePlaceholder();
        return;
    }

    // Success — play the brief "Section added" flourish over the still-present placeholder, THEN land the
    // real section: drop the placeholder from the live tree and commit the new one against the pre-generation
    // baseline, so a single undo removes it cleanly (and no placeholder is ever left behind in history).
    const landed = out.section;
    setSectionGen({ stage: "done" });
    doneTimer = window.setTimeout(() => {
        setArtifactLive(baseContent);
        commitOver(
            baseContent,
            applyPatch(baseContent, [{ op: "addSection", afterId, section: landed }]),
        );
        setSelection({ kind: "section", section: landed.id });
        setSectionGen({ stage: null, afterId: null, beat: null, caption: "", error: null });
    }, 800);
}
