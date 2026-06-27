import type { Component } from "solid-js";
import { Show } from "solid-js";
import { generateFromPrompt } from "./agent";
import { agentOpen, editor, loadGenerated, setAgentOpen } from "./editor";

// The agent: describe a deck → a starter artifact (local preview generator for now).
export const AgentPanel: Component = () => {
    let ta!: HTMLTextAreaElement;
    const generate = (): void => {
        loadGenerated(generateFromPrompt(ta.value, editor.artifact.theme));
    };

    return (
        <Show when={agentOpen()}>
            <div class="fixed inset-0 z-40 flex items-start justify-center bg-black/30 pt-24" onClick={() => setAgentOpen(false)}>
                <div class="w-[560px] rounded-2xl border border-line bg-panel p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
                    <div class="mb-1 text-[15px] font-semibold text-ink">✦ Galleo Agent</div>
                    <p class="mb-3 text-[13px] text-muted">
                        Describe the deck you want.{" "}
                        <span class="opacity-70">Local preview generator — real AI lands with the backend.</span>
                    </p>
                    <textarea
                        ref={ta}
                        rows={3}
                        autofocus
                        class="w-full resize-y rounded-lg border border-line bg-canvas p-3 text-[14px] leading-snug text-ink outline-none focus:border-accent"
                        placeholder="A seed pitch for an AI music app called Aria…"
                        onKeyDown={(e) => {
                            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") generate();
                        }}
                    />
                    <div class="mt-3 flex items-center justify-end gap-2">
                        <button class="rounded-lg border border-line bg-canvas px-3 py-1.5 text-[12px] font-semibold text-ink" onClick={() => setAgentOpen(false)}>
                            Cancel
                        </button>
                        <button class="rounded-lg border border-accent bg-accent px-3 py-1.5 text-[12px] font-semibold text-onaccent" onClick={generate}>
                            ✦ Generate deck
                        </button>
                    </div>
                </div>
            </div>
        </Show>
    );
};
