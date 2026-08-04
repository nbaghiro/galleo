import type { Component, JSX } from "solid-js";
import { createEffect, createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import type { Section } from "@model/artifact";
import type { Beat } from "@model/ai";
import { resolveProfile } from "@engine/profile";
import { resolveTheme, mix } from "@themes";
import { backdropCss, paint } from "@canvas/render/backends";
import { measureText, layoutSection, layoutSectionSkeleton } from "@canvas/render/commands";
import { placeholderSection } from "@canvas/elements/blueprint";
import { Icon } from "@ui/icons";
import { Button, Chip, IconButton, Spinner } from "@ui/button";
import { TextArea } from "@ui/inputs";
import { Popover } from "@ui/overlay";
import { StatusDot } from "@ui/status";
import {
    addBeatAfter,
    builtCount,
    gen,
    pauseBuild,
    runLocked,
    regenerateSection,
    reorderBeats,
    sectionCost,
    selectBeat,
    setActiveVersion,
    slotSection,
    type SectionSlot,
    type SlotStatus,
} from "../../stores/generate";
import { Credits } from "../../components/credits";
import { DWELL_MS, frameWidth, previewFormat, reduced, REVEAL_MS } from "./shared";
import { OutlineCard } from "./OutlineCard";

// one row per beat, for the whole run: the outline card while it's planned, the painted section once
// it's written. Beats are the spine at every stage, so a section never changes place when it lands.
//
// The list is BEAT IDS, not view objects. Solid's <For> is reference-keyed, and a fresh object per
// read meant every store write disposed and rebuilt every row — so one section landing re-mounted
// and repainted the whole board (images and all). Strings compare by value, so untouched rows now
// survive and each Frame derives its own state from the store.
const slotOf = (id: string): SectionSlot | undefined => gen.slots.find((s) => s.id === id);

// planning with an arc already on screen: the old one is being replaced, not built for the first time
const replanning = (): boolean => gen.planning && gen.beats.length > 0;

export const Board: Component = () => {
    let board!: HTMLDivElement;
    const visible = createMemo(() =>
        gen.beats.filter((b) => slotOf(b.id)?.status !== "skipped").map((b) => b.id),
    );
    const [avail, setAvail] = createSignal(1000);
    onMount(() => {
        // Coalesced: the console rail animates its width, so a raw observer would relayout and
        // repaint every section on every frame of that transition. One repaint after it settles.
        let settle: ReturnType<typeof setTimeout> | undefined;
        const ro = new ResizeObserver(() => {
            clearTimeout(settle);
            settle = setTimeout(() => setAvail(board.clientWidth), 90);
        });
        ro.observe(board);
        setAvail(board.clientWidth);
        onCleanup(() => {
            clearTimeout(settle);
            ro.disconnect();
        });
    });
    // center the active section's skeleton — but only after the previous section's land animation
    // has finished playing, so reveals are watched in place, not mid-scroll (never gates generation)
    const centerOn = (id: string | null): void => {
        const el = id ? board?.querySelector<HTMLElement>(`[data-sid="${id}"]`) : null;
        if (!el) return;
        const er = el.getBoundingClientRect();
        const br = board.getBoundingClientRect();
        const top = board.scrollTop + (er.top - br.top) - (board.clientHeight - er.height) / 2;
        board.scrollTo({ top: Math.max(0, top), behavior: reduced() ? "auto" : "smooth" });
    };
    let scrollTimer: ReturnType<typeof setTimeout> | undefined;
    createEffect(() => {
        const id = gen.activeSection;
        if (gen.stage !== "building") return;
        clearTimeout(scrollTimer);
        scrollTimer = setTimeout(() => centerOn(id), reduced() ? 0 : REVEAL_MS + DWELL_MS);
    });
    // on finish activeSection is null, so settle at the end instead of freezing mid-scroll —
    // after the last section's reveal has played out
    createEffect(() => {
        if (gen.stage !== "done") return;
        clearTimeout(scrollTimer);
        scrollTimer = setTimeout(
            () =>
                board?.scrollTo({
                    top: board.scrollHeight,
                    behavior: reduced() ? "auto" : "smooth",
                }),
            reduced() ? 0 : REVEAL_MS + DWELL_MS,
        );
    });
    onCleanup(() => clearTimeout(scrollTimer));
    // continuous formats (doc/web) merge seamlessly like the engine; only paged decks float apart
    const gap = (): string =>
        resolveProfile(previewFormat()).kind === "continuous" ? "0px" : "22px";
    // the artifact-level backdrop lands via a setMeta patch — paint it behind the stack like the editor does
    const backdrop = (): string =>
        backdropCss(gen.content.background, resolveTheme(gen.content.theme).tokens);
    return (
        <div class="relative h-full">
            {/* backdrop on a non-scrolling layer: on a scroll container, Chromium resolves cover
                against the scrollable CONTENT box, so a short stack tiles the image */}
            <div
                class="absolute inset-0"
                style={{
                    background: backdrop(),
                    "background-size": "cover",
                    "background-position": "center",
                    "background-repeat": "no-repeat",
                }}
            />
            <div
                ref={board}
                class="absolute inset-0 flex flex-col items-center px-7 py-6 transition-opacity"
                classList={{
                    "opacity-30": replanning(),
                    // hidden still allows scrollTo, so the board follows the write while the user can't
                    "overflow-hidden select-none pointer-events-none": runLocked(),
                    "overflow-auto": !runLocked(),
                }}
                style={{ gap: gap() }}
            >
                <Show
                    when={gen.beats.length}
                    fallback={
                        <div class="grid h-full place-items-center">
                            {/* only animate when something is genuinely in flight — a gate waiting
                                on the user must never look like work in progress */}
                            <Show
                                when={gen.planning || gen.briefLoading}
                                fallback={
                                    <p class="max-w-xs text-center text-[13px] leading-relaxed text-muted">
                                        The outline appears here once it's planned.
                                    </p>
                                }
                            >
                                <ReadingLoader />
                            </Show>
                        </div>
                    }
                >
                    <For each={visible()}>
                        {(id, i) => (
                            <Frame id={id} index={i()} total={visible().length} avail={avail} />
                        )}
                    </For>
                    {/* the arc is editable, so adding to its end has to be possible from the board */}
                    <Show when={gen.stage === "outline"}>
                        <button
                            class="flex items-center justify-center gap-1.5 rounded-[var(--radius)] border border-dashed border-line py-3 text-[12px] text-muted transition-colors hover:border-accent hover:text-ink"
                            style={{ width: `${frameWidth(avail())}px` }}
                            onClick={() =>
                                addBeatAfter(gen.beats[gen.beats.length - 1]?.id ?? null)
                            }
                        >
                            <Icon name="plus" size={12} /> Add a section
                        </button>
                    </Show>
                </Show>
            </div>
            <Show when={runLocked()}>
                <div class="pointer-events-none absolute inset-x-0 bottom-5 flex justify-center">
                    <div class="pointer-events-auto flex items-center gap-3 rounded-full border border-line bg-panel/90 py-1.5 pl-4 pr-1.5 shadow-lg backdrop-blur-sm">
                        <span class="flex items-center gap-2 text-[12px] text-soft">
                            <Spinner size={12} />
                            Writing {builtCount() + 1} of {gen.beats.length}
                        </span>
                        <Button
                            variant="outline"
                            size="sm"
                            rounded="xl"
                            title="Stop after this section — then edit, rework, or ask for changes"
                            onClick={pauseBuild}
                        >
                            Stop
                        </Button>
                    </div>
                </div>
            </Show>
            {/* replanning: the outgoing arc fades behind a plain statement of what's happening,
                rather than sitting there looking interactive while it's replaced */}
            <Show when={replanning()}>
                <div class="pointer-events-none absolute inset-0 grid place-items-center">
                    <div class="flex items-center gap-2.5 rounded-full border border-line bg-panel/90 px-4 py-2 shadow-lg backdrop-blur-sm">
                        <Spinner size={14} />
                        <span class="font-mono text-[11px] uppercase tracking-[0.14em] text-soft">
                            Replanning the arc…
                        </span>
                    </div>
                </div>
            </Show>
        </div>
    );
};

// outline-stage drag state (module-level: one drag at a time). A card is only `draggable` once its
// grip is held — otherwise the browser hands every drag to the row and you can't select card text.
const [draggingBeat, setDraggingBeat] = createSignal<string | null>(null);
const [armedBeat, setArmedBeat] = createSignal<string | null>(null);

// One row per beat: the editable outline card until it's written, the engine skeleton while it is,
// the painted section once it lands.
const Frame: Component<{
    id: string;
    index: number;
    total: number;
    avail: () => number;
}> = (props) => {
    // a SIGNAL, not a ref variable: this host only mounts once the beat leaves the outline stage, so
    // the paint effect has to re-run when the element actually arrives
    const [box, setBox] = createSignal<HTMLDivElement>();
    let frame!: HTMLElement;
    const [dim, setDim] = createSignal({ w: 0, h: 0 });
    const [noteOpen, setNoteOpen] = createSignal(false);
    const [note, setNote] = createSignal("");
    const [detail, setDetail] = createSignal(false);
    // everything this row shows is derived from the store by id, so a sibling landing touches nothing
    const beat = (): Beat | undefined => gen.beats.find((b) => b.id === props.id);
    const slot = (): SectionSlot | undefined => slotOf(props.id);
    const section = (): Section | null => {
        const s = slot();
        return s ? slotSection(s) : null;
    };
    const status = (): SlotStatus => slot()?.status ?? "queued";
    const working = (): boolean => slot()?.working ?? false;
    const versions = (): number => slot()?.versions.length ?? 0;
    const activeVersion = (): number => slot()?.active ?? 0;
    const layout = (): string => slot()?.layout ?? beat()?.layout ?? "full";
    const image = (): boolean => slot()?.image ?? beat()?.image ?? false;
    const blocks = (): string[] => slot()?.blocks ?? beat()?.blocks ?? [];
    const doneReady = (): boolean => !!section();
    const active = (): boolean => ["active", "writing", "image"].includes(status()) || working();
    const themeBg = (): string => resolveTheme(gen.content.theme).tokens.bg;
    const paged = (): boolean => resolveProfile(previewFormat()).kind !== "continuous";
    const editable = (): boolean => gen.stage === "outline";
    // an unwritten beat stays an outline card, at every stage — the plan is the thing you edit
    const planned = (): boolean => !doneReady() && !active();
    const reviewable = (): boolean =>
        doneReady() && !working() && (gen.stage === "building" || gen.stage === "done");
    const selected = (): boolean => editable() && gen.selectedBeat === props.id;

    // Repaint only when the picture actually changes, and animate only when a NEW section arrives.
    // Unguarded, every store write repainted this row and replayed its reveal, so each landing made
    // the whole board flash as if it were reloading.
    let painted: {
        el: HTMLDivElement;
        sec: Section | null;
        ghost: string;
        w: number;
        theme: string;
        fmt: string;
    } | null = null;
    createEffect(() => {
        const el = box();
        if (!el || planned()) return;
        const sec = section();
        const w = frameWidth(props.avail());
        const theme = gen.content.theme;
        const fmt = previewFormat();
        // a ghost's shape is its own inputs; a landed section's is the section object itself
        const ghost = sec ? "" : `${layout()}|${image()}|${blocks().join(",")}`;
        if (
            painted &&
            painted.el === el && // a remounted host is a blank node — always repaint into it
            painted.sec === sec &&
            painted.ghost === ghost &&
            painted.w === w &&
            painted.theme === theme &&
            painted.fmt === fmt
        )
            return;
        const landed = !!sec && painted?.sec !== sec;
        painted = { el, sec, ghost, w, theme, fmt };

        const tk = resolveTheme(theme).tokens;
        const profile = resolveProfile(fmt);
        // one width for skeleton AND landed paint — a skeleton can't know its bleed flag yet, so
        // the editor's inset-vs-bleed width rule would make sections jump width when they land
        const out = sec
            ? layoutSection(sec, w, measureText, tk, profile)
            : layoutSectionSkeleton(
                  placeholderSection({
                      id: props.id,
                      layout: layout(),
                      blocks: blocks(),
                      image: image(),
                  }),
                  w,
                  measureText,
                  tk,
                  profile,
              );
        paint(out.commands, el);
        setDim({ w, h: out.height });
        if (!landed || reduced()) return;
        el.animate([{ opacity: 0 }, { opacity: 1 }], {
            duration: 420,
            easing: "cubic-bezier(.2,.7,.2,1)",
            fill: "both",
        });
        el.animate([{ clipPath: "inset(0 0 100% 0)" }, { clipPath: "inset(0 0 0 0)" }], {
            duration: 560,
            easing: "cubic-bezier(.2,.7,.2,1)",
            fill: "both",
        });
        el.querySelectorAll("img").forEach((img) =>
            img.animate(
                [
                    { filter: "blur(14px)", opacity: 0.4 },
                    { filter: "blur(0)", opacity: 1 },
                ],
                { duration: REVEAL_MS, fill: "both" },
            ),
        );
    });

    const sendNote = (): void => {
        const text = note().trim();
        setNoteOpen(false);
        setNote("");
        if (text) void regenerateSection(props.id, text);
    };

    // drag-to-reorder ghosts while the outline is editable
    const onDragStart = (e: DragEvent): void => {
        if (!editable()) return;
        setDraggingBeat(props.id);
        e.dataTransfer?.setData("text/plain", props.id);
        if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
    };
    const onDragOver = (e: DragEvent): void => {
        if (!editable() || !draggingBeat() || draggingBeat() === props.id) return;
        e.preventDefault();
    };
    const onDrop = (e: DragEvent): void => {
        const dragged = draggingBeat();
        if (!editable() || !dragged || dragged === props.id) return;
        e.preventDefault();
        const r = frame.getBoundingClientRect();
        const before = e.clientY < r.top + r.height / 2;
        reorderBeats(dragged, props.index + (before ? 0 : 1));
        setDraggingBeat(null);
    };

    return (
        <article
            ref={frame}
            data-sid={props.id}
            class="group relative"
            classList={{ "opacity-40": draggingBeat() === props.id }}
            style={{ width: `${frameWidth(props.avail())}px` }}
            draggable={editable() && armedBeat() === props.id}
            onDragStart={onDragStart}
            onDragEnd={() => {
                setDraggingBeat(null);
                setArmedBeat(null);
            }}
            onDragOver={onDragOver}
            onDrop={onDrop}
            onClick={() => editable() && selectBeat(props.id)}
        >
            <Show when={!planned()}>
                <span
                    class="absolute left-3 top-2 z-[2] font-mono text-[9px] tracking-[0.14em] text-accent/80 transition-opacity"
                    classList={{ "opacity-0": doneReady() }}
                >
                    {String(props.index + 1).padStart(2, "0")} · {layout().toUpperCase()}
                    {image() ? " · IMG" : ""}
                </span>
            </Show>
            {/* The engine paints the finished card (surface, radius, bleed) — chrome only wraps the
                skeleton, where the dashed ghost frame is the point. A wrapper card around landed
                sections double-bordered them and let its background peek around the painted corners. */}
            <Show
                when={!planned()}
                fallback={
                    <Show when={beat()}>
                        <div
                            classList={{
                                "ring-1 ring-accent rounded-[var(--radius)]": selected(),
                            }}
                        >
                            <OutlineCard
                                beat={beat()!}
                                index={props.index}
                                total={props.total}
                                open={detail()}
                                draggable={editable()}
                                onGrip={() => setArmedBeat(props.id)}
                                onToggle={() => setDetail((v) => !v)}
                            />
                        </div>
                    </Show>
                }
            >
                <div
                    class="transition-colors"
                    classList={{
                        "overflow-hidden rounded-xl border border-dashed border-accent/25":
                            !doneReady() && paged(),
                        "ring-1 ring-accent shadow-[0_0_30px_-6px_var(--color-accent)]":
                            active() || selected(),
                        "shadow-[0_30px_60px_-40px_rgba(0,0,0,0.5)]": doneReady() && paged(),
                    }}
                    style={{
                        background: doneReady() ? "transparent" : themeBg(),
                        // the wrapper hugs the painted card (bleed = full frame, content cards inset),
                        // so the shadow and radius trace the engine's surface, not the outer frame
                        width: `${dim().w}px`,
                        margin: "0 auto",
                        "border-radius":
                            doneReady() && paged() && !section()!.bleed
                                ? `${resolveTheme(gen.content.theme).tokens.radius}px`
                                : undefined,
                    }}
                >
                    <div
                        ref={setBox}
                        style={{
                            position: "relative",
                            width: `${dim().w}px`,
                            height: `${dim().h}px`,
                        }}
                    />
                </div>
            </Show>
            <Show when={active()}>
                <div class="absolute bottom-3 left-4 z-[2] flex items-center gap-2 rounded-md bg-panel/80 px-2 py-1 font-mono text-[10.5px] uppercase tracking-[0.12em] text-accent backdrop-blur-sm">
                    <StatusDot tone="accent" pulse />
                    {working()
                        ? "Reworking…"
                        : status() === "image"
                          ? "Sourcing image…"
                          : "Writing…"}
                </div>
            </Show>
            {/* landed-section verdict bar: silence = keep; objection is one tap */}
            <Show when={reviewable()}>
                <div
                    class="absolute bottom-3 right-4 z-[2] flex items-center gap-1 rounded-lg border border-line bg-panel/85 p-1 opacity-0 shadow-lg backdrop-blur-sm transition-opacity focus-within:opacity-100 group-hover:opacity-100"
                    classList={{ "opacity-100": noteOpen() }}
                >
                    <Show when={versions() > 1}>
                        <div class="mr-1 flex items-center gap-0.5">
                            <For each={Array.from({ length: versions() }, (_, v) => v)}>
                                {(v) => (
                                    <Chip
                                        variant="solid"
                                        size="sm"
                                        selected={v === activeVersion()}
                                        rounded="md"
                                        title={`Take ${v + 1}`}
                                        onClick={() => setActiveVersion(props.id, v)}
                                    >
                                        v{v + 1}
                                    </Chip>
                                )}
                            </For>
                        </div>
                    </Show>
                    <IconButton
                        size="md"
                        tone="muted"
                        title="Regenerate this section"
                        onClick={() => void regenerateSection(props.id)}
                    >
                        <Icon name="refresh" size={14} />
                    </IconButton>
                    <IconButton
                        size="md"
                        tone="muted"
                        title="Regenerate with a note"
                        onClick={() => setNoteOpen(true)}
                    >
                        <Icon name="sparkle" size={14} />
                    </IconButton>
                    <Popover
                        anchor={() => frame}
                        open={noteOpen()}
                        onClose={() => setNoteOpen(false)}
                        fixedWidth={300}
                        align="end"
                        estHeight={140}
                        panelClass="p-2"
                    >
                        <TextArea
                            rows={2}
                            rounded="md"
                            placeholder="What should change? e.g. more numbers, less prose"
                            value={note()}
                            onChange={setNote}
                            onKeyDown={(e: KeyboardEvent) => {
                                if (e.key === "Enter" && !e.shiftKey) {
                                    e.preventDefault();
                                    sendNote();
                                }
                            }}
                        />
                        <div class="mt-1.5 flex justify-end">
                            <Button variant="primary" size="sm" onClick={sendNote}>
                                Regenerate · <Credits n={sectionCost()} />
                            </Button>
                        </div>
                    </Popover>
                </div>
            </Show>
        </article>
    );
};
// build loader while the outline is written — three skeletons light in sequence
const cascadeVars = (): JSX.CSSProperties => {
    const tk = resolveTheme(gen.content.theme).tokens;
    return {
        width: "460px",
        "--gc-frame": tk.surface,
        "--gc-border": tk.line,
        "--gc-ghost": mix(tk.surface, tk.ink, 0.14),
        "--gc-lit": mix(tk.surface, tk.accent, 0.5),
        "--gc-accent": tk.accent,
    } as JSX.CSSProperties;
};

export const ReadingLoader: Component = () => {
    const line = (): string => gen.narration[gen.narration.length - 1]?.text ?? "Reading the brief";
    // --d staggers the three rows so they light in sequence
    const bar = (cls: string): JSX.Element => <div class={`gc-bar rounded ${cls}`} />;
    return (
        <div class="flex flex-col items-center gap-6" style={cascadeVars()}>
            <style>{`
              @keyframes gc-frame { 0%{opacity:.34} 7%{opacity:1} 30%{opacity:.5} 100%{opacity:.34} }
              @keyframes gc-glow {
                0%{box-shadow:none;border-color:var(--gc-border)}
                7%{box-shadow:0 0 26px -10px var(--gc-accent);border-color:color-mix(in srgb,var(--gc-accent) 55%,var(--gc-border))}
                30%,100%{box-shadow:none;border-color:var(--gc-border)}
              }
              @keyframes gc-bar { 0%{background:var(--gc-ghost)} 7%{background:var(--gc-lit)} 30%,100%{background:var(--gc-ghost)} }
              .gc-row { animation: gc-frame 3.6s infinite ease-in-out, gc-glow 3.6s infinite ease-in-out; animation-delay: var(--d,0s); }
              .gc-bar { background: var(--gc-ghost); animation: gc-bar 3.6s infinite ease-in-out; animation-delay: var(--d,0s); }
              @media (prefers-reduced-motion: reduce) { .gc-row,.gc-bar { animation: none } .gc-row { opacity:.65 } }
            `}</style>

            <div class="flex w-full flex-col gap-2.5">
                <div
                    class="gc-row flex items-center gap-3.5 rounded-xl border p-3.5"
                    style={{
                        background: "var(--gc-frame)",
                        "border-color": "var(--gc-border)",
                        "--d": "0s",
                    }}
                >
                    <div class="gc-bar h-10 w-14 flex-none rounded-md" />
                    <div class="flex flex-1 flex-col gap-2">
                        {bar("h-2 w-2/3")}
                        {bar("h-1.5 w-11/12")}
                        {bar("h-1.5 w-4/5")}
                    </div>
                </div>
                <div
                    class="gc-row flex items-center gap-3.5 rounded-xl border p-3.5"
                    style={{
                        background: "var(--gc-frame)",
                        "border-color": "var(--gc-border)",
                        "--d": "1.2s",
                    }}
                >
                    <div class="flex flex-1 flex-col gap-2">
                        {bar("h-2 w-1/2")}
                        {bar("h-1.5 w-11/12")}
                        {bar("h-1.5 w-3/4")}
                    </div>
                    <div class="gc-bar h-10 w-14 flex-none rounded-md" />
                </div>
                <div
                    class="gc-row flex flex-col gap-2 rounded-xl border p-3.5"
                    style={{
                        background: "var(--gc-frame)",
                        "border-color": "var(--gc-border)",
                        "--d": "2.4s",
                    }}
                >
                    {bar("h-2 w-1/3")}
                    {bar("h-1.5 w-full")}
                    {bar("h-1.5 w-5/6")}
                </div>
            </div>

            <div class="flex items-center gap-2.5 rounded-full border border-line bg-panel/85 px-4 py-2 backdrop-blur-sm">
                <Spinner size={14} />
                <span class="font-mono text-[11px] uppercase tracking-[0.14em] text-soft">
                    {line()}…
                </span>
            </div>
        </div>
    );
};
