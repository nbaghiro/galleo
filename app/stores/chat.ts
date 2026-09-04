import type {
    ChatContext,
    ChatFocus,
    ChatLibrary,
    ChatThread,
    Patch,
    ProposalMark,
    TurnEvent,
    WorkspaceAction,
} from "@model/ai";
import type { ArtifactContent, ElementInstance, Section, Target } from "@model/artifact";
import type { ToolId } from "@model/tools";
import { applyContentOps, threadKey } from "@model/ai";
import { addressesEqual } from "@model/artifact";
import { createSignal } from "solid-js";
import { createStore, produce } from "solid-js/store";
import {
    commit,
    currentArtifactId,
    editor,
    ensureAllSections,
    multiSelected,
    selectedAddresses,
    selection,
} from "@editor/core/store";
import { api, streamTool } from "@app/api";
import { charsBucket } from "@model/analytics";
import { capture } from "@ui/analytics";
import { saveCustomTheme } from "./theme";
import { openShare } from "./share";
import { billing, loadBilling } from "./billing";
import {
    artifacts,
    duplicateArtifact,
    formatLabel,
    loadLibrary,
    moveArtifact,
    persistArtifact,
    removeArtifact,
    renameArtifactById,
    restoreFromTrash,
} from "./library";
import { addFolder, folders } from "./folders";
import { templatesOnce } from "./templates";
import { reportError } from "./errors";
import { noteStep } from "./model-usage";
import {
    discardSuperseded,
    pendingProposals,
    textInsertAt,
    type ChatMsg,
    type UIBlock,
} from "./chat-blocks";

const [thread, setThread] = createStore<{ messages: ChatMsg[] }>({ messages: [] });
export { thread };

const [busy, setBusy] = createSignal(false);
export { busy };

const [chatOpen, setChatOpen] = createSignal(false);
export { chatOpen };

// currentArtifactId lingers after leaving the editor; gating on the route stops silent edits
const [editorActive, setEditorActive] = createSignal(false);
export { editorActive, setEditorActive };

// the agent's subject: the editor by default, or the generation while one is bound
export interface ChatTarget {
    content: () => ArtifactContent;
    apply: (patch: Patch) => void | Promise<void>;
    focus?: () => ChatFocus | undefined;
    artifactId?: () => string | undefined;
    label?: string; // what the composer calls it ("this draft")
    // its presence puts the agent on the generate surface, where the plan is the subject
    generationId?: () => string | undefined;
    // runs a proposed call, or apply-patch, through the target's own mirror
    run?: (tool: ToolId, input: Record<string, unknown>, cost?: number) => Promise<unknown>;
    // a patch the server already applied for a never-confirm tool, so the mirror follows it
    mirror?: (patch: Patch) => void;
    imageSource?: () => "stock" | "ai" | undefined;
}
const [chatTarget, setChatTarget] = createSignal<ChatTarget | null>(null);
export { chatTarget };

// returns an unbind so the owner can release it on cleanup
export function bindChatTarget(t: ChatTarget): () => void {
    setChatTarget(() => t);
    return () => setChatTarget((cur) => (cur === t ? null : cur));
}

// How a generation is started or adopted from the dock. The studio store installs this at load,
// since importing it here would be a cycle.
export interface GenerationHost {
    start: (input: {
        prompt: string;
        surface: "deck" | "doc" | "web";
        theme: string;
        length?: string;
        imageSource?: "stock" | "ai";
        source?: string;
        sourceArtifactId?: string;
        shapeTemplateId?: string;
        contextIds?: string[];
        artifactId?: string;
    }) => Promise<void>;
    adopt: (id: string) => Promise<void>;
    active: () => string | undefined;
    open: () => void;
}
let host: GenerationHost | null = null;
export const setGenerationHost = (h: GenerationHost): void => {
    host = h;
};
export const generationHost = (): GenerationHost | null => host;

export function previewSource(): { theme: string; format: string } {
    const t = chatTarget();
    if (t) return { theme: t.content().theme, format: t.content().format };
    return { theme: editor.artifact.theme, format: editor.artifact.format };
}
export const openChat = (from = "editor"): void => {
    capture("chat_opened", { from });
    setChatOpen(true);
    void loadBilling(); // warm the credit balance
    void loadThread();
};
export const closeChat = (): void => {
    setChatOpen(false);
};
export const toggleChat = (): void => {
    if (chatOpen()) closeChat();
    else openChat("command");
};

let mid = 0;
let abort: AbortController | null = null;

function firstText(section: Section | undefined): string {
    if (!section) return "";
    const visit = (el: ElementInstance | undefined): string => {
        if (!el) return "";
        const d = el.data as { text?: string; children?: ElementInstance[] };
        if (typeof d.text === "string" && d.text.trim()) return d.text.trim();
        for (const k of d.children ?? []) {
            const t = visit(k);
            if (t) return t;
        }
        return "";
    };
    return visit(section.root);
}

function deriveFocus(): ChatFocus | undefined {
    const t: Target | null = selection();
    if (!t) return undefined;
    const sectionId = t.kind === "element" ? t.address.section : t.section;
    const path = t.kind === "element" ? t.address.path : undefined;
    const sec = editor.artifact.sections.find((s) => s.id === sectionId);
    // the anchor first, so a turn that only reads the singular fields is unaffected
    const elements =
        multiSelected() && t.kind === "element"
            ? [t.address, ...selectedAddresses().filter((a) => !addressesEqual(a, t.address))].map(
                  (a) => ({ sectionId: a.section, path: a.path }),
              )
            : undefined;
    return { kind: t.kind, sectionId, path, headline: firstText(sec) || undefined, elements };
}

function buildLibrary(): ChatLibrary {
    const recent = [...artifacts()]
        .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""))
        .slice(0, 6)
        .map((a) => ({ title: a.title, format: formatLabel(a.formatId) }));
    return {
        view: "library",
        artifactCount: artifacts().length,
        recent,
        folders: folders().map((f) => ({ id: f.id, name: f.name })),
    };
}

function meta(): Pick<ChatContext, "plan" | "credits"> {
    const b = billing();
    if (!b) return {};
    return {
        plan: b.plan,
        credits: {
            remaining: b.credits.balance,
            limit: b.credits.monthlyGrant,
        },
    };
}

// contexts attached to the conversation; every turn retrieves against them
const [chatContextIds, setChatContextIds] = createSignal<string[]>([]);
export { chatContextIds, setChatContextIds };

function buildContext(): ChatContext {
    const attached = chatContextIds().length ? { contextIds: chatContextIds() } : {};
    const pending = pendingProposals(thread.messages);
    const shared = { ...attached, ...(pending.length ? { pending } : {}), ...meta() };
    // a bound target outranks the editor: it's what's on screen
    const t = chatTarget();
    if (t) {
        const generationId = t.generationId?.();
        return {
            surface: generationId ? "generate" : "editor",
            artifactId: t.artifactId?.(),
            // a generation's draft is loaded server-side; the editor's document rides along
            ...(generationId ? { generationId } : { content: t.content() }),
            focus: t.focus?.(),
            ...(t.imageSource?.() === "ai" && { imageSource: "ai" as const }),
            ...shared,
        };
    }
    const id = currentArtifactId();
    if (editorActive() && id)
        return {
            surface: "editor",
            artifactId: id,
            content: editor.artifact,
            focus: deriveFocus(),
            ...shared,
        };
    return { surface: "library", library: buildLibrary(), ...shared };
}

function updateMsg(id: number, fn: (m: ChatMsg) => void): void {
    setThread(
        "messages",
        produce((msgs) => {
            const m = msgs.find((x) => x.id === id);
            if (m) fn(m);
        }),
    );
}

function closeThinking(m: ChatMsg): void {
    for (const b of m.blocks) if (b.k === "thinking" && !b.done) b.done = true;
}

// a new thinking block opens per reasoning run, so think → tool → think reads as two passes
function pushThinking(id: number, label?: string): void {
    updateMsg(id, (m) => {
        const last = m.blocks[m.blocks.length - 1];
        const open = last && last.k === "thinking" && !last.done ? last : null;
        if (!open) m.blocks.push({ k: "thinking", steps: label ? [label] : [], done: false });
        else if (label && open.steps[open.steps.length - 1] !== label) open.steps.push(label);
    });
}

function pushText(id: number, delta: string): void {
    updateMsg(id, (m) => {
        closeThinking(m);
        const at = textInsertAt(m.blocks);
        const prev = m.blocks[at - 1];
        if (prev && prev.k === "text") prev.text += delta;
        else m.blocks.splice(at, 0, { k: "text", text: delta });
    });
}

const shellOf = (m: ChatMsg, blockId: string): Extract<UIBlock, { k: "tool" }> | undefined =>
    m.blocks.find(
        (b): b is Extract<UIBlock, { k: "tool" }> => b.k === "tool" && b.blockId === blockId,
    );

// a card the agent applied on a spoken approval is retired everywhere it appears
function retireProposal(proposalId: string): void {
    setMark(proposalId, "applied");
    void api.markProposal(currentKey(), proposalId, "applied").catch(() => undefined);
}

// `replay` = the turn already happened: actions ran and generations were adopted at the time
function dispatch(ev: TurnEvent, aid: number, replay = false): void {
    switch (ev.type) {
        case "chat.thinking":
            pushThinking(aid, ev.label);
            break;
        case "chat.text":
            pushText(aid, ev.delta);
            break;
        case "chat.tool":
            // sent twice (open the shell, then done), so a tool with nothing to show still closes
            updateMsg(aid, (m) => {
                const shell = shellOf(m, ev.blockId);
                if (shell) shell.done = shell.done || !!ev.done;
                else
                    m.blocks.push({
                        k: "tool",
                        blockId: ev.blockId,
                        tool: ev.tool,
                        title: ev.title,
                        done: !!ev.done,
                    });
            });
            break;
        case "chat.nested": {
            const inner = ev.event;
            // a change the server already applied for this call: the mirror follows it
            if (inner.type === "patch") {
                chatTarget()?.mirror?.(inner.patch);
                break;
            }
            // a capability's own progress line, shown under its shell
            if (inner.type !== "narration") break;
            updateMsg(aid, (m) => {
                const shell = shellOf(m, ev.blockId);
                if (shell && !shell.done) shell.detail = inner.text;
            });
            break;
        }
        case "chat.block": {
            const block = ev.block;
            // action blocks have side effects (library stores) → handled outside the store updater
            if (block.type === "action") {
                handleActionBlock(aid, ev.blockId, block.action, block.confirm, replay);
                break;
            }
            if (block.type === "applied") {
                retireProposal(block.proposal);
                break;
            }
            if (block.type === "generation" && !replay) void host?.adopt(block.generationId);
            updateMsg(aid, (m) => {
                const shell = shellOf(m, ev.blockId);
                if (shell) shell.done = true;
                m.blocks.push({ k: "widget", blockId: ev.blockId, block });
            });
            break;
        }
        case "error":
            pushText(aid, `\n\n_(${ev.message})_`);
            break;
        default:
            break;
    }
}

export async function sendChat(text: string): Promise<void> {
    const t = text.trim();
    if (!t || busy()) return;
    await loadThread();
    // The message never travels, only how long it was and how deep into the thread we are: a first
    // question and a tenth follow-up are different acts.
    capture("chat_message_sent", {
        chars_bucket: charsBucket(t.length),
        thread_length: thread.messages.length,
    });
    // the agent reasons over (and patches) the whole document, so a windowed artifact fills in first
    await ensureAllSections();
    // prior turns → text, computed before this exchange is appended
    const history = thread.messages
        .slice(-8)
        .map((m) => ({
            role: m.role,
            text: m.blocks
                .map((b) => (b.k === "text" ? b.text : ""))
                .join(" ")
                .trim(),
        }))
        .filter((h) => h.text);

    setThread("messages", (arr) => [
        ...arr,
        { id: ++mid, role: "user", blocks: [{ k: "text", text: t }], streaming: false },
    ]);
    const aid = ++mid;
    setThread("messages", (arr) => [
        ...arr,
        { id: aid, role: "assistant", blocks: [], streaming: true },
    ]);

    setBusy(true);
    noteStep("chat"); // lands on the studio's run when one is open, ignored otherwise
    abort = new AbortController();
    try {
        await streamTool(
            "ask-assistant",
            { message: t, context: buildContext(), history },
            (ev) => dispatch(ev, aid),
            { signal: abort.signal },
        );
    } catch (e) {
        if (!abort?.signal.aborted) {
            pushText(aid, `\n\n_(${e instanceof Error ? e.message : "The chat failed."})_`);
            reportError(e, "The chat couldn’t finish");
        }
    } finally {
        setBusy(false);
        updateMsg(aid, (m) => {
            m.streaming = false;
            closeThinking(m); // don't leave the bubble spinning on a tool-only / interrupted turn
            for (const b of m.blocks) if (b.k === "tool") b.done = true;
        });
        abort = null;
        void loadBilling();
    }
}

export function stopChat(): void {
    abort?.abort();
}

// the subject the thread belongs to: a generation, an open artifact, or the library
export function currentKey(): string {
    const t = chatTarget();
    if (t) return threadKey({ generationId: t.generationId?.(), artifactId: t.artifactId?.() });
    const id = currentArtifactId();
    return threadKey({ artifactId: editorActive() && id ? id : undefined });
}

let loadedKey: string | null = null;
let loading: Promise<void> | null = null;

// the server's copy of the thread for the current subject, replayed through the same reducer that
// painted it live, then marked the way the person left it
export function loadThread(): Promise<void> {
    const key = currentKey();
    if (loadedKey === key && !loading) return Promise.resolve();
    if (loading && loadedKey === key) return loading;
    loadedKey = key;
    loading = (async () => {
        let stored: ChatThread | null = null;
        try {
            stored = await api.chatThread(key);
        } catch {
            stored = null; // an unreachable server leaves the thread empty rather than stale
        }
        if (currentKey() !== key) return; // the subject moved on while this was in flight
        replay(stored);
    })().finally(() => {
        loading = null;
    });
    return loading;
}

function replay(stored: ChatThread | null): void {
    setThread("messages", []);
    if (!stored) return;
    for (const m of stored.messages) {
        const id = ++mid;
        if (m.role === "user") {
            setThread("messages", (arr) => [
                ...arr,
                { id, role: "user", blocks: [{ k: "text", text: m.text }], streaming: false },
            ]);
            continue;
        }
        setThread("messages", (arr) => [
            ...arr,
            { id, role: "assistant", blocks: [], streaming: false },
        ]);
        for (const ev of m.events) dispatch(ev, id, true);
        updateMsg(id, (msg) => {
            closeThinking(msg);
            for (const b of msg.blocks) if (b.k === "tool") b.done = true;
        });
    }
    for (const [proposal, mark] of Object.entries(stored.marks)) setMark(proposal, mark);
}

function setMark(proposalId: string, mark: ProposalMark): void {
    for (const m of thread.messages)
        updateMsg(m.id, (mm) => {
            for (const b of mm.blocks)
                if (b.k === "widget" && b.block.type === "proposal" && b.block.id === proposalId)
                    b.applied = mark;
        });
}

export function resetThread(): void {
    abort?.abort();
    setThread("messages", []);
    const key = currentKey();
    loadedKey = key;
    void api.clearThread(key).catch(() => undefined);
}

// a template picked in the chat opens as a piece of the person's own, in the editor
export async function startFromTemplate(templateId: string): Promise<string | null> {
    if (busy()) return null;
    const all = await templatesOnce().catch(() => null);
    const t = all?.find((x) => x.id === templateId);
    if (!t) return null;
    return persistArtifact(t.content, t.name, null, undefined, templateId);
}

function runAction(a: WorkspaceAction): void {
    switch (a.kind) {
        case "rename":
            renameArtifactById(a.id, a.title);
            break;
        case "move":
            moveArtifact(a.id, a.folderId);
            break;
        case "duplicate": {
            const art = artifacts().find((x) => x.id === a.id);
            if (art) void duplicateArtifact(art);
            break;
        }
        case "trash":
            removeArtifact(a.id);
            break;
        case "restore":
            restoreFromTrash(a.id);
            break;
        case "create-folder":
            void addFolder(a.name);
            break;
    }
}

export function actionLabel(a: WorkspaceAction): string {
    const titleOf = (id: string): string =>
        artifacts().find((x) => x.id === id)?.title ?? "this artifact";
    switch (a.kind) {
        case "rename":
            return `Rename “${titleOf(a.id)}” to “${a.title}”`;
        case "move": {
            const name = a.folderId ? folders().find((f) => f.id === a.folderId)?.name : null;
            return name
                ? `Move “${titleOf(a.id)}” to ${name}`
                : `Remove “${titleOf(a.id)}” from its folder`;
        }
        case "duplicate":
            return `Duplicate “${titleOf(a.id)}”`;
        case "trash":
            return `Move “${titleOf(a.id)}” to Trash`;
        case "restore":
            return `Restore “${titleOf(a.id)}”`;
        case "create-folder":
            return `Create folder “${a.name}”`;
        case "share":
            return `Share “${titleOf(a.id)}”`;
        case "export":
            return `Export “${titleOf(a.id)}”`;
    }
}

// export navigation lives in the component (needs the router); this only opens the share modal
export function shareArtifactAction(id: string): void {
    const art = artifacts().find((x) => x.id === id);
    openShare({ artifactId: id, title: art?.title ?? "Untitled" });
}

// share/export route via the component; a confirmed action waits for a click; the rest run on arrival
const isRouting = (a: WorkspaceAction): boolean => a.kind === "share" || a.kind === "export";

function handleActionBlock(
    msgId: number,
    blockId: string,
    action: WorkspaceAction,
    confirm: boolean,
    replay = false,
): void {
    updateMsg(msgId, (m) => {
        const shell = shellOf(m, blockId);
        if (shell) shell.done = true;
        m.blocks.push({ k: "action", blockId, action, state: confirm ? "pending" : "done" });
    });
    if (!confirm && !isRouting(action) && !replay) runAction(action);
}

export function confirmAction(msgId: number, blockId: string): void {
    capture("chat_proposal_applied", { kind: "action" });
    let toRun: WorkspaceAction | null = null;
    updateMsg(msgId, (m) => {
        const b = m.blocks.find((x) => x.k === "action" && x.blockId === blockId);
        if (b && b.k === "action" && b.state === "pending") {
            b.state = "done";
            toRun = b.action;
        }
    });
    if (toRun) runAction(toRun);
}
export function dismissAction(msgId: number, blockId: string): void {
    capture("chat_proposal_dismissed", { kind: "action" });
    updateMsg(msgId, (m) => {
        const b = m.blocks.find((x) => x.k === "action" && x.blockId === blockId);
        if (b && b.k === "action" && b.state === "pending") b.state = "dismissed";
    });
}

function findWidget(msgId: number, blockId: string): Extract<UIBlock, { k: "widget" }> | undefined {
    const m = thread.messages.find((x) => x.id === msgId);
    const b = m?.blocks.find((x) => x.k === "widget" && x.blockId === blockId);
    return b && b.k === "widget" ? b : undefined;
}

async function saveProposalToArtifact(id: string, ops: Patch["artifact"]): Promise<void> {
    if (!ops?.length) return;
    try {
        const { artifact } = await api.getArtifact(id);
        const next = applyContentOps(artifact.draftContent, ops);
        await api.saveArtifact(id, { draftContent: next });
        void loadLibrary();
    } catch {
        /* failed save → thumbnail just doesn't update */
    }
}

function markApplied(msgId: number, blockId: string, state: ProposalMark): void {
    const w = findWidget(msgId, blockId);
    updateMsg(msgId, (m) => {
        const b = m.blocks.find((x) => x.k === "widget" && x.blockId === blockId);
        if (b && b.k === "widget") b.applied = state;
    });
    if (w?.block.type === "proposal")
        void api.markProposal(currentKey(), w.block.id, state).catch(() => undefined);
    // applying a card that changes the plan or writes it retires every earlier still-unapplied
    // card of the same tool, so no stale actionable card remains
    if (state !== "applied" || !w || w.block.type !== "proposal") return;
    const tool = w.block.tool;
    if (!SUPERSEDING.has(tool)) return;
    for (const m of thread.messages) {
        if (m.id > msgId) break;
        updateMsg(m.id, (mm) =>
            discardSuperseded(mm.blocks, tool, mm.id === msgId ? blockId : null),
        );
    }
}

const SUPERSEDING = new Set<string>([
    "start-generation",
    "plan-outline",
    "write-beats",
    "revise-outline",
]);

// a designed theme must exist in the workspace before an artifact can point at it: save, then patch
export async function applyTheme(msgId: number, blockId: string): Promise<void> {
    const w = findWidget(msgId, blockId);
    if (!w || w.block.type !== "theme" || w.applied) return;
    const b = w.block;
    const saved = await saveCustomTheme({
        name: b.name,
        tokens: b.tokens,
        tag: b.mood,
        dark: b.isDark,
    });
    if (!saved) return; // leave it applyable rather than marking it done
    const patch: Patch = { artifact: [{ op: "setMeta", theme: saved.id }] };
    const t = chatTarget();
    if (t) await t.apply(patch);
    else if (editorActive()) commit(applyContentOps(editor.artifact, patch.artifact!));
    capture("chat_proposal_applied", { kind: "theme" });
    markApplied(msgId, blockId, "applied");
}

// A proposal is either a call the person starts or a change they land. A call with no target bound
// is a start-generation from the dock, which the studio store opens; everything else runs through
// the bound target's mirror, a named library artifact, or the open editor.
export async function applyProposal(msgId: number, blockId: string): Promise<void> {
    const w = findWidget(msgId, blockId);
    if (!w || w.block.type !== "proposal" || w.applied) return;
    const p = w.block;
    capture("chat_proposal_applied", { kind: p.tool });
    markApplied(msgId, blockId, "applied");
    const t = chatTarget();
    try {
        if (p.call) {
            const input = (p.call.input ?? {}) as Record<string, unknown>;
            if (t?.run) await t.run(p.tool as ToolId, input, p.cost);
            else if (p.tool === "start-generation" && host)
                await host.start(input as Parameters<GenerationHost["start"]>[0]);
            else {
                await streamTool(p.tool as ToolId, input, () => undefined);
                void loadLibrary();
            }
        } else if (p.patch) {
            if (p.targetArtifactId)
                await saveProposalToArtifact(p.targetArtifactId, p.patch.artifact);
            else if (t) await t.apply(p.patch);
            else if (editorActive() && p.patch.artifact?.length)
                commit(applyContentOps(editor.artifact, p.patch.artifact));
        }
    } catch (e) {
        reportError(e, "Couldn’t apply that");
        updateMsg(msgId, (m) => {
            const b = m.blocks.find((x) => x.k === "widget" && x.blockId === blockId);
            if (b && b.k === "widget") b.applied = undefined;
        });
    }
}

export function discardProposal(msgId: number, blockId: string): void {
    capture("chat_proposal_dismissed", { kind: findWidget(msgId, blockId)?.block.type ?? "card" });
    markApplied(msgId, blockId, "discarded");
}
