import type { Component } from "solid-js";
import { createSignal, Show } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { startSession, type Surface } from "../generate/session";
import { SparkleIcon } from "./icons";

// Dev-only: kick off the REAL streaming generation (direction → plan → per-section + images via
// /api/turns) and drop into the narrated build view, so the artifact fills in section by section — not
// the client-side simulator. Mounted behind import.meta.env.DEV. Same pipeline as `pnpm agent:gen`.

const SURFACES: Surface[] = ["deck", "doc", "web"];
const field =
    "rounded-md border border-line bg-canvas px-2 py-1.5 text-[12px] text-ink outline-none focus:border-accent";

export const DevGenerate: Component = () => {
    const navigate = useNavigate();
    const [open, setOpen] = createSignal(false);
    const [prompt, setPrompt] = createSignal("");
    const [surface, setSurface] = createSignal<Surface>("deck");
    const [theme, setTheme] = createSignal("studio");

    const run = (): void => {
        if (!prompt().trim()) return;
        // Fire the real streaming session (it manages its own error state, never rejects), then jump to
        // the build view — it renders the artifact filling in section by section as events arrive.
        startSession(
            {
                prompt: prompt().trim(),
                surface: surface(),
                theme: theme().trim() || "studio",
                goal: "",
                audience: "",
                tone: "",
                length: "",
            },
            { demo: false },
        );
        setOpen(false);
        navigate("/generate");
    };

    return (
        <div class="fixed bottom-4 right-4 z-50 font-mono">
            <Show
                when={open()}
                fallback={
                    <button
                        onClick={() => setOpen(true)}
                        class="flex items-center gap-1.5 rounded-lg border border-line bg-panel px-3 py-2 text-[12px] text-soft shadow-lg transition-colors hover:text-ink"
                        title="Dev: run the real streaming generation pipeline"
                    >
                        <SparkleIcon size={14} /> dev gen
                    </button>
                }
            >
                <div class="w-80 rounded-xl border border-line bg-panel p-3 text-ink shadow-2xl">
                    <div class="mb-2 flex items-center justify-between">
                        <span class="text-[11px] font-semibold uppercase tracking-wider text-muted">
                            Dev · real generate
                        </span>
                        <button
                            onClick={() => setOpen(false)}
                            class="px-1 text-muted hover:text-ink"
                            title="Close"
                        >
                            ✕
                        </button>
                    </div>
                    <textarea
                        rows={3}
                        placeholder="Brief… e.g. a launch site for an indie synth-pop album, moody + late-night"
                        class={`w-full resize-y leading-snug ${field}`}
                        value={prompt()}
                        onInput={(e) => setPrompt(e.currentTarget.value)}
                        onKeyDown={(e) => {
                            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") run();
                        }}
                    />
                    <div class="mt-2 flex gap-1.5">
                        <select
                            class={`flex-1 ${field}`}
                            value={surface()}
                            onChange={(e) => setSurface(e.currentTarget.value as Surface)}
                        >
                            {SURFACES.map((s) => (
                                <option value={s}>{s}</option>
                            ))}
                        </select>
                        <input
                            class={`flex-1 ${field}`}
                            value={theme()}
                            placeholder="theme"
                            onInput={(e) => setTheme(e.currentTarget.value)}
                        />
                    </div>
                    <button
                        onClick={run}
                        disabled={!prompt().trim()}
                        class="mt-2 flex w-full items-center justify-center gap-1.5 rounded-md bg-accent px-3 py-2 text-[12px] font-semibold text-onaccent transition-opacity disabled:opacity-50"
                    >
                        <SparkleIcon size={14} /> Generate
                    </button>
                    <p class="mt-2 text-[10px] leading-snug text-muted">
                        Streams the real pipeline section by section, then opens in the editor.
                        Dev-only.
                    </p>
                </div>
            </Show>
        </div>
    );
};
