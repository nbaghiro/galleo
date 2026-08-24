import type { Component } from "solid-js";
import { Show } from "solid-js";
import { PresentSurface } from "@ui/present";
import { createNotesRunner } from "./core/notes";
import {
    canEdit,
    editor,
    exitPresent,
    getNarration,
    getSoundtrack,
    notePresentProgress,
    presenting,
    presentWithVoice,
} from "./core/store";

// The surface itself is @ui/present, shared with /present/:id and the published viewer, so the
// editor's rehearsal is the same paint and the same pagination its audience gets.

const Overlay: Component = () => {
    const runner = createNotesRunner();

    // Nothing here has to be prepared: pressing play writes the script for the section it is about
    // to speak, records it, and fills the rest of the piece in behind the voice. This action stays
    // for the presenter who wants the whole script written up front, before an audience is watching.
    const notesActions = (): { label: string; run: () => void; busy?: boolean }[] =>
        canEdit() && runner.canWrite()
            ? [
                  {
                      label: runner.writing() ? "Writing…" : "Write notes for this piece",
                      run: () => void runner.writeWithAi("all"),
                      busy: !!runner.writing(),
                  },
              ]
            : [];

    return (
        <PresentSurface
            artifact={editor.artifact}
            autoFullscreen
            overview
            notes
            where="editor"
            autoNarrate={presentWithVoice()}
            notesActions={notesActions}
            notesError={runner.error}
            narration={getNarration()}
            scriptable={canEdit() && runner.canWrite()}
            soundtrack={getSoundtrack()}
            onExit={exitPresent}
            onFullscreenExit={exitPresent}
            onProgress={notePresentProgress}
        />
    );
};

// mounted only while presenting, so the runner's abort controller dies with the overlay
export const Present: Component = () => (
    <Show when={presenting()}>
        <Overlay />
    </Show>
);
