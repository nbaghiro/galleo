import type { Component, JSX } from "solid-js";
import { For, Show, createEffect, createMemo, createSignal, onMount } from "solid-js";
import type { ModelSpan } from "@model/ai";
import type { ArtifactContent } from "@model/artifact";
import type {
    EvalCheck,
    EvalJudgement,
    EvalRun,
    EvalRunSummary,
    Rubric,
    SectionMark,
} from "@model/eval";
import { approxTokens, rollup, scoreOf, spansForStep, stepsOf, tokensOf } from "@model/eval";
import { Badge, Button, Chip, Eyebrow, IconButton, Spinner } from "@ui/button";
import { Segmented, Toggle } from "@ui/inputs";
import { Dropdown, type DropdownOption } from "@ui/select";
import { EmptyState, Meter, StatusDot } from "@ui/status";
import { PreviewCanvas, SectionThumb } from "@app/components/previews";
import { Icon } from "@ui/icons";
import { useNavigate, useParams } from "@solidjs/router";
import { api, setTraceTurns, traceTurns } from "@app/api";
import { generateOpen, openGenerate } from "@app/stores/generate";
import { appTheme } from "@app/stores/theme";
import { fitChecks } from "@app/stores/eval-fit";

// A pipeline inspector: every call the run made down the left, the exact bytes of the selected call
// in the middle, its verdict on the right. The system prompt is shown as the fragments it was
// assembled from, since "which part of the prompt caused this" is the question worth answering.
// The middle pane also renders what the run produced, so a verdict can be read against the picture.

const ms = (n: number): string => (n < 1000 ? `${n}ms` : `${(n / 1000).toFixed(1)}s`);
const pct = (n: number): string => `${Math.round(n * 100)}%`;
const shortModel = (id: string): string => id.split(":").pop() ?? id;
const tok = (n: number): string => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));

// below this a judged target is called out rather than merely reported
const WEAK = 0.5;

type Tab = "system" | "user" | "output";
type Pane = "trace" | "artifact";

/** A step maps to a judged target: "outline" to the outline, "section:b3" to that section. */
const targetOf = (step: string): string => (step.startsWith("section:") ? step : "outline");

const scrollPane = "min-h-0 flex-1 overflow-y-auto lg:h-full";
const paneCol =
    "flex min-w-0 flex-col border-b border-line lg:h-full lg:min-h-0 lg:border-r lg:border-b-0";

/* --------------------------------------------------------------- run list */

const SORTERS: Record<string, (a: EvalRunSummary, b: EvalRunSummary) => number> = {
    recent: (a, b) => b.at.localeCompare(a.at),
    failures: (a, b) => b.checksRun - b.checksPassed - (a.checksRun - a.checksPassed),
    // unjudged sorts last rather than best: an absent verdict is not a good one
    judge: (a, b) => (a.judgeScore ?? 2) - (b.judgeScore ?? 2),
    slowest: (a, b) => b.ms - a.ms,
    costly: (a, b) => b.tokensIn + b.tokensOut - (a.tokensIn + a.tokensOut),
};
const SORTS: DropdownOption[] = [
    { label: "Newest first", value: "recent" },
    { label: "Most failures", value: "failures" },
    { label: "Weakest verdict", value: "judge" },
    { label: "Slowest", value: "slowest" },
    { label: "Most tokens", value: "costly" },
];

const dayKey = (iso: string): string => new Date(iso).toDateString();
const dayLabel = (iso: string): string => {
    const d = new Date(iso);
    const today = new Date();
    const yesterday = new Date(today.getTime() - 86_400_000);
    if (d.toDateString() === today.toDateString()) return "Today";
    if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
    return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
};

/**
 * The lead sections as they actually render, the way the library's card does it: every section the
 * row has, in a strip that scrolls sideways. No measuring and no "+N" counter, so the row shows the
 * same thing at any width and the reader scrolls rather than being told what they are missing.
 */
// the library's own tile width (LibraryView TILE_W), so a strip here reads at the same scale
const THUMB_W = 176;

const SectionStrip: Component<{ run: EvalRunSummary; onOpen: () => void }> = (props) => {
    const markOf = (id: string): SectionMark | undefined =>
        props.run.sections.find((m) => m.id === id);

    const explain = (id: string, m: SectionMark | undefined): string => {
        const bits = [`Section ${id}`];
        if (m?.score !== null && m?.score !== undefined)
            bits.push(`judge scored ${Math.round(m.score * 100)}%`);
        else bits.push("not judged yet");
        if (m?.failed.length) bits.push(`failed: ${m.failed.join(", ")}`);
        return bits.join(" · ");
    };

    return (
        <div class="mt-2.5 flex items-center gap-3 overflow-x-auto overscroll-x-contain pb-2 pt-0.5">
            <For each={props.run.lead}>
                {(section) => {
                    const m = createMemo(() => markOf(section.id));
                    const bad = createMemo(() => (m()?.failed.length ?? 0) > 0);
                    const weak = createMemo(() => !bad() && (m()?.score ?? 1) < 0.5);
                    return (
                        <span class="relative flex-none" title={explain(section.id, m())}>
                            {/* the app's theme, as the library does: a thumbnail sits inside our
                                chrome, so the artifact's own palette would fight the list */}
                            <SectionThumb
                                section={section}
                                themeId={appTheme()}
                                formatId={props.run.config.meta.surface ?? "deck"}
                                label={explain(section.id, m())}
                                width={THUMB_W}
                                onOpen={props.onOpen}
                            />
                            <Show when={bad() || weak()}>
                                <span
                                    class={`absolute top-1.5 right-1.5 size-2.5 rounded-full ring-2 ring-panel ${
                                        bad() ? "bg-fail" : "bg-accent"
                                    }`}
                                    title={explain(section.id, m())}
                                />
                            </Show>
                        </span>
                    );
                }}
            </For>
        </div>
    );
};

const Tile: Component<{
    label: string;
    value: JSX.Element;
    sub?: JSX.Element;
    bar?: JSX.Element;
    onClick?: () => void;
}> = (props) => (
    <div
        class={`flex min-w-36 flex-1 flex-col justify-center bg-panel px-4 py-2 ${
            props.onClick ? "cursor-pointer text-left hover:bg-canvas" : ""
        }`}
        onClick={props.onClick}
    >
        <Eyebrow as="div">{props.label}</Eyebrow>
        <div class="mt-0.5 text-[17px] leading-tight font-semibold tabular-nums text-ink">
            {props.value}
        </div>
        <Show when={props.bar}>{props.bar}</Show>
        <Show when={props.sub}>
            <div class="mt-0.5 truncate font-mono text-[10px] text-muted">{props.sub}</div>
        </Show>
    </div>
);

const Strip: Component<{ runs: EvalRunSummary[]; onOpen: (id: string) => void }> = (props) => {
    const roll = createMemo(() => rollup(props.runs));
    const checkRate = createMemo(() =>
        roll().checksRun ? roll().checksPassed / roll().checksRun : null,
    );
    // the run a human should look at first: the weakest verdict, or failing the most checks
    const worst = createMemo((): EvalRunSummary | undefined => {
        const judged = props.runs.filter((r) => r.judgeScore !== null);
        if (judged.length) return [...judged].sort((a, b) => a.judgeScore! - b.judgeScore!)[0];
        const failing = props.runs.filter((r) => r.checksRun > r.checksPassed);
        return [...failing].sort(
            (a, b) => b.checksRun - b.checksPassed - (a.checksRun - a.checksPassed),
        )[0];
    });
    return (
        <div class="flex flex-none items-stretch gap-px overflow-hidden rounded-[var(--radius)] border border-line bg-line">
            <Tile
                label="Runs"
                value={roll().runs}
                sub={
                    roll().failing
                        ? `${roll().failing} with a failed check`
                        : "no failed checks here"
                }
            />
            <Tile
                label="Checks"
                value={checkRate() === null ? "—" : pct(checkRate()!)}
                bar={
                    <Show when={checkRate() !== null}>
                        <Meter
                            class="mt-1.5"
                            value={checkRate()! * 100}
                            tone={checkRate()! < 0.9 ? "fail" : "pass"}
                            trackTone="canvas"
                        />
                    </Show>
                }
                sub={`${roll().checksPassed}/${roll().checksRun} passed`}
            />
            <Tile
                label="Judge"
                value={roll().judgeScore === null ? "—" : pct(roll().judgeScore!)}
                bar={
                    <Show when={roll().judgeScore !== null}>
                        <Meter
                            class="mt-1.5"
                            value={roll().judgeScore! * 100}
                            tone={roll().judgeScore! < WEAK ? "fail" : "accent"}
                            trackTone="canvas"
                        />
                    </Show>
                }
                sub={`${roll().judged}/${roll().runs} judged`}
            />
            <Tile label="Median run" value={ms(roll().medianMs)} sub="wall clock, whole run" />
            <Tile
                label="Tokens"
                value={tok(roll().tokensIn + roll().tokensOut)}
                sub={`${tok(roll().tokensIn)} in · ${tok(roll().tokensOut)} out`}
            />
            <Show when={worst()}>
                {(w) => (
                    <Tile
                        label="Look at first"
                        value={
                            w().judgeScore === null
                                ? `${w().checksRun - w().checksPassed} failed`
                                : pct(w().judgeScore!)
                        }
                        sub={w().config.meta.prompt || "(no prompt)"}
                        onClick={() => props.onOpen(w().id)}
                    />
                )}
            </Show>
        </div>
    );
};

/** A compact number with a hairline bar under it, for the row header where space is the constraint. */
const Stat: Component<{ label: string; value: string; fill: number | null; weak?: boolean }> = (
    props,
) => (
    <div class="w-20 flex-none">
        <div class="flex items-baseline justify-between font-mono text-[10px]">
            <span class="text-muted">{props.label}</span>
            <span class="tabular-nums text-soft">{props.value}</span>
        </div>
        <div class="mt-0.5 h-0.5 w-full overflow-hidden rounded-full bg-canvas">
            <Show when={props.fill !== null}>
                <div
                    class={`h-full rounded-full ${props.weak ? "bg-fail" : "bg-accent"}`}
                    style={{ width: `${Math.round((props.fill ?? 0) * 100)}%` }}
                />
            </Show>
        </div>
    </div>
);

const RunRow: Component<{ run: EvalRunSummary; onOpen: () => void }> = (props) => {
    const failed = (): number => props.run.checksRun - props.run.checksPassed;
    const rate = (): number | null =>
        props.run.checksRun ? props.run.checksPassed / props.run.checksRun : null;
    const dot = (): "accent" | "fail" | "pass" | "soft" =>
        props.run.status !== "ok" ? "soft" : failed() ? "fail" : "pass";
    return (
        <div
            role="button"
            tabindex="0"
            onClick={props.onOpen}
            onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    props.onOpen();
                }
            }}
            class="block w-full cursor-pointer border-b border-line px-4 py-3.5 text-left hover:bg-canvas md:px-5"
        >
            <div class="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <StatusDot tone={dot()} size={5} />
                <span class="min-w-0 flex-1 truncate text-[13px] text-ink">
                    {props.run.config.meta.prompt || "(no prompt)"}
                </span>
                <Badge tone="outline" size="xs" uppercase>
                    {props.run.config.meta.surface}
                </Badge>
                <Stat
                    label="checks"
                    value={
                        rate() === null ? "—" : `${props.run.checksPassed}/${props.run.checksRun}`
                    }
                    fill={rate()}
                    weak={failed() > 0}
                />
                <Stat
                    label="judge"
                    value={props.run.judgeScore === null ? "none" : pct(props.run.judgeScore)}
                    fill={props.run.judgeScore}
                    weak={props.run.judgeScore !== null && props.run.judgeScore < WEAK}
                />
                <span class="w-24 flex-none text-right font-mono text-[10.5px] tabular-nums text-soft">
                    {tok(props.run.tokensIn)}/{tok(props.run.tokensOut)}
                </span>
                <span class="w-12 flex-none text-right font-mono text-[10.5px] tabular-nums text-soft">
                    {ms(props.run.ms)}
                </span>
            </div>

            <div class="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 pl-3.5 font-mono text-[10px] text-muted">
                <span class="tabular-nums">
                    {new Date(props.run.at).toLocaleTimeString(undefined, {
                        hour: "2-digit",
                        minute: "2-digit",
                    })}
                </span>
                <span>{shortModel(props.run.config.meta.models.outline ?? "")}</span>
                <span class="tabular-nums">{props.run.spanCount} calls</span>
                <Show when={props.run.status !== "ok"}>
                    <span class="text-fail">{props.run.status}</span>
                </Show>
                <For each={props.run.failedChecks}>
                    {(id) => (
                        <span class="rounded-[var(--radius)] border border-fail px-1 py-px text-fail">
                            {id}
                        </span>
                    )}
                </For>
            </div>

            <SectionStrip run={props.run} onOpen={props.onOpen} />
        </div>
    );
};

const RunList: Component<{
    runs: EvalRunSummary[];
    more: boolean;
    loading: boolean;
    onMore: () => void;
    onOpen: (id: string) => void;
}> = (props) => {
    const [surface, setSurface] = createSignal("all");
    const [model, setModel] = createSignal("all");
    const [failingOnly, setFailingOnly] = createSignal(false);
    const [sort, setSort] = createSignal("recent");

    const surfaces = createMemo((): { label: string; value: string }[] => [
        { label: "All", value: "all" },
        ...[...new Set(props.runs.map((r) => r.config.meta.surface))].map((s) => ({
            label: s,
            value: s,
        })),
    ]);
    const models = createMemo((): DropdownOption[] => [
        { label: "All models", value: "all" },
        ...[...new Set(props.runs.map((r) => r.config.meta.models.outline ?? ""))]
            .filter(Boolean)
            .map((m) => ({ label: shortModel(m), value: m })),
    ]);

    const shown = createMemo(() => {
        const rows = props.runs.filter(
            (r) =>
                (surface() === "all" || r.config.meta.surface === surface()) &&
                (model() === "all" || r.config.meta.models.outline === model()) &&
                (!failingOnly() || r.checksRun > r.checksPassed || r.status !== "ok"),
        );
        return [...rows].sort(SORTERS[sort()] ?? SORTERS.recent!);
    });
    // a ranking is not a chronology, so only the default order carries day headings
    const days = createMemo((): { key: string; label: string; runs: EvalRunSummary[] }[] => {
        if (sort() !== "recent") return [];
        const out: { key: string; label: string; runs: EvalRunSummary[] }[] = [];
        for (const r of shown()) {
            const key = dayKey(r.at);
            const last = out.at(-1);
            if (last?.key === key) last.runs.push(r);
            else out.push({ key, label: dayLabel(r.at), runs: [r] });
        }
        return out;
    });

    return (
        <>
            <Strip runs={props.runs} onOpen={props.onOpen} />

            <div class="overflow-hidden rounded-[var(--radius)] border border-line bg-panel">
                <div class="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5">
                    <Segmented value={surface()} options={surfaces()} onChange={setSurface} />
                    <Dropdown compact value={model()} options={models()} onChange={setModel} />
                    <Chip
                        variant="soft"
                        selected={failingOnly()}
                        onClick={() => setFailingOnly((v) => !v)}
                    >
                        Failures only
                    </Chip>
                    <div class="flex-1" />
                    <span class="font-mono text-[10.5px] tabular-nums text-muted">
                        {shown().length} of {props.runs.length}
                    </span>
                    <Dropdown compact value={sort()} options={SORTS} onChange={setSort} />
                </div>

                <div>
                    <Show
                        when={shown().length}
                        fallback={
                            <EmptyState
                                class="py-16"
                                title="Nothing matches these filters"
                                subtitle="Widen the surface or model, or turn off failures-only."
                            />
                        }
                    >
                        <Show
                            when={days().length}
                            fallback={
                                <For each={shown()}>
                                    {(r) => <RunRow run={r} onOpen={() => props.onOpen(r.id)} />}
                                </For>
                            }
                        >
                            <For each={days()}>
                                {(d) => (
                                    <>
                                        <div class="sticky top-0 z-raised flex items-center gap-2 border-b border-line bg-panel/95 px-4 py-1.5 backdrop-blur-sm md:px-5">
                                            <Eyebrow as="div">{d.label}</Eyebrow>
                                            <span class="font-mono text-[10px] tabular-nums text-muted">
                                                {d.runs.length}
                                            </span>
                                        </div>
                                        <For each={d.runs}>
                                            {(r) => (
                                                <RunRow run={r} onOpen={() => props.onOpen(r.id)} />
                                            )}
                                        </For>
                                    </>
                                )}
                            </For>
                        </Show>
                    </Show>
                    <Show when={props.more}>
                        <div class="flex justify-center py-4">
                            <Button
                                variant="outline"
                                size="sm"
                                loading={props.loading}
                                onClick={props.onMore}
                            >
                                Load older runs
                            </Button>
                        </div>
                    </Show>
                </div>
            </div>
        </>
    );
};

/* ------------------------------------------------------------ run detail */

const TopBar: Component<{ run: EvalRun; onClose: () => void }> = (props) => (
    <div class="flex flex-none flex-wrap items-center gap-2 border-b border-line bg-panel px-3 py-2">
        <IconButton size="sm" tone="muted" title="Back to runs" onClick={props.onClose}>
            <Icon name="chevronLeft" size={15} />
        </IconButton>
        <button
            type="button"
            class="font-mono text-[11px] text-muted hover:text-ink"
            onClick={props.onClose}
        >
            galleo / eval
        </button>
        <span class="font-mono text-[11px] text-muted">/</span>
        <span class="font-mono text-[11px] text-ink">{props.run.id.slice(0, 8)}</span>
        <div class="flex-1" />
        <Chip size="sm" variant="soft">
            {props.run.config.meta.surface} · {props.run.config.meta.length ?? "Standard"}
        </Chip>
        <span class="font-mono text-[10.5px] tabular-nums text-muted">
            {shortModel(props.run.config.meta.models.outline ?? "")} · {tok(props.run.tokensIn)} in
            · {tok(props.run.tokensOut)} out · {ms(props.run.ms)}
        </span>
    </div>
);

const CallRail: Component<{
    run: EvalRun;
    step: string;
    onPick: (s: string) => void;
}> = (props) => {
    const steps = createMemo(() => stepsOf(props.run.spans));
    const weak = (step: string): boolean => {
        const v = props.run.judgements.find((j) => j.target === targetOf(step));
        return !!v && scoreOf(v) < WEAK;
    };
    return (
        <div class={paneCol}>
            <div class="flex flex-none items-center justify-between border-b border-line px-3 py-2">
                <Eyebrow as="div">Calls</Eyebrow>
                <span class="font-mono text-[10.5px] tabular-nums text-muted">
                    {props.run.spans.length}
                </span>
            </div>
            <div class={`${scrollPane} max-h-72 lg:max-h-none`}>
                <For each={steps()}>
                    {(s) => {
                        const calls = createMemo(() => spansForStep(props.run.spans, s));
                        const t = createMemo(() => tokensOf(calls()));
                        const first = createMemo(() => calls()[0]);
                        const sel = createMemo(() => props.step === s);
                        // scrolling the preview moves the selection here, so keep it in view
                        let row!: HTMLButtonElement;
                        createEffect(() => {
                            if (sel()) row.scrollIntoView({ block: "nearest" });
                        });
                        return (
                            <button
                                ref={row}
                                type="button"
                                class={`block w-full border-b border-line py-1.5 pr-3 pl-2.5 text-left last:border-b-0 hover:bg-canvas ${
                                    sel() ? "border-l-2 border-l-accent bg-canvas pl-2" : ""
                                }`}
                                onClick={() => props.onPick(s)}
                            >
                                <span class="flex items-center gap-1.5">
                                    <StatusDot tone={weak(s) ? "fail" : "accent"} size={5} />
                                    <span
                                        class={`truncate font-mono text-[11.5px] ${
                                            sel() ? "text-ink" : "text-soft"
                                        }`}
                                    >
                                        {s}
                                    </span>
                                </span>
                                <span class="mt-0.5 block pl-3 font-mono text-[10px] tabular-nums text-muted">
                                    {shortModel(first()?.modelId ?? "")} ·{" "}
                                    {ms(calls().reduce((n, c) => n + c.ms, 0))} ·{" "}
                                    {tok(t().input + t().output)} tok
                                    <Show when={calls().length > 1}> · {calls().length}×</Show>
                                </span>
                            </button>
                        );
                    }}
                </For>
            </div>
        </div>
    );
};

/** The system prompt as the fragments it was assembled from, each with its share of the cost. */
const Fragments: Component<{ span: ModelSpan }> = (props) => {
    // a set, not one name: comparing two fragments means having both open at once
    const [open, setOpen] = createSignal<ReadonlySet<string>>(new Set());
    const toggle = (name: string): void => {
        setOpen((prev) => {
            const next = new Set(prev);
            if (!next.delete(name)) next.add(name);
            return next;
        });
    };
    const allOpen = createMemo(() => open().size === (props.span.parts?.length ?? 0));
    const toggleAll = (): void => {
        setOpen(
            allOpen() ? new Set<string>() : new Set((props.span.parts ?? []).map((p) => p.name)),
        );
    };

    return (
        <Show
            when={props.span.parts?.length}
            fallback={
                <pre class="overflow-x-auto rounded-[var(--radius)] bg-canvas px-3 py-2 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-soft">
                    {props.span.system ?? "no system prompt recorded"}
                </pre>
            }
        >
            <div class="rounded-[var(--radius)] border border-line">
                <div class="flex items-center justify-between border-b border-line px-3 py-1">
                    <Eyebrow as="div">{props.span.parts?.length} fragments</Eyebrow>
                    <button
                        type="button"
                        class="font-mono text-[10px] text-muted hover:text-ink"
                        onClick={toggleAll}
                    >
                        {allOpen() ? "collapse all" : "expand all"}
                    </button>
                </div>
                <For each={props.span.parts}>
                    {(p) => {
                        const shown = createMemo(() => open().has(p.name));
                        return (
                            <div class="border-b border-line last:border-b-0">
                                <button
                                    type="button"
                                    class="flex w-full items-baseline gap-2 px-3 py-1.5 text-left hover:bg-canvas"
                                    onClick={() => toggle(p.name)}
                                >
                                    <span class="font-mono text-[10px] text-muted">
                                        {shown() ? "▾" : "▸"}
                                    </span>
                                    <span class="font-mono text-[11.5px] text-ink">{p.name}</span>
                                    <span class="flex-1 truncate text-[11.5px] text-muted">
                                        <Show when={!shown()}>
                                            {p.text.replace(/\s+/g, " ").slice(0, 90)}
                                        </Show>
                                    </span>
                                    <span class="font-mono text-[10px] tabular-nums text-muted">
                                        ~{approxTokens(p.text)} tok
                                    </span>
                                </button>
                                <Show when={shown()}>
                                    <pre class="overflow-x-auto bg-canvas px-3 py-2 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-soft">
                                        {p.text}
                                    </pre>
                                </Show>
                            </div>
                        );
                    }}
                </For>
            </div>
        </Show>
    );
};

const CallDetail: Component<{ run: EvalRun; step: string }> = (props) => {
    const calls = createMemo(() => spansForStep(props.run.spans, props.step));
    const [attempt, setAttempt] = createSignal(0);
    const span = createMemo(() => calls()[Math.min(attempt(), calls().length - 1)]);
    const [tab, setTab] = createSignal<Tab>("system");

    const tabs = createMemo((): { id: Tab; label: string; n: number }[] => {
        const s = span();
        return [
            { id: "system", label: "System", n: approxTokens(s?.system ?? "") },
            { id: "user", label: "User", n: approxTokens(s?.prompt ?? "") },
            { id: "output", label: "Output", n: s?.output ?? 0 },
        ];
    });

    return (
        <>
            <div class="flex flex-none flex-wrap items-center gap-2 border-b border-line px-3 py-1.5">
                <Show when={span()}>
                    {(s) => (
                        <>
                            <Chip size="sm" variant="soft">
                                {s().modelId}
                            </Chip>
                            <span class="font-mono text-[10.5px] tabular-nums text-muted">
                                {s().temperature === undefined
                                    ? "temp omitted"
                                    : `temp ${s().temperature}`}{" "}
                                · {s().input} in · {s().output} out · {ms(s().ms)}
                            </span>
                        </>
                    )}
                </Show>
                <div class="flex-1" />
                <Show when={calls().length > 1}>
                    <For each={calls()}>
                        {(_, i) => (
                            <button
                                type="button"
                                class={`font-mono text-[10.5px] ${
                                    attempt() === i() ? "text-accent" : "text-muted hover:text-ink"
                                }`}
                                onClick={() => setAttempt(i())}
                            >
                                attempt {i() + 1}
                            </button>
                        )}
                    </For>
                </Show>
            </div>

            <div class="flex flex-none items-center gap-4 border-b border-line px-3">
                <For each={tabs()}>
                    {(t) => (
                        <button
                            type="button"
                            class={`-mb-px border-b-2 py-1.5 font-mono text-[11px] ${
                                tab() === t.id
                                    ? "border-accent text-ink"
                                    : "border-transparent text-muted hover:text-ink"
                            }`}
                            onClick={() => setTab(t.id)}
                        >
                            {t.label} <span class="tabular-nums text-muted">{tok(t.n)}</span>
                        </button>
                    )}
                </For>
            </div>

            <div class={`${scrollPane} max-h-160 px-3 py-2 lg:max-h-none`}>
                <Show when={span()} fallback={<p class="text-[12px] text-muted">No call here.</p>}>
                    {(s) => (
                        <>
                            <Show when={tab() === "system"}>
                                <Fragments span={s()} />
                            </Show>
                            <Show when={tab() === "user"}>
                                <pre class="overflow-x-auto rounded-[var(--radius)] bg-canvas px-3 py-2 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-soft">
                                    {s().prompt ?? "no user prompt recorded"}
                                </pre>
                            </Show>
                            <Show when={tab() === "output"}>
                                <pre class="overflow-x-auto rounded-[var(--radius)] bg-canvas px-3 py-2 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-soft">
                                    {s().response ?? "no response recorded"}
                                </pre>
                            </Show>
                        </>
                    )}
                </Show>
            </div>
        </>
    );
};

/* ------------------------------------------------------- rendered output */

/**
 * What the run produced, painted by the same engine the product paints with. Selection is shared
 * with the call rail, so a section and the verdict on it are always the same target.
 */
const Rendered: Component<{
    content: ArtifactContent;
    checks: EvalCheck[];
    judgements: EvalJudgement[];
    step: string;
    onPick: (step: string) => void;
}> = (props) => {
    const artifactFails = createMemo(() =>
        props.checks.filter((c) => c.target === "artifact" && !c.pass),
    );
    // the run's own format, not a preview of another one
    const format = (): string => props.content.format;

    // A definite height, not a max: PreviewCanvas is h-full and scrolls itself, so without one it
    // grows to the whole artifact and the page ends up carrying the scroll.
    return (
        <div class="flex h-160 flex-col lg:h-full lg:min-h-0">
            <Show when={artifactFails().length}>
                <div class="flex flex-wrap gap-1.5 border-b border-line px-3 py-1.5">
                    <For each={artifactFails()}>
                        {(c) => (
                            <span class="rounded-[var(--radius)] border border-fail px-1.5 py-px font-mono text-[10px] text-fail">
                                {c.id}
                                <Show when={c.detail}>{(d) => <> · {d()}</>}</Show>
                            </span>
                        )}
                    </For>
                </div>
            </Show>
            {/* The editor's own painter: natural section heights, the artifact's backdrop, and the
                continuous-vs-paged gap the format asks for. Same component the template gallery
                uses, so a deck reads as a deck and a doc as one page. */}
            <div class="min-h-0 flex-1">
                <PreviewCanvas
                    content={props.content}
                    format={format}
                    themeId={appTheme()}
                    selected={props.step.startsWith("section:") ? props.step.slice(8) : undefined}
                    onSelect={(id) => props.onPick(`section:${id}`)}
                    onActive={(id) => props.onPick(`section:${id}`)}
                    mark={(id) => {
                        if (props.checks.some((c) => c.target === `section:${id}` && !c.pass))
                            return "fail";
                        const v = props.judgements.find((j) => j.target === `section:${id}`);
                        return v && scoreOf(v) < WEAK ? "warn" : null;
                    }}
                />
            </div>
        </div>
    );
};

const Middle: Component<{ run: EvalRun; step: string; onPick: (s: string) => void }> = (props) => {
    const [pane, setPane] = createSignal<Pane>("trace");
    return (
        <div class={paneCol}>
            <div class="flex flex-none items-center gap-2 border-b border-line px-3 py-1.5">
                <span class="truncate font-mono text-[12px] text-ink">
                    {props.step || "unattributed"}
                </span>
                <div class="flex-1" />
                <IconButton
                    size="sm"
                    active={pane() === "trace"}
                    title="The model calls behind this step"
                    onClick={() => setPane("trace")}
                >
                    <Icon name="code" size={14} />
                </IconButton>
                <IconButton
                    size="sm"
                    active={pane() === "artifact"}
                    title="What the run produced"
                    onClick={() => setPane("artifact")}
                >
                    <Icon name="sections" size={14} />
                </IconButton>
            </div>
            <Show when={pane() === "trace"}>
                <CallDetail run={props.run} step={props.step} />
            </Show>
            <Show when={pane() === "artifact"}>
                <Show
                    when={props.run.content?.sections.length}
                    fallback={
                        <EmptyState
                            class="py-16"
                            title="This run stored no content"
                            subtitle="Only runs that finished a build keep the artifact they produced."
                        />
                    }
                >
                    <Rendered
                        content={props.run.content!}
                        checks={props.run.checks}
                        judgements={props.run.judgements}
                        step={props.step}
                        onPick={props.onPick}
                    />
                </Show>
            </Show>
        </div>
    );
};

const Verdict: Component<{ run: EvalRun; rubric: Rubric; target: string }> = (props) => {
    const v = createMemo((): EvalJudgement | undefined =>
        props.run.judgements.find((j) => j.target === props.target),
    );
    const failedChecks = createMemo((): EvalCheck[] =>
        props.run.checks.filter((c) => c.target === props.target && !c.pass),
    );
    return (
        <div class="flex min-w-0 flex-col lg:h-full lg:min-h-0">
            <div class="flex flex-none items-center justify-between border-b border-line px-3 py-2">
                <Eyebrow as="div">Verdict</Eyebrow>
                <Show when={v()}>
                    {(j) => (
                        <span class="font-mono text-[10.5px] tabular-nums text-muted">
                            {j().rubricVersion}
                        </span>
                    )}
                </Show>
            </div>

            <div class={scrollPane}>
                <Show when={failedChecks().length}>
                    <div class="flex flex-wrap gap-1.5 border-b border-line px-3 py-2">
                        <For each={failedChecks()}>
                            {(c) => (
                                <span class="rounded-[var(--radius)] border border-fail px-1.5 py-px font-mono text-[10px] text-fail">
                                    {c.id}
                                    <Show when={c.detail}>{(d) => <> · {d()}</>}</Show>
                                </span>
                            )}
                        </For>
                    </div>
                </Show>

                <Show
                    when={v()}
                    fallback={<p class="px-3 py-3 text-[12px] text-muted">Not judged yet.</p>}
                >
                    {(j) => (
                        <div class="px-3 py-2">
                            <div class="mb-2 flex items-center gap-2">
                                <Meter
                                    value={scoreOf(j()) * 100}
                                    tone={scoreOf(j()) < WEAK ? "fail" : "accent"}
                                    trackTone="canvas"
                                    class="flex-1"
                                />
                                <span class="font-mono text-[11px] tabular-nums text-ink">
                                    {pct(scoreOf(j()))}
                                </span>
                            </div>
                            <For each={j().answers}>
                                {(a) => (
                                    <div class="border-t border-line py-1.5">
                                        <div class="flex items-baseline gap-2">
                                            <span
                                                class={`font-mono text-[11px] ${
                                                    a.yes ? "text-pass" : "font-semibold text-fail"
                                                }`}
                                            >
                                                {a.yes ? "Y" : "N"}
                                            </span>
                                            <span class="font-mono text-[11px] text-soft">
                                                {a.id}
                                            </span>
                                        </div>
                                        <Show when={!a.yes}>
                                            <p class="mt-0.5 text-[11.5px] text-muted">{a.why}</p>
                                            <p class="mt-0.5 text-[11px] text-muted italic">
                                                {
                                                    props.rubric.questions.find(
                                                        (q) => q.id === a.id,
                                                    )?.ask
                                                }
                                            </p>
                                        </Show>
                                    </div>
                                )}
                            </For>
                        </div>
                    )}
                </Show>
            </div>
        </div>
    );
};

const RunDetail: Component<{ id: string; onClose: () => void }> = (props) => {
    const [rubric, setRubric] = createSignal<Rubric | null>(null);
    const [run, setRun] = createSignal<EvalRun | null>(null);
    const [step, setStep] = createSignal<string | null>(null);
    const [judging, setJudging] = createSignal(false);

    // layout checks need the engine, which services may not import, so they are computed here once
    const load = async (id: string): Promise<void> => {
        const r = (await api.getEvalRun(id)).run;
        setRun(r);
        if (!r.content || r.checks.some((c) => c.dimension === "layout")) return;
        const fits = fitChecks(r.content);
        if (!fits.length) return;
        await api.postEvalChecks(id, fits).catch(() => undefined);
        setRun((prev) =>
            prev && prev.id === id ? { ...prev, checks: [...prev.checks, ...fits] } : prev,
        );
    };

    const judge = async (r: EvalRun): Promise<void> => {
        if (judging()) return;
        setJudging(true);
        try {
            const { judgements } = await api.judgeEvalRun(r.id);
            setRun((prev) => (prev && prev.id === r.id ? { ...prev, judgements } : prev));
        } finally {
            setJudging(false);
        }
    };

    onMount(() => {
        void api.getEvalRubric().then((r) => setRubric(r.rubric));
    });
    createEffect(() => {
        const id = props.id;
        setRun(null);
        setStep(null);
        void load(id);
    });

    const current = (): string => step() ?? stepsOf(run()?.spans ?? [])[0] ?? "";

    return (
        <Show
            when={run()}
            fallback={
                <div class="grid flex-1 place-items-center">
                    <Spinner />
                </div>
            }
        >
            {(r) => (
                <div class="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[var(--radius)] border border-line bg-panel">
                    <TopBar run={r()} onClose={props.onClose} />
                    <div class="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
                        <span class="min-w-0 flex-1 truncate text-[13px] text-soft">
                            {r().config.meta.prompt || "(no prompt)"}
                        </span>
                        <Show when={!r().judgements.length}>
                            <Button
                                variant="outline"
                                size="sm"
                                loading={judging()}
                                onClick={() => void judge(r())}
                            >
                                Run the judge
                            </Button>
                        </Show>
                    </div>
                    <div class="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-[232px_minmax(0,1fr)_340px] lg:overflow-hidden">
                        <CallRail run={r()} step={current()} onPick={setStep} />
                        <Middle run={r()} step={current()} onPick={setStep} />
                        <Show when={rubric()}>
                            {(rb) => (
                                <Verdict run={r()} rubric={rb()} target={targetOf(current())} />
                            )}
                        </Show>
                    </div>
                </div>
            )}
        </Show>
    );
};

/* ------------------------------------------------------------------ shell */

export const EvalView: Component = () => {
    const [runs, setRuns] = createSignal<EvalRunSummary[]>([]);
    const [cursor, setCursor] = createSignal<string | null>(null);
    const [loading, setLoading] = createSignal(true);
    const [error, setError] = createSignal<string | null>(null);
    const [tracing, setTracing] = createSignal(traceTurns());

    const load = async (append = false): Promise<void> => {
        setLoading(true);
        try {
            const page = await api.listEvalRuns(append ? cursor() : null);
            setRuns((prev) => (append ? [...prev, ...page.runs] : page.runs));
            setCursor(page.nextCursor);
            setError(null);
        } catch (e) {
            setError(e instanceof Error ? e.message : "unknown");
        } finally {
            setLoading(false);
        }
    };
    onMount(() => void load());

    const toggle = (v: boolean): void => {
        setTraceTurns(v);
        setTracing(v);
    };

    // the open run is the URL, so a detail page can be linked to and the back button works
    const params = useParams();
    const navigate = useNavigate();
    const open = (): string | null => params.id ?? null;
    const setOpen = (id: string | null): void => navigate(id ? `/eval/${id}` : "/eval");

    // a run generated from here lands after the studio closes, so pick it up then
    let wasOpen = generateOpen();
    createEffect(() => {
        const now = generateOpen();
        if (wasOpen && !now) void load();
        wasOpen = now;
    });

    return (
        <main class="h-dvh overflow-hidden bg-canvas text-ink">
            <div class="flex h-full flex-col">
                <Show
                    when={!open()}
                    fallback={
                        // Full-bleed rather than the list page's centring margins: the rail and
                        // verdict are fixed columns, so every pixel goes to the preview. Side
                        // padding is twice the vertical, enough to breathe without giving that back.
                        <div class="flex min-h-0 flex-1 flex-col px-4 py-2 md:px-5 md:py-2.5">
                            <RunDetail id={open()!} onClose={() => setOpen(null)} />
                        </div>
                    }
                >
                    <div class="mx-auto flex w-full min-h-0 max-w-360 flex-1 flex-col gap-3 px-2 py-4 md:px-3 md:py-5">
                        <header class="flex flex-none flex-wrap items-center gap-x-3 gap-y-2 rounded-[var(--radius)] border border-line bg-panel px-4 py-2.5">
                            <div class="min-w-0">
                                <Eyebrow as="div">galleo / eval</Eyebrow>
                                <h1 class="text-[15px] leading-tight font-semibold tracking-tight text-ink">
                                    Traced runs
                                </h1>
                            </div>
                            <div class="flex-1" />
                            <div class="flex items-center gap-2 text-[12px] text-soft">
                                <Toggle value={tracing()} onChange={toggle} />
                                <button type="button" onClick={() => toggle(!tracing())}>
                                    Trace my generations
                                </button>
                            </div>
                            {/* the real studio, not a copy of it: same surface a user gets, so a traced run
                        exercises the exact flow rather than an approximation */}
                            <Button
                                variant="primary"
                                size="sm"
                                onClick={() => {
                                    if (!tracing()) toggle(true);
                                    openGenerate();
                                }}
                            >
                                Generate an artifact
                            </Button>
                        </header>

                        <Show
                            when={!error()}
                            fallback={
                                <EmptyState
                                    class="flex-1"
                                    title="Couldn’t load runs"
                                    subtitle={`${error()} — the eval tools are only available to the demo@galleo.app account.`}
                                    action={
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => void load()}
                                        >
                                            Retry
                                        </Button>
                                    }
                                />
                            }
                        >
                            <Show
                                when={runs().length}
                                fallback={
                                    <Show
                                        when={!loading()}
                                        fallback={
                                            <div class="grid flex-1 place-items-center">
                                                <Spinner />
                                            </div>
                                        }
                                    >
                                        <EmptyState
                                            class="flex-1"
                                            title="No traced runs yet"
                                            subtitle="Turn on tracing, then generate from the studio as usual."
                                        />
                                    </Show>
                                }
                            >
                                <RunList
                                    runs={runs()}
                                    more={!!cursor()}
                                    loading={loading()}
                                    onMore={() => void load(true)}
                                    onOpen={setOpen}
                                />
                            </Show>
                        </Show>
                    </div>
                </Show>
            </div>
        </main>
    );
};
