import type { Component } from "solid-js";
import {
    createEffect,
    createMemo,
    createSignal,
    For,
    Match,
    onCleanup,
    onMount,
    Show,
    Switch,
} from "solid-js";
import { useNavigate } from "@solidjs/router";
import { resolveTheme } from "@themes/library";
import { themeCssVars } from "@themes/theme";
import {
    CheckIcon,
    ChevronLeftIcon,
    ChevronUpIcon,
    CloseIcon,
    SparkleIcon,
} from "../components/icons";
import { BuildCanvas, HudCanvas, SpotlightCanvas } from "./build-canvases";
import { genView, GenViewPicker, reduced, TypingLine } from "./gen-view";
import { cancelSession, doneBeats, gen, resetSession, saveGenerated } from "./session";

// The narrated live build. The artifact materializes in a shared canvas (BuildCanvas); the chrome around
// it is the generation DIRECTION (Console / Director's rail / Spotlight), chosen by a hidden switch
// (backtick or ⌃⌥V — see genView.ts). The whole screen wears the artifact theme.
export const BuildView: Component = () => {
    const navigate = useNavigate();
    const [saving, setSaving] = createSignal(false);

    const rootStyle = createMemo(() => themeCssVars(resolveTheme(gen.theme).tokens));
    const doneCount = createMemo(doneBeats);
    const progress = createMemo(() => Math.round((doneCount() / (gen.beats.length || 1)) * 100));

    const open = async (): Promise<void> => {
        setSaving(true);
        const id = await saveGenerated();
        if (id) navigate(`/edit/${id}`);
        else setSaving(false);
    };
    const cancel = (): void => {
        resetSession();
        navigate("/");
    };

    onMount(() => {
        if (gen.phase === "idle") navigate("/new"); // landed here without a session
    });
    onCleanup(cancelSession);

    return (
        <div class="relative flex h-full w-full flex-col bg-canvas text-ink" style={rootStyle()}>
            <BuildTopbar
                progress={progress()}
                saving={saving()}
                onOpen={() => open()}
                onCancel={cancel}
            />
            <div class="min-h-0 flex-1">
                <Show
                    when={gen.phase === "error"}
                    fallback={
                        <Switch fallback={<ConsoleBody />}>
                            <Match when={genView() === "rail"}>
                                <RailBody />
                            </Match>
                            <Match when={genView() === "spotlight"}>
                                <SpotlightCanvas />
                            </Match>
                            <Match when={genView() === "hud"}>
                                <HudCanvas />
                            </Match>
                        </Switch>
                    }
                >
                    <div class="flex h-full items-center justify-center text-[13px] text-muted">
                        {gen.error}
                    </div>
                </Show>
            </div>
            <GenViewPicker />
        </div>
    );
};

// shared top bar across all directions
const BuildTopbar: Component<{
    progress: number;
    saving: boolean;
    onOpen: () => void;
    onCancel: () => void;
}> = (props) => (
    <header class="flex flex-none items-center gap-3 border-b border-line bg-panel px-5 py-3">
        <span class="flex flex-none items-center gap-2 font-mono text-[13px] font-bold tracking-[0.05em] text-accent">
            <SparkleIcon size={15} /> GALLEO
            <span class="text-muted">· {gen.phase === "done" ? "Generated" : "Generating"}</span>
            <Show when={gen.phase === "building"}>
                <span class="h-2 w-2 animate-pulse rounded-full bg-accent" />
            </Show>
        </span>
        <span class="min-w-0 flex-1 truncate text-[12.5px] text-muted">{gen.brief?.prompt}</span>
        <span class="flex-none font-mono text-[11px] text-muted">{props.progress}%</span>
        <Show
            when={gen.phase === "done"}
            fallback={
                <button
                    class="flex-none rounded-lg px-2.5 py-1 text-[12.5px] text-soft hover:bg-canvas hover:text-ink"
                    onClick={props.onCancel}
                >
                    Cancel
                </button>
            }
        >
            <button
                class="flex-none rounded-lg bg-accent px-4 py-1.5 text-[12.5px] font-semibold text-onaccent disabled:opacity-50"
                disabled={props.saving}
                onClick={props.onOpen}
            >
                {props.saving ? "Opening…" : "Open in editor →"}
            </button>
        </Show>
    </header>
);

// ─────────────────────────── CONSOLE direction ───────────────────────────
const ConsoleBody: Component = () => {
    const [open, setOpen] = createSignal(true);
    return (
        <div class="flex h-full w-full flex-col">
            <div class="min-h-0 flex-1">
                <BuildCanvas />
            </div>
            <Show when={open()} fallback={<ConsoleHandle onOpen={() => setOpen(true)} />}>
                <div class="relative flex h-[clamp(220px,33vh,340px)] flex-none flex-col border-t-2 border-accent/55 bg-panel">
                    <button
                        class="absolute right-2.5 top-2 z-30 grid h-[26px] w-[26px] place-items-center rounded-md text-[14px] text-muted transition hover:bg-canvas hover:text-ink"
                        title="Hide console"
                        onClick={() => setOpen(false)}
                    >
                        <CloseIcon size={15} />
                    </button>
                    <BeatStrip />
                    <StatusRow />
                    <Terminal />
                </div>
            </Show>
        </div>
    );
};

const ConsoleHandle: Component<{ onOpen: () => void }> = (props) => {
    const done = doneBeats;
    return (
        <button
            class="flex flex-none items-center gap-3 border-t-2 border-accent/55 bg-panel px-5 py-2.5 text-left font-mono text-[11px] text-muted transition hover:text-ink"
            onClick={props.onOpen}
        >
            <span class="text-accent">
                <ChevronUpIcon size={13} />
            </span>{" "}
            Show console
            <span class="text-soft">
                <span class="text-accent">galleo@agent</span> ·{" "}
                {gen.phase === "done" ? "complete" : gen.phase === "error" ? "error" : "streaming"}{" "}
                · beat {done()}/{gen.beats.length}
            </span>
            <Show when={gen.phase === "building"}>
                <span class="ml-auto h-2 w-2 animate-pulse rounded-full bg-accent" />
            </Show>
        </button>
    );
};

const BeatStrip: Component = () => (
    <div class="flex flex-none items-stretch gap-1 overflow-x-auto border-b border-line py-2.5 pl-4 pr-11">
        <For each={gen.beats}>
            {(b, i) => (
                <div class="flex min-w-[52px] flex-1 flex-col gap-1.5">
                    <div
                        class={`h-1 rounded-full transition-colors ${
                            b.status === "done"
                                ? "bg-accent"
                                : b.status === "active"
                                  ? "animate-pulse bg-accent/50"
                                  : "bg-line"
                        }`}
                    />
                    <span
                        class={`truncate font-mono text-[8.5px] uppercase tracking-[0.08em] ${
                            b.status === "upcoming"
                                ? "text-muted"
                                : b.status === "active"
                                  ? "text-accent"
                                  : "text-soft"
                        }`}
                    >
                        {String(i() + 1).padStart(2, "0")} {b.role}
                    </span>
                </div>
            )}
        </For>
    </div>
);

const StatusRow: Component = () => {
    const done = doneBeats;
    const at = (): number =>
        Math.min(done() + (gen.phase === "building" ? 1 : 0), gen.beats.length);
    return (
        <div class="flex flex-none items-center justify-between border-b border-line px-4 py-1.5 font-mono text-[11px] text-muted">
            <span>
                <span class="text-accent">galleo@agent</span> ·{" "}
                {gen.phase === "done" ? "complete" : gen.phase === "error" ? "error" : "streaming"}{" "}
                · beat {at()}/{gen.beats.length}
            </span>
            <span class="uppercase tracking-[0.1em]">{gen.format}.galleo</span>
        </div>
    );
};

const Terminal: Component = () => {
    let scroll!: HTMLDivElement;
    createEffect(() => {
        const count = gen.narration.length;
        queueMicrotask(() => {
            if (count >= 0)
                scroll?.scrollTo({
                    top: scroll.scrollHeight,
                    behavior: reduced() ? "auto" : "smooth",
                });
        });
    });
    return (
        <div
            ref={scroll}
            class="min-h-0 flex-1 overflow-y-auto px-4 py-2.5 font-mono text-[12px] leading-relaxed"
        >
            <For each={gen.narration}>
                {(line, i) => (
                    <div class={`flex gap-3 ${line.done ? "opacity-60" : "opacity-100"}`}>
                        <span class="flex-none select-none text-muted">
                            {String(i() + 1).padStart(2, "0")}
                        </span>
                        <span class="min-w-0 flex-1 text-soft">
                            <span class="text-accent">▸</span>{" "}
                            <span class="text-ink">
                                <Show when={line.done} fallback={<TypingLine text={line.text} />}>
                                    {line.text}
                                </Show>
                            </span>
                            <Show when={line.mono}>
                                <span class="text-accent">{line.mono}</span>
                            </Show>
                            <Show when={line.sub}>
                                <div class="pl-4 text-muted">↳ {line.sub}</div>
                            </Show>
                        </span>
                    </div>
                )}
            </For>
        </div>
    );
};

// ───────────────────────── DIRECTOR'S RAIL direction ─────────────────────────
const RAIL_LABEL: Record<string, string> = {
    scene: "Set the scene",
    tension: "The tension",
    turn: "The turn",
    proof: "The proof",
    momentum: "Momentum",
    close: "The ask",
};

const RailBody: Component = () => {
    const [open, setOpen] = createSignal(true);
    return (
        <div class="flex h-full w-full">
            <div class="min-h-0 flex-1">
                <BuildCanvas />
            </div>
            <Show when={open()} fallback={<RailHandle onOpen={() => setOpen(true)} />}>
                <aside class="flex h-full w-[330px] flex-none flex-col border-l-2 border-accent/45 bg-panel">
                    <div class="flex flex-none items-center gap-2 border-b border-line px-5 py-3.5 font-mono text-[10.5px] uppercase tracking-[0.16em] text-muted">
                        <span class="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" /> Director's
                        rail
                        <button
                            class="ml-auto grid h-[22px] w-[22px] place-items-center rounded-md text-[13px] text-muted transition hover:bg-canvas hover:text-ink"
                            title="Hide rail"
                            onClick={() => setOpen(false)}
                        >
                            <CloseIcon size={14} />
                        </button>
                    </div>
                    <div class="flex flex-none flex-col border-b border-line px-4 py-3">
                        <For each={gen.beats}>
                            {(b) => (
                                <div class="flex items-center gap-2.5 py-[5px]">
                                    <BeatDot status={b.status} />
                                    <span
                                        class={`text-[13px] ${
                                            b.status === "upcoming"
                                                ? "text-muted"
                                                : b.status === "active"
                                                  ? "font-semibold text-ink"
                                                  : "text-soft"
                                        }`}
                                    >
                                        {RAIL_LABEL[b.role] ?? b.role}
                                    </span>
                                </div>
                            )}
                        </For>
                    </div>
                    <div class="flex flex-none items-center gap-2 px-5 pb-1 pt-3 font-mono text-[10.5px] uppercase tracking-[0.16em] text-muted">
                        Reasoning
                    </div>
                    <RailNarration />
                </aside>
            </Show>
        </div>
    );
};

const RailHandle: Component<{ onOpen: () => void }> = (props) => {
    const done = doneBeats;
    return (
        <button
            class="flex h-full w-11 flex-none flex-col items-center gap-4 border-l-2 border-accent/45 bg-panel py-4 text-muted transition hover:text-ink"
            title="Show rail"
            onClick={props.onOpen}
        >
            <span class="text-accent">
                <ChevronLeftIcon size={14} />
            </span>
            <span class="font-mono text-[10px] uppercase tracking-[0.16em] [writing-mode:vertical-rl]">
                Director's rail · {done()}/{gen.beats.length}
            </span>
            <Show when={gen.phase === "building"}>
                <span class="mt-auto h-2 w-2 animate-pulse rounded-full bg-accent" />
            </Show>
        </button>
    );
};

const BeatDot: Component<{ status: string }> = (props) => (
    <span
        class={`grid h-4 w-4 flex-none place-items-center rounded-full border text-[8px] font-bold transition ${
            props.status === "done"
                ? "border-accent bg-accent text-onaccent"
                : props.status === "active"
                  ? "animate-pulse border-accent text-accent"
                  : "border-line text-transparent"
        }`}
    >
        <CheckIcon size={11} />
    </span>
);

const RailNarration: Component = () => {
    let scroll!: HTMLDivElement;
    createEffect(() => {
        const count = gen.narration.length;
        queueMicrotask(() => {
            if (count >= 0)
                scroll?.scrollTo({
                    top: scroll.scrollHeight,
                    behavior: reduced() ? "auto" : "smooth",
                });
        });
    });
    return (
        <div
            ref={scroll}
            class="min-h-0 flex-1 overflow-y-auto px-5 py-3.5 text-[12.5px] leading-relaxed"
        >
            <For each={gen.narration}>
                {(line) => (
                    <div class={`mb-2.5 ${line.done ? "opacity-55" : "opacity-100"}`}>
                        <div class="text-ink">
                            <Show when={line.done} fallback={<TypingLine text={line.text} />}>
                                {line.text}
                            </Show>
                            <Show when={line.mono}>
                                <span class="font-mono text-accent">{line.mono}</span>
                            </Show>
                        </div>
                        <Show when={line.sub}>
                            <div class="mt-1 pl-3 font-mono text-[11px] text-muted">
                                ↳ {line.sub}
                            </div>
                        </Show>
                    </div>
                )}
            </For>
        </div>
    );
};
