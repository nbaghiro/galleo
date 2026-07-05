import type { Component } from "solid-js";
import { createMemo, createSignal, For } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { resolveTheme, THEME_LIST } from "@themes/library";
import { themeCssVars } from "@themes/theme";
import { api } from "../data/api";
import { blankArtifact, FORMAT_IDS, formatLabel } from "../data/library";
import { ArrowUpRightIcon, RefreshIcon, SparkleIcon } from "../components/icons";
import { appTheme } from "../theme/theme";
import { Visual } from "../components/previews";
import "../components/visuals.css";
import { Dropdown } from "@editor/controls/Dropdown";
import { GenViewPicker } from "./gen-view";
import { DEMO_EXAMPLES } from "./demo";
import { startSession, type Surface } from "./session";

// The generation intake — one screen, not a wizard. A hero prompt that auto-derives editable chips,
// example-prompt starters, a surface + theme choice, and an optional context note, over an ambient
// theme-tinted abstract background. The screen wears the chosen artifact theme so picking a theme
// previews its look; "start blank" keeps the manual create path one click away.

const SURFACES: { id: Surface; label: string }[] = FORMAT_IDS.map((id) => ({
    id: id as Surface,
    label: formatLabel(id),
}));

const GOALS = ["Pitch", "Inform", "Sell", "Teach", "Report", "Announce"];
const AUDIENCES = ["Investors", "Customers", "Team", "Executives", "Students", "Public"];
const TONES = ["Bold", "Warm", "Technical", "Playful", "Formal", "Minimal"];
const LENGTHS = ["Short", "Standard", "In-depth"];

// clickable starters — fill the prompt + set the surface, chips auto-derive. In demo mode these are the
// hand-built fixtures (each prompt maps to a real artifact the replay reveals); shuffled so a refresh or
// the regenerate button swaps in a fresh set.
type Example = { surface: Surface; label: string; prompt: string };
const EXAMPLE_POOL: Example[] = DEMO_EXAMPLES.map((d) => ({
    surface: d.surface,
    label: d.label,
    prompt: d.prompt,
}));

const shuffle = <T,>(a: readonly T[]): T[] => {
    const arr = a.slice();
    for (let i = arr.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = arr[i] as T;
        arr[i] = arr[j] as T;
        arr[j] = tmp;
    }
    return arr;
};
// pick 6, preferring ones not currently shown so a regenerate visibly refreshes
const pickExamples = (exclude: ReadonlySet<string>): Example[] => {
    const fresh = EXAMPLE_POOL.filter((e) => !exclude.has(e.label));
    return shuffle(fresh.length >= 6 ? fresh : EXAMPLE_POOL).slice(0, 6);
};

// crude keyword inference — illustrative until the real planner reads the prompt
const infer = (
    prompt: string,
): { goal: string; audience: string; tone: string; length: string } => {
    const p = prompt.toLowerCase();
    const has = (...w: string[]): boolean => w.some((x) => p.includes(x));
    return {
        goal: has("pitch", "raise", "invest", "seed", "fund")
            ? "Pitch"
            : has("sell", "sales", "offer", "pricing")
              ? "Sell"
              : has("teach", "course", "lesson", "tutorial")
                ? "Teach"
                : has("report", "results", "quarter", "metrics")
                  ? "Report"
                  : has("launch", "announce", "introducing")
                    ? "Announce"
                    : "Inform",
        audience: has("invest", "vc", "seed")
            ? "Investors"
            : has("customer", "client", "buyer")
              ? "Customers"
              : has("team", "internal", "staff")
                ? "Team"
                : has("exec", "board", "leadership")
                  ? "Executives"
                  : has("student", "class", "learn")
                    ? "Students"
                    : "Public",
        tone: has("bold", "ambitious", "disrupt")
            ? "Bold"
            : has("technical", "engineer", "developer")
              ? "Technical"
              : has("fun", "playful", "casual")
                ? "Playful"
                : has("formal", "enterprise", "corporate")
                  ? "Formal"
                  : "Warm",
        length: has("short", "brief", "quick", "one-pager")
            ? "Short"
            : has("deep", "detailed", "comprehensive", "in-depth")
              ? "In-depth"
              : "Standard",
    };
};

export const IntakeView: Component = () => {
    const navigate = useNavigate();
    const [prompt, setPrompt] = createSignal("");
    const [note, setNote] = createSignal("");
    const [surface, setSurface] = createSignal<Surface>("deck");
    const [theme, setTheme] = createSignal(appTheme());
    const [busy, setBusy] = createSignal(false);

    // chips: auto-derived from the prompt unless the user has overridden them
    const [touched, setTouched] = createSignal<Record<string, boolean>>({});
    const [picks, setPicks] = createSignal(infer(""));
    const onPrompt = (v: string): void => {
        setPrompt(v);
        const auto = infer(v);
        const t = touched();
        setPicks((cur) => ({
            goal: t.goal ? cur.goal : auto.goal,
            audience: t.audience ? cur.audience : auto.audience,
            tone: t.tone ? cur.tone : auto.tone,
            length: t.length ? cur.length : auto.length,
        }));
    };
    const setChip = (key: "goal" | "audience" | "tone" | "length", val: string): void => {
        setTouched((t) => ({ ...t, [key]: true }));
        setPicks((c) => ({ ...c, [key]: val }));
    };
    let promptEl: HTMLTextAreaElement | undefined;
    const [examples, setExamples] = createSignal<Example[]>(EXAMPLE_POOL.slice(0, 6));
    const regenerate = (): void => {
        setExamples((cur) => pickExamples(new Set(cur.map((e) => e.label))));
    };
    // clicking an example fills the prompt (the user then edits / hits Generate) — focus + scroll the
    // field into view so the change is visible (it sits above the cards).
    const useExample = (e: Example): void => {
        setSurface(e.surface);
        setTouched({});
        onPrompt(e.prompt);
        promptEl?.focus({ preventScroll: true });
        promptEl?.scrollIntoView({ behavior: "smooth", block: "center" });
    };

    const rootStyle = createMemo(() => themeCssVars(resolveTheme(theme()).tokens));
    const canGo = createMemo(() => prompt().trim().length > 4);

    const generate = (): void => {
        if (!canGo()) return;
        const pk = picks();
        startSession({
            prompt: note().trim() ? `${prompt().trim()}\n\n${note().trim()}` : prompt().trim(),
            surface: surface(),
            theme: theme(),
            goal: pk.goal,
            audience: pk.audience,
            tone: pk.tone,
            length: pk.length,
        });
        navigate("/generate");
    };

    const startBlank = async (): Promise<void> => {
        setBusy(true);
        try {
            const { id } = await api.createArtifact({
                title: `Untitled ${formatLabel(surface()).toLowerCase()}`,
                formatId: surface(),
                themeId: theme(),
                draftContent: blankArtifact(surface(), theme()),
            });
            navigate(`/edit/${id}`);
        } catch {
            setBusy(false);
        }
    };

    const Chip = (p: {
        label: string;
        value: string;
        options: string[];
        onPick: (v: string) => void;
    }) => (
        <div class="inline-flex items-center gap-1.5 rounded-full border border-line bg-canvas py-1.5 pl-3 pr-1.5 text-[12.5px] text-soft">
            <span class="font-mono text-[10px] uppercase tracking-[0.1em] text-muted">
                {p.label}
            </span>
            <Dropdown
                compact
                value={p.value}
                options={p.options.map((o) => ({ label: o, value: o }))}
                onChange={p.onPick}
            />
        </div>
    );

    return (
        <div
            class="relative flex h-full w-full items-start justify-center overflow-y-auto bg-canvas px-6 py-[6vh] text-ink"
            style={rootStyle()}
        >
            {/* ambient theme-tinted abstract background — concentrated at the edges so the form stays clean */}
            <div
                class="pointer-events-none absolute inset-0 z-0"
                style={{
                    opacity: "0.4",
                    "-webkit-mask-image":
                        "radial-gradient(120% 90% at 50% 38%, transparent 18%, #000 78%)",
                    "mask-image": "radial-gradient(120% 90% at 50% 38%, transparent 18%, #000 78%)",
                }}
            >
                <Visual viz="aurora" />
            </div>

            <div class="relative z-10 w-full max-w-[960px]">
                <button
                    class="mb-7 inline-flex items-center gap-1.5 text-[12.5px] text-muted transition hover:text-ink"
                    onClick={() => navigate("/")}
                >
                    ← Library
                </button>

                <div class="mb-2 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.16em] text-accent">
                    <SparkleIcon size={14} /> Generate
                </div>
                <h1
                    class="font-display text-[40px] leading-[1.05] text-ink"
                    style={{ "font-weight": "var(--hw)" }}
                >
                    What do you want to make?
                </h1>
                <p class="mb-7 mt-2 max-w-[52ch] text-[14.5px] text-soft">
                    Describe it in a sentence or two — the more context, the more real it feels. Or
                    start from an example below.
                </p>

                {/* hero prompt */}
                <div class="rounded-[var(--radius)] border border-accent/25 bg-panel p-5 shadow-[var(--shadow)] transition focus-within:border-accent/50 focus-within:ring-2 focus-within:ring-accent/15">
                    <textarea
                        ref={(el) => (promptEl = el)}
                        class="h-28 w-full resize-none bg-transparent text-[15.5px] leading-relaxed text-ink outline-none placeholder:text-muted"
                        placeholder="e.g. An investor pitch deck for Aldon — we turn idle commercial HVAC into virtual power plants. Raising a $6M seed, for climate + infra VCs. Bold but credible."
                        value={prompt()}
                        onInput={(e) => onPrompt(e.currentTarget.value)}
                        onKeyDown={(e) => {
                            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") generate();
                        }}
                    />
                    <div class="mt-2 flex flex-wrap items-center gap-2">
                        <div class="inline-flex rounded-full border border-line p-0.5">
                            <For each={SURFACES}>
                                {(s) => (
                                    <button
                                        class={`rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold transition ${surface() === s.id ? "bg-accent text-onaccent" : "text-soft hover:text-ink"}`}
                                        onClick={() => setSurface(s.id)}
                                    >
                                        {s.label}
                                    </button>
                                )}
                            </For>
                        </div>
                        <Chip
                            label="Goal"
                            value={picks().goal}
                            options={GOALS}
                            onPick={(v) => setChip("goal", v)}
                        />
                        <Chip
                            label="Who"
                            value={picks().audience}
                            options={AUDIENCES}
                            onPick={(v) => setChip("audience", v)}
                        />
                        <Chip
                            label="Tone"
                            value={picks().tone}
                            options={TONES}
                            onPick={(v) => setChip("tone", v)}
                        />
                        <Chip
                            label="Length"
                            value={picks().length}
                            options={LENGTHS}
                            onPick={(v) => setChip("length", v)}
                        />
                    </div>
                </div>

                {/* example starters */}
                <div class="mb-2.5 mt-7 flex items-center justify-between">
                    <span class="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
                        Start from an example
                    </span>
                    <button
                        class="group grid h-7 w-7 place-items-center rounded-lg text-muted transition hover:bg-panel hover:text-accent"
                        title="New examples"
                        onClick={regenerate}
                    >
                        <span class="transition-transform duration-300 group-hover:-rotate-180">
                            <RefreshIcon size={14} />
                        </span>
                    </button>
                </div>
                <div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    <For each={examples()}>
                        {(e) => (
                            <button
                                class="group flex flex-col gap-2 rounded-[var(--radius)] border border-line bg-panel/80 p-3.5 text-left backdrop-blur-sm transition hover:-translate-y-0.5 hover:border-accent/50 hover:shadow-[var(--shadow)]"
                                onClick={() => useExample(e)}
                            >
                                <div class="flex items-center justify-between">
                                    <span class="font-mono text-[9.5px] uppercase tracking-[0.12em] text-accent">
                                        {formatLabel(e.surface)}
                                    </span>
                                    <span class="text-muted transition group-hover:text-accent">
                                        <ArrowUpRightIcon size={14} />
                                    </span>
                                </div>
                                <div class="text-[13.5px] font-semibold text-ink">{e.label}</div>
                                <div class="line-clamp-2 text-[11.5px] leading-snug text-muted">
                                    {e.prompt}
                                </div>
                            </button>
                        )}
                    </For>
                </div>

                {/* context + theme — matched heights */}
                <div class="mt-7 grid gap-3 sm:grid-cols-[1fr_auto]">
                    <textarea
                        class="h-[124px] resize-none rounded-[var(--radius)] border border-line bg-panel/80 p-3.5 text-[13px] text-ink outline-none backdrop-blur-sm placeholder:text-muted"
                        placeholder="Add detail or paste notes (optional) — facts, names, numbers, or a doc/link to ground it in."
                        value={note()}
                        onInput={(e) => setNote(e.currentTarget.value)}
                    />
                    {/* every editor theme, with the same surface·ink·accent swatch the editor uses */}
                    <div class="flex h-[124px] flex-col rounded-[var(--radius)] border border-line bg-panel/80 p-3.5 backdrop-blur-sm sm:w-[284px]">
                        <div class="mb-2.5 flex flex-none items-center justify-between gap-2">
                            <span class="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
                                Theme
                            </span>
                            <span class="truncate text-[11px] font-semibold text-soft">
                                {resolveTheme(theme()).name}
                            </span>
                        </div>
                        <div class="flex min-h-0 flex-1 flex-wrap content-start gap-1.5 overflow-y-auto">
                            <For each={THEME_LIST}>
                                {(t) => (
                                    <button
                                        class={`h-6 w-6 flex-none overflow-hidden rounded-full border-2 transition hover:scale-110 ${theme() === t.id ? "border-accent" : "border-line"}`}
                                        title={`${t.name} · ${t.tag}`}
                                        onClick={() => setTheme(t.id)}
                                    >
                                        <span class="flex h-full w-full">
                                            <span
                                                class="h-full w-1/2"
                                                style={{ background: t.tokens.surface }}
                                            />
                                            <span
                                                class="h-full w-1/4"
                                                style={{ background: t.tokens.ink }}
                                            />
                                            <span
                                                class="h-full w-1/4"
                                                style={{ background: t.tokens.accent }}
                                            />
                                        </span>
                                    </button>
                                )}
                            </For>
                        </div>
                    </div>
                </div>

                {/* actions */}
                <div class="mt-7 flex items-center gap-4 pb-4">
                    <button
                        class="inline-flex items-center gap-2 rounded-full bg-accent px-7 py-3 text-[14px] font-semibold text-onaccent shadow-[var(--shadow)] transition hover:brightness-105 disabled:opacity-40"
                        disabled={!canGo() || busy()}
                        onClick={generate}
                    >
                        <SparkleIcon size={15} /> Generate
                    </button>
                    <span class="hidden items-center gap-1.5 text-[11px] text-muted sm:inline-flex">
                        <kbd class="grid h-[22px] min-w-[22px] place-items-center rounded-[7px] border border-line bg-canvas px-1.5 font-mono text-[11px] leading-none text-soft">
                            ⌘
                        </kbd>
                        <kbd class="grid h-[22px] min-w-[22px] place-items-center rounded-[7px] border border-line bg-canvas px-1.5 font-mono text-[11px] leading-none text-soft">
                            ↵
                        </kbd>
                        to generate
                    </span>
                    <button
                        class="ml-auto text-[13px] text-soft transition hover:text-ink disabled:opacity-40"
                        disabled={busy()}
                        onClick={() => startBlank()}
                    >
                        or start blank →
                    </button>
                </div>
            </div>
            <GenViewPicker />
        </div>
    );
};
