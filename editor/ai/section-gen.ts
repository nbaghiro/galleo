import type { ArtifactContent, Section } from "@model/artifact";
import type { Beat as PlanBeat, TurnEvent, TurnRequest } from "@model/ai";
import { createStore } from "solid-js/store";
import { applyPatch } from "@model/ai";
import { insertSection } from "@elements/ops";
import { placeholderSection } from "@canvas/elements/blueprint";
import { commitOver, content, getSectionStreamer, setArtifactLive, setSelection } from "../editor";

// fixed id for the single placeholder (one gen at a time); never collides with a real id
const PLACEHOLDER_ID = "__gen_new__";
export const PLACEHOLDER_SECTION_ID = PLACEHOLDER_ID;

export type SectionGenStage = "prompt" | "planning" | "writing" | "done" | "error";

interface SectionGenState {
    stage: SectionGenStage | null;
    afterId: string | null;
    beat: PlanBeat | null;
    caption: string;
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

export function openSectionPrompt(afterId: string | null): void {
    window.clearTimeout(doneTimer);
    ctrl?.abort();
    ctrl = null;
    removePlaceholder();
    setSectionGen({ stage: "prompt", afterId, beat: null, caption: "", error: null });
}

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

function putPlaceholder(section: Section): void {
    const c = content();
    if (c.sections.some((s) => s.id === PLACEHOLDER_ID))
        setArtifactLive({
            ...c,
            sections: c.sections.map((s) => (s.id === PLACEHOLDER_ID ? section : s)),
        });
    else setArtifactLive(insertSection(c, indexAfter(c, sectionGen.afterId), section));
}

export async function runSectionGen(instruction: string): Promise<void> {
    const text = instruction.trim();
    const streamer = getSectionStreamer();
    if (!text || !streamer || sectionGenGenerating()) return;
    const afterId = sectionGen.afterId;
    const baseContent = content(); // the real artifact, without any placeholder

    // reserve the slot so its box scrolls in + holds height while planning
    putPlaceholder(placeholderSection({ id: PLACEHOLDER_ID, layout: "full" }));
    setSectionGen({ stage: "planning", caption: "Reading the surrounding sections", error: null });
    setSelection(null);

    ctrl = new AbortController();
    // holder, not a bare `let`: assigned only inside the callback, which CFA can't see → would narrow to `never`
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
            return;
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

    // land against the pre-generation baseline so one undo removes it cleanly (no placeholder left in history)
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
