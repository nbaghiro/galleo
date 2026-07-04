import type { Component } from "solid-js";
import { createSignal, Show } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { api } from "../data/api";
import { SparkleIcon } from "./icons";

// Dev-only: trigger the REAL generation pipeline (plan → write → images), not the client-side simulator,
// straight from the UI — so prompt tuning happens in the browser instead of `pnpm agent:gen`. Mounted
// behind `import.meta.env.DEV` and backed by the dev-only /dev/generate route. Generates (~20s), then
// opens the new artifact in the editor.

const SURFACES = ["deck", "doc", "web"] as const;
const QUALITIES = ["auto", "fast", "balanced", "best"] as const;
const field =
    "rounded-md border border-line bg-canvas px-2 py-1.5 text-[12px] text-ink outline-none focus:border-accent";

export const DevGenerate: Component = () => {
    const navigate = useNavigate();
    const [open, setOpen] = createSignal(false);
    const [prompt, setPrompt] = createSignal("");
    const [surface, setSurface] = createSignal<(typeof SURFACES)[number]>("deck");
    const [theme, setTheme] = createSignal("studio");
    const [quality, setQuality] = createSignal<(typeof QUALITIES)[number]>("balanced");
    const [busy, setBusy] = createSignal(false);
    const [error, setError] = createSignal<string | null>(null);

    const run = async (): Promise<void> => {
        if (!prompt().trim() || busy()) return;
        setBusy(true);
        setError(null);
        try {
            const { id } = await api.devGenerate({
                prompt: prompt().trim(),
                surface: surface(),
                theme: theme().trim() || "studio",
                quality: quality(),
            });
            navigate(`/edit/${id}`);
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
            setBusy(false);
        }
    };

    return (
        <div class="fixed bottom-4 right-4 z-50 font-mono">
            <Show
                when={open()}
                fallback={
                    <button
                        onClick={() => setOpen(true)}
                        class="flex items-center gap-1.5 rounded-lg border border-line bg-panel px-3 py-2 text-[12px] text-soft shadow-lg transition-colors hover:text-ink"
                        title="Dev: run the real generation pipeline"
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
                        disabled={busy()}
                        onInput={(e) => setPrompt(e.currentTarget.value)}
                    />
                    <div class="mt-2 grid grid-cols-3 gap-1.5">
                        <select
                            class={field}
                            value={surface()}
                            disabled={busy()}
                            onChange={(e) =>
                                setSurface(e.currentTarget.value as (typeof SURFACES)[number])
                            }
                        >
                            {SURFACES.map((s) => (
                                <option value={s}>{s}</option>
                            ))}
                        </select>
                        <input
                            class={field}
                            value={theme()}
                            disabled={busy()}
                            placeholder="theme"
                            onInput={(e) => setTheme(e.currentTarget.value)}
                        />
                        <select
                            class={field}
                            value={quality()}
                            disabled={busy()}
                            onChange={(e) =>
                                setQuality(e.currentTarget.value as (typeof QUALITIES)[number])
                            }
                        >
                            {QUALITIES.map((qq) => (
                                <option value={qq}>{qq}</option>
                            ))}
                        </select>
                    </div>
                    <button
                        onClick={() => run()}
                        disabled={busy() || !prompt().trim()}
                        class="mt-2 flex w-full items-center justify-center gap-1.5 rounded-md bg-accent px-3 py-2 text-[12px] font-semibold text-onaccent transition-opacity disabled:opacity-50"
                    >
                        <SparkleIcon size={14} /> {busy() ? "Generating…" : "Generate"}
                    </button>
                    <Show when={error()}>
                        <p class="mt-2 text-[11px]" style={{ color: "#e5674f" }}>
                            {error()}
                        </p>
                    </Show>
                    <p class="mt-2 text-[10px] leading-snug text-muted">
                        Real pipeline (~20s) → opens in the editor. Dev-only.
                    </p>
                </div>
            </Show>
        </div>
    );
};
