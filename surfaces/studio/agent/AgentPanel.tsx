// The generate panel + its local, deterministic preview generator (a stand-in for the real LLM pipeline).

import type { Component } from "solid-js";
import { Show } from "solid-js";
import { agentOpen, editor, loadGenerated, setAgentOpen } from "../editor";
import { Icon } from "../icons";
import type { ArtifactContent } from "@model/artifact";
import {
    bgImage,
    bullets,
    button,
    cell,
    deck,
    empty,
    group,
    img,
    quote,
    section,
    stat,
    t,
} from "@model/authoring";

// The agent: describe a deck → a starter artifact (local preview generator for now).
export const AgentPanel: Component = () => {
    let ta!: HTMLTextAreaElement;
    const generate = (): void => {
        loadGenerated(generateFromPrompt(ta.value, editor.artifact.theme));
    };

    return (
        <Show when={agentOpen()}>
            <div
                class="fixed inset-0 z-40 flex items-start justify-center bg-black/30 pt-24"
                onClick={() => setAgentOpen(false)}
            >
                <div
                    class="w-[560px] rounded-2xl border border-line bg-panel p-5 shadow-2xl"
                    onClick={(e) => e.stopPropagation()}
                >
                    <div class="mb-1 flex items-center gap-1.5 text-[15px] font-semibold text-ink">
                        <Icon name="sparkle" size={15} /> Galleo Agent
                    </div>
                    <p class="mb-3 text-[13px] text-muted">
                        Describe the deck you want.{" "}
                        <span class="opacity-70">
                            Local preview generator — real AI lands with the backend.
                        </span>
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
                        <button
                            class="rounded-lg border border-line bg-canvas px-3 py-1.5 text-[12px] font-semibold text-ink"
                            onClick={() => setAgentOpen(false)}
                        >
                            Cancel
                        </button>
                        <button
                            class="inline-flex items-center gap-1.5 rounded-lg border border-accent bg-accent px-3 py-1.5 text-[12px] font-semibold text-onaccent"
                            onClick={generate}
                        >
                            <Icon name="sparkle" size={14} /> Generate deck
                        </button>
                    </div>
                </div>
            </div>
        </Show>
    );
};

// Local preview generator: turns a prompt into a starter deck deterministically. The real
// outline-first LLM generation arrives with the agent backend; this proves the flow.
export function generateFromPrompt(prompt: string, themeId: string): ArtifactContent {
    const title = (prompt.trim() || "Untitled deck").replace(/[.!?]+$/, "");
    const seed =
        title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .slice(0, 24) || "deck";
    const cap = title.length > 64 ? `${title.slice(0, 62)}…` : title;

    return deck(
        themeId,
        [
            section("g1", "full", {
                a: cell(
                    group(
                        t("GENERATED", "label"),
                        t(cap, "h1"),
                        t(
                            "A starting point — edit anything, switch the theme, or present it.",
                            "subtitle",
                        ),
                    ),
                ),
            }),
            section("g2", "split-6040", {
                a: cell(
                    group(
                        t("01 — Overview", "label"),
                        t("The big idea", "h2"),
                        t(
                            `Replace this with the core of ${title}. Galleo drafted the structure; you bring the substance.`,
                            "body",
                        ),
                    ),
                ),
                b: cell(img(`${seed}-1`, 0.82)),
            }),
            section("g3", "three-up", {
                a: cell(stat("3×", "faster to draft")),
                b: cell(stat("22", "themes to try")),
                c: cell(stat("1", "canonical artifact")),
            }),
            section("g4", "full", {
                a: cell(quote("Generated in seconds. Made yours in minutes.", `— ${title}`)),
            }),
            section("g5", "split-4060", {
                a: cell(img(`${seed}-2`, 1.05)),
                b: cell(
                    group(
                        t("02 — How it works", "label"),
                        t("Three steps", "h2"),
                        bullets(
                            "Describe it — Galleo drafts the outline",
                            "Drag in elements, edit text inline",
                            "Theme it and present",
                        ),
                    ),
                ),
            }),
            section("g6", "split-4060", {
                a: empty,
                b: cell(
                    group(t("Next", "label"), t("Make it yours.", "h2"), button("Start editing")),
                ),
            }),
        ],
        bgImage(`${seed}-cover`, 0.4),
    );
}
