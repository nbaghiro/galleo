import type { Component, JSX } from "solid-js";
import { For, onCleanup, onMount } from "solid-js";
import { CloseIcon, DeckIcon, DocIcon, SiteIcon, SparkleIcon } from "../components/icons";
import { overlayThemeVars } from "../theme/overlay-theme";

// The "New artifact" create dialog — a centered modal (not a dropdown) that gives the AI flow a hero card
// and keeps the three blank formats one click away. Rendered inside the themed app tree (fixed-position,
// not portalled) so it inherits the active theme tokens.
const FORMATS: { id: string; label: string; desc: string; icon: () => JSX.Element }[] = [
    { id: "deck", label: "Deck", desc: "Slides", icon: () => <DeckIcon size={20} /> },
    { id: "doc", label: "Doc", desc: "A document", icon: () => <DocIcon size={20} /> },
    { id: "web", label: "Site", desc: "A web page", icon: () => <SiteIcon size={20} /> },
];

export const CreateModal: Component<{
    onClose: () => void;
    onGenerate: () => void;
    onBlank: (fmt: string) => void;
}> = (props) => {
    const themeVars = overlayThemeVars(); // stamped once at open (snapshot)
    let panel!: HTMLDivElement;
    onMount(() => {
        const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
        if (!reduced)
            panel.animate(
                [
                    { opacity: 0, transform: "translateY(8px) scale(0.97)" },
                    { opacity: 1, transform: "none" },
                ],
                { duration: 200, easing: "cubic-bezier(.2,.7,.2,1)", fill: "both" },
            );
        const onKey = (e: KeyboardEvent): void => {
            if (e.key === "Escape") props.onClose();
        };
        window.addEventListener("keydown", onKey);
        onCleanup(() => window.removeEventListener("keydown", onKey));
    });

    return (
        <div
            class="fixed inset-0 z-50 flex items-center justify-center p-6 text-ink"
            style={themeVars}
        >
            <div class="absolute inset-0 bg-black/45 backdrop-blur-sm" onClick={props.onClose} />
            <div
                ref={panel}
                class="relative w-full max-w-[520px] rounded-[var(--radius)] border border-line bg-panel p-6 shadow-2xl"
            >
                <div class="mb-5 flex items-center justify-between">
                    <h2
                        class="font-display text-[22px] text-ink"
                        style={{ "font-weight": "var(--hw)" }}
                    >
                        Create something
                    </h2>
                    <button
                        class="grid h-7 w-7 place-items-center rounded-lg text-muted hover:bg-canvas hover:text-ink"
                        onClick={props.onClose}
                    >
                        <CloseIcon size={15} />
                    </button>
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
                        <span class="block text-[15px] font-semibold text-ink">
                            Generate with AI
                        </span>
                        <span class="block text-[12.5px] text-soft">
                            Describe it — watch it build into a finished draft.
                        </span>
                    </span>
                    <span class="flex-none text-[18px] text-accent transition-transform group-hover:translate-x-0.5">
                        →
                    </span>
                </button>

                <div class="mb-3 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
                    Or start from blank
                </div>
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
            </div>
        </div>
    );
};
