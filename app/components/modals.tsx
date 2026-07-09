// The create-artifact modal — a hero card for the AI flow + the three blank formats, built on the shared
// @ui Modal shell (theme snapshot via overlayThemeVars so it stays themed at the app root). The confirm
// dialog is @ui's `ConfirmModal`, used directly at the call sites (no wrapper needed).

import type { Component, JSX } from "solid-js";
import { For } from "solid-js";
import { CloseIcon, DeckIcon, DocIcon, SiteIcon, SparkleIcon } from "@ui/icons";
import { overlayThemeVars } from "../theme";
import { Modal } from "@ui/overlay";
import { Eyebrow, IconButton } from "@ui/button";

const FORMATS: { id: string; label: string; desc: string; icon: () => JSX.Element }[] = [
    { id: "deck", label: "Deck", desc: "Slides", icon: () => <DeckIcon size={20} /> },
    { id: "doc", label: "Doc", desc: "A document", icon: () => <DocIcon size={20} /> },
    { id: "web", label: "Site", desc: "A web page", icon: () => <SiteIcon size={20} /> },
];

// The "New artifact" create dialog — a hero card for the AI flow + the three blank formats one click away.
export const CreateModal: Component<{
    onClose: () => void;
    onGenerate: () => void;
    onBlank: (fmt: string) => void;
}> = (props) => (
    <Modal onClose={props.onClose} size="md" scrim="blur" vars={overlayThemeVars()} class="p-6">
        <div class="mb-5 flex items-center justify-between">
            <h2 class="font-display text-[22px] text-ink" style={{ "font-weight": "var(--hw)" }}>
                Create something
            </h2>
            <IconButton onClick={props.onClose}>
                <CloseIcon size={15} />
            </IconButton>
        </div>

        {/* hero — generate with AI */}
        <button
            class="group mb-5 flex w-full items-center gap-4 rounded-[var(--radius)] border border-accent/40 bg-accent/10 p-5 text-left transition hover:bg-accent/15"
            onClick={props.onGenerate}
        >
            <span class="grid h-11 w-11 flex-none place-items-center rounded-xl bg-accent text-onaccent">
                <SparkleIcon size={20} />
            </span>
            <span class="min-w-0 flex-1">
                <span class="block text-[15px] font-semibold text-ink">Generate with AI</span>
                <span class="block text-[12.5px] text-soft">
                    Describe it — watch it build into a finished draft.
                </span>
            </span>
            <span class="flex-none text-[18px] text-accent transition-transform group-hover:translate-x-0.5">
                →
            </span>
        </button>

        <Eyebrow as="div" tracking="wider" class="mb-3">
            Or start from blank
        </Eyebrow>
        <div class="grid grid-cols-3 gap-3">
            <For each={FORMATS}>
                {(f) => (
                    <button
                        class="flex flex-col items-center gap-2 rounded-[var(--radius)] border border-line bg-canvas p-4 text-soft transition hover:border-accent hover:text-ink"
                        onClick={() => props.onBlank(f.id)}
                    >
                        <span class="text-muted">{f.icon()}</span>
                        <span class="text-[13px] font-semibold text-ink">{f.label}</span>
                        <span class="text-[11px] text-muted">{f.desc}</span>
                    </button>
                )}
            </For>
        </div>
    </Modal>
);
