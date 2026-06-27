import type { Component } from "solid-js";
import { createSignal, onMount, Show } from "solid-js";
import { Studio } from "@studio/Studio";
import { currentArtifactId, loadArtifactContent, onSwitchDoc, setDocs } from "@studio/editor";
import { api } from "./api";
import { installAutosave } from "./save";

// The signed-in editing experience: load the user's decks, open one, run the studio with autosave.
export const EditorView: Component = () => {
    const [ready, setReady] = createSignal(false);
    const [error, setError] = createSignal("");

    const switchTo = async (id: string): Promise<void> => {
        const { artifact } = await api.getDoc(id);
        loadArtifactContent(artifact.id, artifact.draftContent);
    };

    installAutosave(); // owned by this component

    onMount(() => {
        onSwitchDoc((id) => void switchTo(id));
        void (async () => {
            try {
                const { artifacts } = await api.listDocs();
                setDocs(artifacts.map((a) => ({ id: a.id, title: a.title, themeId: a.themeId })));
                if (artifacts[0]) await switchTo(artifacts[0].id);
                setReady(true);
            } catch (e) {
                setError(e instanceof Error ? e.message : "Could not load your decks");
            }
        })();
    });

    return (
        <Show
            when={ready()}
            fallback={
                <div class="flex h-full items-center justify-center text-[13px] text-muted">
                    {error() || "Loading your decks…"}
                </div>
            }
        >
            <Show
                when={currentArtifactId()}
                fallback={<div class="flex h-full items-center justify-center text-[13px] text-muted">No decks yet</div>}
            >
                <Studio />
            </Show>
        </Show>
    );
};
