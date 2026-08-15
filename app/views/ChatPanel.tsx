import { getContext } from "@ui/keys";
import type { Component, JSX } from "solid-js";
import { createEffect, createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { useNavigate } from "@solidjs/router";
import type { ChatBlock, GenBrief, WorkspaceAction } from "@model/ai";
import type { Section } from "@model/artifact";
import { estimateCost } from "@model/tools";
import { Credits } from "@app/components/credits";
import type { Tokens } from "@themes";
import { resolveTheme, themeCssVars } from "@themes";
import { placeholderSection } from "@canvas/elements/blueprint";
import { AgentIcon, Icon, UiThemeProvider } from "@ui/icons";
import { Markdown } from "@ui/markdown";
import { MiniCanvas } from "@app/components/previews";
import { VoiceInput } from "@app/components/VoiceInput";
import { Button, IconButton, Chip, Eyebrow, Spinner } from "@ui/button";
import { editor } from "@editor/core/store";
import { appTheme, appThemeOverride, appThemeVars, customThemes } from "@app/stores/theme";
import { formatLabel } from "@app/stores/library";
import { OUTPUT_BLOCKS, type ChatMsg, type UIBlock } from "@app/stores/chat-blocks";

type Proposal = Extract<ChatBlock, { type: "proposal" }>;
type Suggestions = Extract<ChatBlock, { type: "suggestions" }>;
type Sections = Extract<ChatBlock, { type: "sections" }>;
type Artifacts = Extract<ChatBlock, { type: "artifacts" }>;
type Templates = Extract<ChatBlock, { type: "templates" }>;
import {
    actionLabel,
    applyOutline,
    applyPlanRequest,
    applyWrite,
    applyProposal,
    applyTheme,
    busy,
    chatContextIds,
    chatOpen,
    clearSteer,
    closeChat,
    confirmAction,
    discardDraft,
    discardProposal,
    dismissAction,
    drafts,
    editorActive,
    startBrief,
    openChat,
    persistDraft,
    previewSource,
    resetThread,
    sendChat,
    setChatContextIds,
    shareArtifactAction,
    startDraftFromTemplate,
    stopChat,
    thread,
    toggleChat,
} from "@app/stores/chat";
import { generateOpen } from "@app/stores/generate";
import { AttachMenu, ContextChips } from "@app/components/context-attach";

const ProposalCard: Component<{
    msgId: number;
    blockId: string;
    applied?: "applied" | "discarded";
    proposal: Proposal;
}> = (props) => {
    let box!: HTMLDivElement;
    // size to the card's real width so it fills edge-to-edge
    const [w, setW] = createSignal(320);
    onMount(() => {
        const ro = new ResizeObserver(() => setW(box.clientWidth));
        ro.observe(box);
        setW(box.clientWidth);
        onCleanup(() => ro.disconnect());
    });
    // a named library artifact carries its own theme/format
    const src = (): { theme: string; format: string } =>
        props.proposal.targetArtifactId && props.proposal.theme && props.proposal.format
            ? { theme: props.proposal.theme, format: props.proposal.format }
            : previewSource();
    return (
        <div ref={box} class="mt-1 overflow-hidden rounded-xl border border-line bg-canvas">
            <Show when={props.proposal.preview}>
                {(sec) => (
                    <MiniCanvas
                        section={sec()}
                        themeId={src().theme}
                        formatId={src().format}
                        width={w()}
                    />
                )}
            </Show>
            <div class="flex items-center justify-between gap-2 border-t border-line px-3 py-2">
                <span class="truncate text-[12px] text-soft">{props.proposal.summary}</span>
                <Show
                    when={!props.applied}
                    fallback={
                        <span
                            class="flex-none text-[11px] font-semibold uppercase tracking-[0.1em]"
                            classList={{
                                "text-accent": props.applied === "applied",
                                "text-muted": props.applied === "discarded",
                            }}
                        >
                            <Show when={props.applied === "applied"} fallback="Discarded">
                                <Icon name="check" size={12} /> Applied
                            </Show>
                        </span>
                    }
                >
                    <span class="flex flex-none gap-1.5">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => discardProposal(props.msgId, props.blockId)}
                        >
                            Discard
                        </Button>
                        <Button
                            variant="primary"
                            size="sm"
                            onClick={() => applyProposal(props.msgId, props.blockId)}
                        >
                            Apply
                        </Button>
                    </span>
                </Show>
            </div>
        </div>
    );
};

type DesignedTheme = Extract<ChatBlock, { type: "theme" }>;

const ThemeCard: Component<{
    msgId: number;
    blockId: string;
    applied?: "applied" | "discarded";
    theme: DesignedTheme;
}> = (props) => {
    const tk = (): Tokens => props.theme.tokens;
    return (
        <div class="mt-1 overflow-hidden rounded-xl border border-line">
            <div class="flex flex-col gap-1 p-3" style={{ background: tk().bg, color: tk().ink }}>
                <span
                    class="text-[15px] leading-tight"
                    style={{ "font-family": `'${tk().fontDisplay}', serif` }}
                >
                    {props.theme.name}
                </span>
                <span class="text-[11.5px]" style={{ color: tk().muted }}>
                    {props.theme.mood} · {props.theme.isDark ? "dark" : "light"}
                </span>
                <div class="mt-1 flex gap-1">
                    <For each={[tk().accent, tk().surface, tk().line, tk().soft]}>
                        {(c) => (
                            <span
                                class="size-4 rounded-full"
                                style={{ background: c, outline: `1px solid ${tk().line}` }}
                            />
                        )}
                    </For>
                </div>
            </div>
            <div class="flex items-center justify-end gap-2 border-t border-line bg-canvas px-3 py-2">
                <Show
                    when={!props.applied}
                    fallback={
                        <span
                            class="flex-none text-[11px] font-semibold uppercase tracking-[0.1em]"
                            classList={{
                                "text-accent": props.applied === "applied",
                                "text-muted": props.applied === "discarded",
                            }}
                        >
                            <Show when={props.applied === "applied"} fallback="Discarded">
                                <Icon name="check" size={12} /> Applied
                            </Show>
                        </span>
                    }
                >
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => discardProposal(props.msgId, props.blockId)}
                    >
                        Discard
                    </Button>
                    <Button
                        variant="primary"
                        size="sm"
                        onClick={() => void applyTheme(props.msgId, props.blockId)}
                    >
                        Save + apply
                    </Button>
                </Show>
            </div>
        </div>
    );
};

type Steer = Extract<ChatBlock, { type: "steer" }>;

// the standing note is already in force by the time this renders; the card is the record of it
const SteerCard: Component<{
    msgId: number;
    blockId: string;
    applied?: "applied" | "discarded";
    steer: Steer;
}> = (props) => (
    <div class="mt-1 flex items-center gap-2 rounded-xl border border-accent/40 bg-accent/5 px-3 py-2">
        <Icon name="sparkle" size={12} />
        <span class="min-w-0 flex-1 text-[12px] leading-snug text-ink">
            <Show when={props.steer.note} fallback="Steering note cleared.">
                Steering the rest: {props.steer.note}
            </Show>
        </span>
        <Show when={props.steer.note && props.applied !== "discarded"}>
            <Button
                variant="ghost"
                size="sm"
                class="flex-none"
                onClick={() => clearSteer(props.msgId, props.blockId)}
            >
                Clear
            </Button>
        </Show>
    </div>
);

type PlanRequest = Extract<ChatBlock, { type: "plan" }>;

// planning is metered (the studio's plan turn), so the card prices it and waits for a go
const PlanCard: Component<{
    msgId: number;
    blockId: string;
    applied?: "applied" | "discarded";
    plan: PlanRequest;
}> = (props) => (
    <div class="mt-1 overflow-hidden rounded-xl border border-line bg-canvas">
        <div class="flex flex-col gap-0.5 px-3 py-2">
            <span class="text-[12px] text-ink">{props.plan.summary}</span>
            <Show when={props.plan.guidance}>
                <span class="text-[11.5px] leading-snug text-muted">“{props.plan.guidance}”</span>
            </Show>
            <Show when={props.plan.andWrite}>
                <span class="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
                    then every section, {estimateCost("add-section")} credits each
                </span>
            </Show>
        </div>
        <div class="flex items-center justify-end gap-2 border-t border-line px-3 py-2">
            <Show
                when={!props.applied}
                fallback={
                    <span
                        class="flex-none text-[11px] font-semibold uppercase tracking-[0.1em]"
                        classList={{
                            "text-accent": props.applied === "applied",
                            "text-muted": props.applied === "discarded",
                        }}
                    >
                        <Show when={props.applied === "applied"} fallback="Discarded">
                            <Icon name="check" size={12} /> Planning
                        </Show>
                    </span>
                }
            >
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => discardProposal(props.msgId, props.blockId)}
                >
                    Not now
                </Button>
                <Button
                    variant="primary"
                    size="sm"
                    onClick={() => applyPlanRequest(props.msgId, props.blockId)}
                >
                    {props.plan.andWrite ? "Plan + write all" : "Plan the outline"} ·{" "}
                    <Credits n={estimateCost("plan-outline")} />
                </Button>
            </Show>
        </div>
    </div>
);

type WriteRequest = Extract<ChatBlock, { type: "write" }>;

// writing beats is metered, so the card prices it and waits for a go
const WriteCard: Component<{
    msgId: number;
    blockId: string;
    applied?: "applied" | "discarded";
    write: WriteRequest;
}> = (props) => {
    const cost = (): number => props.write.beatIds.length * estimateCost("add-section");
    return (
        <div class="mt-1 overflow-hidden rounded-xl border border-line bg-canvas">
            <div class="flex flex-col gap-0.5 px-3 py-2">
                <span class="text-[12px] text-ink">{props.write.summary}</span>
                <span class="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
                    {props.write.beatIds.length} section
                    {props.write.beatIds.length === 1 ? "" : "s"} ·{" "}
                    {props.write.beatIds.join(" · ")}
                </span>
            </div>
            <div class="flex items-center justify-end gap-2 border-t border-line px-3 py-2">
                <Show
                    when={!props.applied}
                    fallback={
                        <span
                            class="flex-none text-[11px] font-semibold uppercase tracking-[0.1em]"
                            classList={{
                                "text-accent": props.applied === "applied",
                                "text-muted": props.applied === "discarded",
                            }}
                        >
                            {props.applied === "applied" ? "Writing" : "Discarded"}
                        </span>
                    }
                >
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => discardProposal(props.msgId, props.blockId)}
                    >
                        Not now
                    </Button>
                    <Button
                        variant="primary"
                        size="sm"
                        onClick={() => applyWrite(props.msgId, props.blockId)}
                    >
                        Write {props.write.beatIds.length} · <Credits n={cost()} />
                    </Button>
                </Show>
            </div>
        </div>
    );
};

type OutlineRevision = Extract<ChatBlock, { type: "outline" }>;

const OP_VERB: Record<string, string> = {
    addBeat: "Add",
    updateBeat: "Rewrite",
    removeBeat: "Remove",
    moveBeat: "Move",
};

// an outline revision has nothing to preview, so the ops list is the card
const OutlineCardProposal: Component<{
    msgId: number;
    blockId: string;
    applied?: "applied" | "discarded";
    outline: OutlineRevision;
}> = (props) => (
    <div class="mt-1 overflow-hidden rounded-xl border border-line bg-canvas">
        <div class="flex flex-col gap-1 px-3 py-2">
            <span class="text-[12px] text-ink">{props.outline.summary}</span>
            <For each={props.outline.ops}>
                {(op) => (
                    <span class="flex items-baseline gap-1.5 text-[11.5px] text-muted">
                        <span class="font-mono text-[9.5px] uppercase tracking-[0.12em] text-accent">
                            {OP_VERB[op.op] ?? op.op}
                        </span>
                        <span class="min-w-0 truncate">
                            {op.op === "addBeat"
                                ? op.beat.label
                                : op.op === "updateBeat"
                                  ? (op.patch.label ?? op.id)
                                  : op.id}
                        </span>
                    </span>
                )}
            </For>
        </div>
        <div class="flex items-center justify-end gap-2 border-t border-line px-3 py-2">
            <Show
                when={!props.applied}
                fallback={
                    <span
                        class="flex-none text-[11px] font-semibold uppercase tracking-[0.1em]"
                        classList={{
                            "text-accent": props.applied === "applied",
                            "text-muted": props.applied === "discarded",
                        }}
                    >
                        <Show when={props.applied === "applied"} fallback="Discarded">
                            <Icon name="check" size={12} /> Applied
                        </Show>
                    </span>
                }
            >
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => discardProposal(props.msgId, props.blockId)}
                >
                    Discard
                </Button>
                <Button
                    variant="primary"
                    size="sm"
                    onClick={() => applyOutline(props.msgId, props.blockId)}
                >
                    Update the outline
                </Button>
            </Show>
        </div>
    </div>
);

// bumped each reveal frame so the scroll container can track the newest text
const [revealPulse, setRevealPulse] = createSignal(0);

const SmoothText: Component<{
    text: string;
    done?: boolean;
    render: (shown: string) => JSX.Element;
}> = (props) => {
    const [shown, setShown] = createSignal(0);
    let raf = 0;
    let running = false;
    const tick = (): void => {
        const target = props.text.length;
        const cur = shown();
        if (cur >= target) {
            running = false;
            return;
        }
        // proportional to the backlog, min a few chars/frame
        const step = Math.max(2, Math.ceil((target - cur) / 7));
        setShown(Math.min(target, cur + step));
        setRevealPulse((n) => n + 1);
        raf = requestAnimationFrame(tick);
    };
    const kick = (): void => {
        if (!running) {
            running = true;
            raf = requestAnimationFrame(tick);
        }
    };
    createEffect(() => {
        const len = props.text.length;
        if (props.done) {
            cancelAnimationFrame(raf);
            running = false;
            setShown(len);
            return;
        }
        if (shown() > len) setShown(len); // guard a reset (target shrank)
        if (len > 0) kick();
    });
    onCleanup(() => cancelAnimationFrame(raf));
    return <>{props.render(props.text.slice(0, shown()))}</>;
};

// only step headlines reach here, never the full thought prose
const ThinkingBlock: Component<{ steps: string[]; done: boolean }> = (props) => {
    const [open, setOpen] = createSignal(false);
    const latest = (): string => props.steps[props.steps.length - 1] ?? "Thinking";
    const n = (): number => props.steps.length;

    return (
        <Show
            when={props.done}
            fallback={
                <div class="mt-0.5 flex items-center gap-2 py-0.5 text-[11.5px] text-muted">
                    <Spinner size={11} />
                    {/* keyed on the text so each new step fades in rather than snapping */}
                    <Show when={latest()} keyed>
                        {(text) => <span class="min-w-0 truncate gc-step">{text}…</span>}
                    </Show>
                    <style>{`
                      @keyframes gc-step { from { opacity: 0 } to { opacity: 1 } }
                      .gc-step { animation: gc-step 220ms ease-out both }
                      @media (prefers-reduced-motion: reduce) { .gc-step { animation: none } }
                    `}</style>
                </div>
            }
        >
            <Show when={n() > 0}>
                <div class="mt-0.5">
                    <button
                        class="flex items-center gap-1.5 py-0.5 text-[11px] text-muted transition-colors hover:text-soft"
                        onClick={() => setOpen((o) => !o)}
                    >
                        <Icon name="sparkle" size={11} />
                        <span>
                            Thought in {n()} step{n() === 1 ? "" : "s"}
                        </span>
                        <Icon name={open() ? "chevronDown" : "chevronRight"} size={11} />
                    </button>
                    <Show when={open()}>
                        <ol class="mt-1 flex flex-col gap-0.5 border-l border-line pl-2.5">
                            <For each={props.steps}>
                                {(step) => (
                                    <li class="text-[11px] leading-snug text-muted">{step}</li>
                                )}
                            </For>
                        </ol>
                    </Show>
                </div>
            </Show>
        </Show>
    );
};

const SURFACE_VERB: Record<string, string> = { deck: "deck", doc: "doc", web: "site" };
const BriefCard: Component<{
    msgId: number;
    blockId: string;
    brief: GenBrief;
    state: "pending" | "started" | "superseded";
}> = (props) => {
    const cost = (): number => estimateCost("generate-artifact", { length: props.brief.length });
    return (
        <div class="mt-1 rounded-xl border border-line bg-canvas p-3">
            <Eyebrow as="div" class="pb-1.5">
                Brief · {formatLabel(props.brief.surface)}
                {props.brief.length ? ` · ${props.brief.length}` : ""}
            </Eyebrow>
            <p class="text-[13px] leading-relaxed text-ink">{props.brief.prompt}</p>
            <div class="mt-2.5 flex items-center gap-2.5">
                <Show
                    when={props.state === "pending"}
                    fallback={
                        <span
                            class="text-[11px] font-semibold uppercase tracking-[0.1em]"
                            classList={{
                                "text-accent": props.state === "started",
                                "text-muted": props.state === "superseded",
                            }}
                        >
                            {props.state === "superseded"
                                ? "Superseded"
                                : busy()
                                  ? "Generating…"
                                  : "Generated"}
                        </span>
                    }
                >
                    <Button
                        variant="primary"
                        size="sm"
                        onClick={() => startBrief(props.msgId, props.blockId)}
                    >
                        Generate {SURFACE_VERB[props.brief.surface] ?? "artifact"} →
                    </Button>
                    <span class="text-[11px] text-muted">~{cost()} credits</span>
                </Show>
            </div>
        </div>
    );
};

const DRAFT_SECTION_W = 168;
const prefersReduced = (): boolean =>
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
// engine-rendered placeholder so its frame dims match the real sections exactly
const LOADING_SECTION: Section = placeholderSection({
    id: "loading",
    layout: "split-6040",
    blocks: ["text", "text"],
});
const ArtifactDraftCard: Component<{ draftId: string }> = (props) => {
    const navigate = useNavigate();
    const d = (): (typeof drafts)[string] | undefined => drafts[props.draftId];
    let strip!: HTMLDivElement;
    createEffect(() => {
        void d()?.content.sections.length;
        void d()?.status;
        queueMicrotask(() =>
            strip?.scrollTo({
                left: strip.scrollWidth,
                behavior: prefersReduced() ? "auto" : "smooth",
            }),
        );
    });
    const open = async (): Promise<void> => {
        const id = await persistDraft(props.draftId);
        if (id) {
            closeChat();
            navigate(`/edit/${id}`);
        }
    };
    return (
        <div class="mt-1 overflow-hidden rounded-xl border border-line bg-canvas">
            <Show when={d()}>
                {(draft) => (
                    <>
                        <div class="flex items-center gap-2 border-b border-line px-3 py-2">
                            <Show
                                when={draft().status === "building"}
                                fallback={<Icon name="sparkle" size={13} />}
                            >
                                <Spinner size={12} tone="accent" />
                            </Show>
                            <span class="min-w-0 flex-1 truncate text-[12px] font-medium text-ink">
                                {draft().title}
                            </span>
                            <Show when={draft().status === "building"}>
                                <span class="flex-none font-mono text-[10px] text-muted">
                                    {draft().total
                                        ? `${draft().done}/${draft().total}`
                                        : (draft().phase ?? "…")}
                                </span>
                            </Show>
                        </div>
                        <div ref={strip} class="flex gap-2.5 overflow-x-auto px-3 py-3">
                            <For each={draft().content.sections}>
                                {(sec, i) => (
                                    <div class="flex-none">
                                        <MiniCanvas
                                            section={sec}
                                            themeId={draft().content.theme}
                                            formatId={draft().content.format}
                                            width={DRAFT_SECTION_W}
                                            class="rounded-lg border border-line"
                                        />
                                        <div class="mt-1 text-center font-mono text-[9px] text-muted">
                                            {String(i() + 1).padStart(2, "0")}
                                        </div>
                                    </div>
                                )}
                            </For>
                            <Show when={draft().status === "building"}>
                                <div class="flex-none">
                                    <div class="relative animate-pulse">
                                        <MiniCanvas
                                            section={LOADING_SECTION}
                                            themeId={draft().content.theme}
                                            formatId={draft().content.format}
                                            width={DRAFT_SECTION_W}
                                            class="rounded-lg border border-dashed border-accent/40 opacity-25"
                                        />
                                        <div class="absolute inset-0 grid place-items-center">
                                            <Spinner size={14} tone="accent" />
                                        </div>
                                    </div>
                                    <div class="mt-1 text-center font-mono text-[9px] text-muted">
                                        {draft().content.sections.length ? "writing" : "planning"}
                                    </div>
                                </div>
                            </Show>
                        </div>
                        <div class="flex items-center justify-between gap-2 border-t border-line px-3 py-2">
                            <span class="min-w-0 truncate text-[11px] text-muted">
                                <Show
                                    when={draft().status === "error"}
                                    fallback={`${draft().content.sections.length} section${draft().content.sections.length === 1 ? "" : "s"}`}
                                >
                                    <span class="text-[#e5484d]">{draft().error}</span>
                                </Show>
                            </span>
                            <Show
                                when={draft().state === "live"}
                                fallback={
                                    <span
                                        class="flex-none text-[11px] font-semibold uppercase tracking-[0.1em]"
                                        classList={{
                                            "text-accent": draft().state === "opened",
                                            "text-muted": draft().state === "discarded",
                                        }}
                                    >
                                        {draft().state === "opened" ? "Opened" : "Discarded"}
                                    </span>
                                }
                            >
                                <span class="flex flex-none gap-1.5">
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => discardDraft(props.draftId)}
                                    >
                                        Discard
                                    </Button>
                                    <Button
                                        variant="primary"
                                        size="sm"
                                        disabled={draft().status !== "ready"}
                                        onClick={() => void open()}
                                    >
                                        Open in editor →
                                    </Button>
                                </span>
                            </Show>
                        </div>
                    </>
                )}
            </Show>
        </div>
    );
};

const ArtifactsList: Component<{ items: Artifacts["items"] }> = (props) => {
    const navigate = useNavigate();
    const open = (id: string): void => {
        closeChat();
        navigate(`/edit/${id}`);
    };
    return (
        <div class="mt-1 flex flex-col gap-1">
            <For each={props.items}>
                {(a) => (
                    <button
                        class="flex items-center gap-2.5 rounded-lg border border-line bg-canvas px-2.5 py-2 text-left transition-colors hover:border-accent"
                        onClick={() => open(a.id)}
                    >
                        <Icon name="sparkle" size={13} />
                        <span class="min-w-0 flex-1 truncate text-[12.5px] font-medium text-ink">
                            {a.title}
                        </span>
                        <span class="flex-none font-mono text-[9.5px] uppercase tracking-[0.1em] text-muted">
                            {formatLabel(a.format)}
                        </span>
                    </button>
                )}
            </For>
        </div>
    );
};

const ActionCard: Component<{
    msgId: number;
    blockId: string;
    action: WorkspaceAction;
    state: "pending" | "done" | "dismissed";
}> = (props) => {
    const navigate = useNavigate();
    const route = (): void => {
        const a = props.action;
        if (a.kind === "share") shareArtifactAction(a.id);
        else if (a.kind === "export") {
            closeChat();
            navigate(`/edit/${a.id}`);
        }
    };
    const routing = (): boolean => props.action.kind === "share" || props.action.kind === "export";
    return (
        <Show
            when={routing()}
            fallback={
                <Show
                    when={props.state === "pending"}
                    fallback={
                        <div
                            class="mt-1 text-[11.5px]"
                            classList={{
                                "text-soft": props.state === "done",
                                "text-muted line-through": props.state === "dismissed",
                            }}
                        >
                            {actionLabel(props.action)}
                            <Show when={props.state === "done"}>
                                {" "}
                                <Icon name="check" size={11} />
                            </Show>
                        </div>
                    }
                >
                    <div class="mt-1 rounded-xl border border-line bg-canvas p-3">
                        <p class="text-[12.5px] text-ink">{actionLabel(props.action)}?</p>
                        <div class="mt-2.5 flex items-center gap-1.5">
                            <Button
                                variant="primary"
                                size="sm"
                                onClick={() => confirmAction(props.msgId, props.blockId)}
                            >
                                Move to Trash
                            </Button>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => dismissAction(props.msgId, props.blockId)}
                            >
                                Cancel
                            </Button>
                        </div>
                    </div>
                </Show>
            }
        >
            <button
                class="mt-1 flex w-full items-center gap-2 rounded-lg border border-line bg-canvas px-2.5 py-2 text-left text-[12.5px] font-medium text-ink transition-colors hover:border-accent"
                onClick={route}
            >
                <Icon name="sparkle" size={13} />
                <span class="min-w-0 flex-1 truncate">{actionLabel(props.action)}</span>
                <span class="flex-none text-muted">→</span>
            </button>
        </Show>
    );
};

const TemplatesList: Component<{ items: Templates["items"] }> = (props) => (
    <div class="mt-1 flex flex-col gap-1">
        <For each={props.items}>
            {(t) => (
                <button
                    class="flex items-center gap-2.5 rounded-lg border border-line bg-canvas px-2.5 py-2 text-left transition-colors hover:border-accent"
                    onClick={() => void startDraftFromTemplate(t.id)}
                >
                    <Icon name="sparkle" size={13} />
                    <span class="min-w-0 flex-1 truncate text-[12.5px] font-medium text-ink">
                        {t.name}
                    </span>
                    <span class="flex-none font-mono text-[9.5px] uppercase tracking-[0.1em] text-muted">
                        {t.category}
                    </span>
                </button>
            )}
        </For>
    </div>
);

const BlockView: Component<{ msgId: number; b: UIBlock }> = (props) => (
    <>
        <Show when={props.b.k === "thinking" ? props.b : null}>
            {(b) => <ThinkingBlock steps={b().steps} done={b().done} />}
        </Show>
        <Show when={props.b.k === "brief" ? props.b : null}>
            {(b) => (
                <BriefCard
                    msgId={props.msgId}
                    blockId={b().blockId}
                    brief={b().brief}
                    state={b().state}
                />
            )}
        </Show>
        <Show when={props.b.k === "action" ? props.b : null}>
            {(b) => (
                <ActionCard
                    msgId={props.msgId}
                    blockId={b().blockId}
                    action={b().action}
                    state={b().state}
                />
            )}
        </Show>
        <Show when={props.b.k === "draft" ? props.b : null}>
            {(b) => <ArtifactDraftCard draftId={b().draftId} />}
        </Show>
        <Show when={props.b.k === "text" ? props.b : null}>
            {(b) => <SmoothText text={b().text} render={(s) => <Markdown text={s} />} />}
        </Show>
        <Show when={props.b.k === "tool" && !props.b.done ? props.b : null}>
            {(b) => (
                <div class="mt-1 inline-flex max-w-full items-center gap-2 rounded-full border border-line bg-canvas px-3 py-1.5 text-[11.5px] text-soft">
                    <Spinner size={12} />
                    <span class="flex-none">{b().title}…</span>
                    {/* the capability's own progress line, forwarded as chat.nested */}
                    <Show when={b().detail}>
                        <span class="min-w-0 truncate text-muted">{b().detail}</span>
                    </Show>
                </div>
            )}
        </Show>
        <Show when={props.b.k === "widget" && props.b.block.type === "theme" ? props.b : null}>
            {(b) => (
                <ThemeCard
                    msgId={props.msgId}
                    blockId={b().blockId}
                    applied={b().applied}
                    theme={b().block as DesignedTheme}
                />
            )}
        </Show>
        <Show when={props.b.k === "widget" && props.b.block.type === "steer" ? props.b : null}>
            {(b) => (
                <SteerCard
                    msgId={props.msgId}
                    blockId={b().blockId}
                    applied={b().applied}
                    steer={b().block as Steer}
                />
            )}
        </Show>
        <Show when={props.b.k === "widget" && props.b.block.type === "write" ? props.b : null}>
            {(b) => (
                <WriteCard
                    msgId={props.msgId}
                    blockId={b().blockId}
                    applied={b().applied}
                    write={b().block as WriteRequest}
                />
            )}
        </Show>
        <Show when={props.b.k === "widget" && props.b.block.type === "plan" ? props.b : null}>
            {(b) => (
                <PlanCard
                    msgId={props.msgId}
                    blockId={b().blockId}
                    applied={b().applied}
                    plan={b().block as PlanRequest}
                />
            )}
        </Show>
        <Show when={props.b.k === "widget" && props.b.block.type === "outline" ? props.b : null}>
            {(b) => (
                <OutlineCardProposal
                    msgId={props.msgId}
                    blockId={b().blockId}
                    applied={b().applied}
                    outline={b().block as OutlineRevision}
                />
            )}
        </Show>
        <Show when={props.b.k === "widget" && props.b.block.type === "proposal" ? props.b : null}>
            {(b) => (
                <ProposalCard
                    msgId={props.msgId}
                    blockId={b().blockId}
                    applied={b().applied}
                    proposal={b().block as Proposal}
                />
            )}
        </Show>
        <Show
            when={props.b.k === "widget" && props.b.block.type === "suggestions" ? props.b : null}
        >
            {(b) => (
                <div class="mt-1.5 flex flex-col items-start gap-1">
                    <For each={(b().block as Suggestions).items}>
                        {(s) => (
                            <Chip
                                variant="outline"
                                rounded="md"
                                class="max-w-full"
                                disabled={busy()}
                                onClick={() => void sendChat(s)}
                            >
                                {s}
                            </Chip>
                        )}
                    </For>
                </div>
            )}
        </Show>
        <Show when={props.b.k === "widget" && props.b.block.type === "artifacts" ? props.b : null}>
            {(b) => <ArtifactsList items={(b().block as Artifacts).items} />}
        </Show>
        <Show when={props.b.k === "widget" && props.b.block.type === "templates" ? props.b : null}>
            {(b) => <TemplatesList items={(b().block as Templates).items} />}
        </Show>
        <Show when={props.b.k === "widget" && props.b.block.type === "sections" ? props.b : null}>
            {(b) => (
                <div class="-mx-1 mt-1 flex gap-2.5 overflow-x-auto px-1 pb-1.5">
                    <For each={(b().block as Sections).sections}>
                        {(sec, i) => (
                            <div class="flex-none">
                                <MiniCanvas
                                    section={sec}
                                    themeId={previewSource().theme}
                                    formatId={
                                        (b().block as Sections).format ?? previewSource().format
                                    }
                                    width={152}
                                    class="rounded-lg border border-line"
                                />
                                <div class="mt-1 text-center font-mono text-[9px] text-muted">
                                    {String(i() + 1).padStart(2, "0")}
                                </div>
                            </div>
                        )}
                    </For>
                </div>
            )}
        </Show>
    </>
);

// exported so the generation studio's console renders the same thread as the dock
export const MessageView: Component<{ m: ChatMsg }> = (props) => (
    <Show
        when={props.m.role === "assistant"}
        fallback={
            <div class="flex justify-end">
                <div class="max-w-[85%] rounded-2xl rounded-br-sm bg-accent px-3 py-2 text-[13px] leading-relaxed text-onaccent">
                    {props.m.blocks.map((b) => (b.k === "text" ? b.text : "")).join("")}
                </div>
            </div>
        }
    >
        <div class="flex flex-col gap-1">
            {/* cards stay inert until the turn stops streaming: clicking one mid-turn hit the
                busy() guard and did nothing. A block's kind never changes, so this Show never
                re-branches. */}
            <For each={props.m.blocks}>
                {(b) => (
                    <Show
                        when={OUTPUT_BLOCKS.includes(b.k)}
                        fallback={<BlockView msgId={props.m.id} b={b} />}
                    >
                        <div
                            inert={props.m.streaming}
                            classList={{ "opacity-45": props.m.streaming }}
                            class="transition-opacity duration-200 motion-reduce:transition-none"
                        >
                            <BlockView msgId={props.m.id} b={b} />
                        </div>
                    </Show>
                )}
            </For>
            <Show when={props.m.streaming && props.m.blocks.length === 0}>
                <Spinner size={12} />
            </Show>
        </div>
    </Show>
);

const EDITOR_EXAMPLES = [
    "What's this artifact missing?",
    "Add a closing call-to-action",
    "Make the intro punchier",
];
const LIBRARY_EXAMPLES = [
    "Design a pitch deck for a travel startup",
    "Make a landing page for a meal-kit app",
    "Help me plan a report",
];
const inEditor = (): boolean => editorActive();
const emptyPrompt = (): string =>
    inEditor()
        ? "Ask about the open artifact, or tell me what to add or change, and I'll propose it for you to apply."
        : "Nothing open yet. Tell me what to make and I'll build it here for you to refine, or ask me anything.";
const emptyExamples = (): string[] => (inEditor() ? EDITOR_EXAMPLES : LIBRARY_EXAMPLES);

export const ChatPanel: Component = () => {
    const [input, setInput] = createSignal("");
    // the studio hosts the same thread in its console, so the dock stands down while it is open;
    // the eval views are an operator tool where a product chat bubble is only in the way
    const hidden = (): boolean => generateOpen() || getContext("eval");
    let list!: HTMLDivElement;
    let field!: HTMLTextAreaElement;

    // collapse to 0 first so an empty box measures one line; re-measure on open (first is off-screen)
    const autosize = (): void => {
        if (!field) return;
        field.style.height = "0px";
        field.style.height = `${Math.min(field.scrollHeight, 128)}px`;
    };
    createEffect(() => {
        input();
        chatOpen();
        queueMicrotask(autosize);
    });

    // read block text lengths so streaming growth re-triggers this
    createEffect(() => {
        const tick = thread.messages.reduce(
            (n, m) => n + m.blocks.reduce((k, b) => k + (b.k === "text" ? b.text.length : 1), 0),
            thread.messages.length,
        );
        void tick;
        queueMicrotask(() => list?.scrollTo({ top: list.scrollHeight }));
    });

    // pin newest text only when near the bottom, so scrolling up isn't yanked down
    createEffect(() => {
        revealPulse();
        if (list && list.scrollHeight - list.scrollTop - list.clientHeight < 80) {
            list.scrollTo({ top: list.scrollHeight });
        }
    });

    const submit = (): void => {
        const t = input().trim();
        if (!t) return;
        setInput("");
        void sendChat(t);
    };

    // follows the artifact theme in the editor; customThemes() re-resolves a custom one after load
    const chatTokens = createMemo((): Tokens => {
        customThemes();
        if (editorActive()) return resolveTheme(editor.artifact.theme).tokens;
        return appThemeOverride() ?? resolveTheme(appTheme()).tokens;
    });
    const chatVars = createMemo((): JSX.CSSProperties => {
        customThemes();
        return editorActive() ? (themeCssVars(chatTokens()) as JSX.CSSProperties) : appThemeVars();
    });

    return (
        <UiThemeProvider tokens={chatTokens}>
            <div style={chatVars()} classList={{ hidden: hidden() }}>
                <Show when={!chatOpen()}>
                    <button
                        class="fixed bottom-[calc(1.5rem+env(safe-area-inset-bottom))] right-6 z-drawer flex h-12 w-12 items-center justify-center rounded-full bg-accent text-onaccent shadow-xl transition-transform hover:scale-105"
                        title="Chat with Galleo Agent"
                        onClick={openChat}
                    >
                        <AgentIcon size={24} />
                    </button>
                </Show>

                <div
                    class="fixed right-0 top-0 z-drawer flex h-dvh w-full flex-col border-l border-line bg-panel shadow-2xl transition-transform duration-200 md:w-100 md:max-w-[92vw]"
                    style={{ transform: chatOpen() ? "translateX(0)" : "translateX(105%)" }}
                >
                    <header class="flex flex-none items-center justify-between border-b border-line px-4 py-3">
                        <span class="flex items-center gap-2 text-[13px] font-semibold text-ink">
                            <span class="text-accent">
                                <AgentIcon size={17} />
                            </span>
                            Galleo Agent
                        </span>
                        <span class="flex items-center gap-1">
                            <Button variant="ghost" size="sm" onClick={resetThread}>
                                Clear
                            </Button>
                            <IconButton
                                tone="muted"
                                rounded="md"
                                class="text-[15px] leading-none"
                                title="Close"
                                onClick={closeChat}
                            >
                                ×
                            </IconButton>
                        </span>
                    </header>

                    <div ref={list} class="flex-1 space-y-4 overflow-y-auto px-4 py-4">
                        <Show
                            when={thread.messages.length}
                            fallback={
                                <div class="flex h-full flex-col items-center justify-center gap-3 text-center">
                                    <p class="max-w-60 text-[13px] leading-relaxed text-muted">
                                        {emptyPrompt()}
                                    </p>
                                    <div class="flex flex-wrap justify-center gap-1.5">
                                        <For each={emptyExamples()}>
                                            {(e) => (
                                                <Chip
                                                    variant="outline"
                                                    onClick={() => void sendChat(e)}
                                                >
                                                    {e}
                                                </Chip>
                                            )}
                                        </For>
                                    </div>
                                </div>
                            }
                        >
                            <For each={thread.messages}>{(m) => <MessageView m={m} />}</For>
                        </Show>
                    </div>

                    <div class="relative flex-none border-t border-line p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
                        <Show when={chatContextIds().length}>
                            <div class="mb-1.5 flex flex-wrap gap-1">
                                <ContextChips
                                    ids={chatContextIds()}
                                    title="Attached context, which the agent retrieves from"
                                    onRemove={(id) =>
                                        setChatContextIds(chatContextIds().filter((c) => c !== id))
                                    }
                                />
                            </div>
                        </Show>
                        <div class="flex items-center gap-2 rounded-xl border border-line bg-canvas px-2.5 py-2 focus-within:border-accent">
                            <AttachMenu
                                size="sm"
                                rounded="md"
                                class="flex-none"
                                collections={{
                                    selected: chatContextIds(),
                                    onChange: setChatContextIds,
                                    emptyCopy:
                                        "No contexts yet. Build one from the + menu on the generate screen, then attach it here.",
                                }}
                            />
                            <textarea
                                ref={field}
                                class="block max-h-32 flex-1 resize-none overflow-y-auto bg-transparent align-middle text-[13px] leading-[1.4] text-ink outline-none placeholder:text-muted"
                                rows={1}
                                placeholder="Message the agent…"
                                value={input()}
                                onInput={(e) => setInput(e.currentTarget.value)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter" && !e.shiftKey) {
                                        e.preventDefault();
                                        submit();
                                    }
                                }}
                            />
                            <VoiceInput
                                field={() => field}
                                value={input}
                                setValue={setInput}
                                // mid-turn the send would no-op and clear — keep the text as a draft
                                onAutoSend={() => !busy() && submit()}
                            />
                            <Show
                                when={!busy()}
                                fallback={
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        class="flex-none"
                                        onClick={stopChat}
                                    >
                                        Stop
                                    </Button>
                                }
                            >
                                <Button
                                    variant="primary"
                                    size="sm"
                                    class="flex-none"
                                    disabled={!input().trim()}
                                    onClick={submit}
                                >
                                    Send
                                </Button>
                            </Show>
                        </div>
                    </div>
                </div>
            </div>
        </UiThemeProvider>
    );
};

export { toggleChat };
