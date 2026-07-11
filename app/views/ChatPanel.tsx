import type { Component } from "solid-js";
import { createEffect, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { useNavigate } from "@solidjs/router";
import type { ChatBlock, GenBrief } from "@model/ai";
import { estimateCost } from "@model/tools";
import { AgentIcon, Icon } from "@ui/icons";
import { Markdown } from "@ui/markdown";
import { MiniCanvas } from "../components/previews";
import { Button, IconButton, Chip, Eyebrow, Spinner } from "@ui/button";
import { formatLabel } from "../stores/library";
import type { ChatMsg, UIBlock } from "../stores/chat";

type Proposal = Extract<ChatBlock, { type: "proposal" }>;
type Suggestions = Extract<ChatBlock, { type: "suggestions" }>;
type Sections = Extract<ChatBlock, { type: "sections" }>;
import {
    applyProposal,
    busy,
    chatOpen,
    closeChat,
    discardDraft,
    discardProposal,
    drafts,
    editorActive,
    generateFromBrief,
    openChat,
    persistDraft,
    previewSource,
    resetThread,
    sendChat,
    stopChat,
    thread,
    toggleChat,
} from "../stores/chat";

// The chat panel — an app-layer singleton dock (mounted in AppShell). Sends a chat turn per message and
// renders the streamed blocks: text, a "working…" tool shell, a proposal (a real MiniCanvas of the section +
// Apply/Discard, which commits to the editor), and suggestion chips. Ephemeral thread for now — enough to
// exercise the agent + registry end to end.

// ---- one block ----

const ProposalCard: Component<{
    msgId: number;
    blockId: string;
    applied?: "applied" | "discarded";
    proposal: Proposal;
}> = (props) => {
    let box!: HTMLDivElement;
    // Size the canvas to the card's real width so it fills edge-to-edge (no background band on the right).
    const [w, setW] = createSignal(320);
    onMount(() => {
        const ro = new ResizeObserver(() => setW(box.clientWidth));
        ro.observe(box);
        setW(box.clientWidth);
        onCleanup(() => ro.disconnect());
    });
    return (
        <div ref={box} class="mt-1 overflow-hidden rounded-xl border border-line bg-canvas">
            <Show when={props.proposal.preview}>
                {(sec) => (
                    <MiniCanvas
                        section={sec()}
                        themeId={previewSource().theme}
                        formatId={previewSource().format}
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
                            {props.applied === "applied" ? "Applied ✓" : "Discarded"}
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

// The agent's thinking trace — streams into an expanded bubble while the model reasons, then auto-collapses
// when the answer starts (but stays, so the user can re-open and read the reasoning). Turns the pre-answer
// wait into visible progress instead of a dead loader.
const ReasoningBlock: Component<{ text: string; done: boolean }> = (props) => {
    const [open, setOpen] = createSignal(!props.done);
    createEffect(() => {
        if (props.done) setOpen(false);
    });
    return (
        <div class="mt-0.5 overflow-hidden rounded-lg border border-line bg-canvas/60">
            <button
                class="flex w-full items-center gap-2 px-2.5 py-1.5 text-[11.5px] font-medium text-muted transition-colors hover:text-soft"
                onClick={() => setOpen((o) => !o)}
            >
                <Show when={!props.done} fallback={<Icon name="sparkle" size={12} />}>
                    <Spinner size={11} />
                </Show>
                <span>{props.done ? "Thoughts" : "Thinking…"}</span>
                <span class="ml-auto opacity-60">
                    <Icon name={open() ? "chevronDown" : "chevronRight"} size={12} />
                </span>
            </button>
            <Show when={open()}>
                <div class="border-t border-line px-2.5 py-2">
                    <Markdown text={props.text} muted />
                </div>
            </Show>
        </div>
    );
};

// A "Generate →" confirm card — the agent hands back a one-line brief; the user clicks to build it into an
// in-chat draft (below). Shows the estimated credit cost so committing is a deliberate, priced choice.
const SURFACE_VERB: Record<string, string> = { deck: "deck", doc: "doc", web: "site" };
const BriefCard: Component<{ brief: GenBrief }> = (props) => {
    const [started, setStarted] = createSignal(false);
    const cost = (): number => estimateCost("generate-artifact", { length: props.brief.length });
    const label = (): string =>
        !started()
            ? `Generate ${SURFACE_VERB[props.brief.surface] ?? "artifact"} →`
            : busy()
              ? "Generating…"
              : "Generated ✓";
    return (
        <div class="mt-1 rounded-xl border border-line bg-canvas p-3">
            <Eyebrow as="div" class="pb-1.5">
                Brief · {formatLabel(props.brief.surface)}
                {props.brief.length ? ` · ${props.brief.length}` : ""}
            </Eyebrow>
            <p class="text-[13px] leading-relaxed text-ink">{props.brief.prompt}</p>
            <div class="mt-2.5 flex items-center gap-2.5">
                <Button
                    variant="primary"
                    size="sm"
                    disabled={started()}
                    onClick={() => {
                        setStarted(true);
                        void generateFromBrief(props.brief);
                    }}
                >
                    {label()}
                </Button>
                <span class="text-[11px] text-muted">~{cost()} credits</span>
            </div>
        </div>
    );
};

// An in-chat generated artifact — the streamed draft. Renders the real sections (same engine as the editor)
// stacked in a scroll box, filling in as generation streams. Lives only in `drafts` until the user clicks
// "Open in editor" (persists → navigates) or "Discard". While live, follow-up chat messages refine it.
const ArtifactDraftCard: Component<{ draftId: string }> = (props) => {
    const navigate = useNavigate();
    const d = (): (typeof drafts)[string] | undefined => drafts[props.draftId];
    let box!: HTMLDivElement;
    const [w, setW] = createSignal(320);
    onMount(() => {
        const ro = new ResizeObserver(() => setW(box.clientWidth));
        ro.observe(box);
        setW(box.clientWidth);
        onCleanup(() => ro.disconnect());
    });
    const open = async (): Promise<void> => {
        const id = await persistDraft(props.draftId);
        if (id) {
            closeChat();
            navigate(`/edit/${id}`);
        }
    };
    return (
        <div ref={box} class="mt-1 overflow-hidden rounded-xl border border-line bg-canvas">
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
                        <div class="max-h-[380px] overflow-y-auto">
                            <For each={draft().content.sections}>
                                {(sec) => (
                                    <div class="border-b border-line/60 last:border-0">
                                        <MiniCanvas
                                            section={sec}
                                            themeId={draft().content.theme}
                                            formatId={draft().content.format}
                                            width={w()}
                                        />
                                    </div>
                                )}
                            </For>
                            <Show
                                when={
                                    draft().status === "building" &&
                                    !draft().content.sections.length
                                }
                            >
                                <div class="flex items-center justify-center gap-2 py-8 text-[11.5px] text-muted">
                                    <Spinner size={12} /> Planning the outline…
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
                                        {draft().state === "opened" ? "Opened ✓" : "Discarded"}
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

const BlockView: Component<{ msgId: number; b: UIBlock }> = (props) => (
    <>
        <Show when={props.b.k === "reasoning" ? props.b : null}>
            {(b) => <ReasoningBlock text={b().text} done={b().done} />}
        </Show>
        <Show when={props.b.k === "brief" ? props.b : null}>
            {(b) => <BriefCard brief={b().brief} />}
        </Show>
        <Show when={props.b.k === "draft" ? props.b : null}>
            {(b) => <ArtifactDraftCard draftId={b().draftId} />}
        </Show>
        <Show when={props.b.k === "text" ? props.b : null}>
            {(b) => <Markdown text={b().text} />}
        </Show>
        <Show when={props.b.k === "tool" && !props.b.done ? props.b : null}>
            {(b) => (
                <div class="mt-1 inline-flex items-center gap-2 rounded-full border border-line bg-canvas px-3 py-1.5 text-[11.5px] text-soft">
                    <Spinner size={12} />
                    {b().title}…
                </div>
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
                <div class="mt-1.5 flex flex-wrap gap-1.5">
                    <For each={(b().block as Suggestions).items}>
                        {(s) => (
                            <Chip variant="outline" onClick={() => void sendChat(s)}>
                                {s}
                            </Chip>
                        )}
                    </For>
                </div>
            )}
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

const MessageView: Component<{ m: ChatMsg }> = (props) => (
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
            <For each={props.m.blocks}>{(b) => <BlockView msgId={props.m.id} b={b} />}</For>
            <Show when={props.m.streaming && props.m.blocks.length === 0}>
                <Spinner size={12} />
            </Show>
        </div>
    </Show>
);

// The empty-state prompt + example chips adapt to where the chat is used: inside the editor (an artifact is
// open → editing help) vs. the library (no artifact → planning / getting-started help). Driven by whether an
// artifact is open, so the messaging never claims to act on a document that isn't there.
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
        ? "Ask about the open artifact, or tell me what to add or change — I'll propose it for you to apply."
        : "No document open — tell me what you'd like to make and I'll build it right here for you to refine, or ask me anything.";
const emptyExamples = (): string[] => (inEditor() ? EDITOR_EXAMPLES : LIBRARY_EXAMPLES);

export const ChatPanel: Component = () => {
    const [input, setInput] = createSignal("");
    let list!: HTMLDivElement;
    let field!: HTMLTextAreaElement;

    // auto-grow the input to fit its content (up to a cap, then it scrolls). Collapse to 0 first so an empty
    // box measures as exactly one line. Re-runs on every input change (incl. the clear after send) AND when
    // the panel opens — the first measure happens while it's off-screen, so it must be re-taken once visible.
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

    // auto-scroll on new content (read block text lengths so streaming growth re-triggers the effect)
    createEffect(() => {
        const tick = thread.messages.reduce(
            (n, m) => n + m.blocks.reduce((k, b) => k + (b.k === "text" ? b.text.length : 1), 0),
            thread.messages.length,
        );
        void tick;
        queueMicrotask(() => list?.scrollTo({ top: list.scrollHeight }));
    });

    const submit = (): void => {
        const t = input().trim();
        if (!t) return;
        setInput("");
        void sendChat(t);
    };

    return (
        <>
            {/* launcher */}
            <Show when={!chatOpen()}>
                <button
                    class="fixed bottom-6 right-6 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-accent text-onaccent shadow-xl transition-transform hover:scale-105"
                    title="Chat with Galleo Agent"
                    onClick={openChat}
                >
                    <AgentIcon size={24} />
                </button>
            </Show>

            {/* dock */}
            <div
                class="fixed right-0 top-0 z-40 flex h-full w-[400px] max-w-[92vw] flex-col border-l border-line bg-panel shadow-2xl transition-transform duration-200"
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
                                <p class="max-w-[240px] text-[13px] leading-relaxed text-muted">
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

                <div class="flex-none border-t border-line p-3">
                    <div class="flex items-center gap-2 rounded-xl border border-line bg-canvas px-2.5 py-2 focus-within:border-accent">
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
        </>
    );
};

export { toggleChat };
