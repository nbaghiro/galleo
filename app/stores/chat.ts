import type {
    ChatContext,
    ChatFocus,
    ChatGeneration,
    ChatLibrary,
    GenBrief,
    GenerateInput,
    OutlinePatch,
    Patch,
    TurnEvent,
    TurnRequest,
    WorkspaceAction,
} from "@model/ai";
import type { ArtifactContent, ElementInstance, Section, Target } from "@model/artifact";
import type { Template } from "@model/templates";
import { applyPatch } from "@model/ai";
import { createSignal } from "solid-js";
import { createStore, produce } from "solid-js/store";
import {
    commit,
    currentArtifactId,
    editor,
    ensureAllSections,
    selection,
} from "@editor/core/store";
import { api, streamTurn } from "@app/api";
import { appTheme, saveCustomTheme } from "./theme";
import { openShare } from "./share";
import { billing, loadBilling } from "./billing";
import {
    artifactTitle,
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
    resolveBriefs,
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

export interface Draft {
    id: string;
    content: ArtifactContent;
    title: string;
    status: "building" | "ready" | "error";
    total: number; // planned section count
    done: number; // sections placed so far
    phase?: string;
    error?: string;
    templateId?: string; // provenance when started from a starter; feeds template popularity
    state: "live" | "opened" | "discarded"; // live = the current refine target; terminal once opened/discarded
}
const [drafts, setDrafts] = createStore<Record<string, Draft>>({});
export { drafts };
const [activeDraftId, setActiveDraftId] = createSignal<string | null>(null);

export function activeDraft(): Draft | null {
    const id = activeDraftId();
    const d = id ? drafts[id] : undefined;
    return d && d.state === "live" ? d : null;
}

// the agent's subject: the editor by default, or the studio's live draft while it's open
export interface ChatTarget {
    content: () => ArtifactContent;
    apply: (patch: Patch) => void;
    focus?: () => ChatFocus | undefined;
    artifactId?: () => string | undefined;
    label?: string; // what the composer calls it ("this draft")
    // its presence switches the agent onto the generate surface, where the outline is the subject
    generation?: () => ChatGeneration | undefined;
    applyBeats?: (ops: OutlinePatch) => void;
    writeBeats?: (beatIds: string[]) => void;
    requestPlan?: (req: { guidance?: string; andWrite?: boolean }) => void;
    setSteer?: (note: string) => void;
    imageSource?: () => "stock" | "ai" | undefined;
}
const [chatTarget, setChatTarget] = createSignal<ChatTarget | null>(null);
export { chatTarget };

// returns an unbind so the owner can release it on cleanup
export function bindChatTarget(t: ChatTarget): () => void {
    setChatTarget(() => t);
    return () => setChatTarget((cur) => (cur === t ? null : cur));
}

export function previewSource(): { theme: string; format: string } {
    const t = chatTarget();
    if (t) return { theme: t.content().theme, format: t.content().format };
    const d = activeDraft();
    if (d) return { theme: d.content.theme, format: d.content.format };
    return { theme: editor.artifact.theme, format: editor.artifact.format };
}
export const openChat = (): void => {
    setChatOpen(true);
    void loadBilling(); // warm the credit balance
};
export const closeChat = (): void => {
    setChatOpen(false);
};
export const toggleChat = (): void => {
    setChatOpen((v) => !v);
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
    return { kind: t.kind, sectionId, path, headline: firstText(sec) || undefined };
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
    // a bound target outranks the editor: it's what's on screen
    const t = chatTarget();
    if (t) {
        const generation = t.generation?.();
        return {
            surface: generation ? "generate" : "editor",
            artifactId: t.artifactId?.(),
            content: t.content(),
            focus: t.focus?.(),
            ...(generation && { generation }),
            ...(t.imageSource?.() === "ai" && { imageSource: "ai" as const }),
            ...attached,
            ...meta(),
        };
    }
    const id = currentArtifactId();
    if (editorActive() && id)
        return {
            surface: "editor",
            artifactId: id,
            content: editor.artifact,
            focus: deriveFocus(),
            ...attached,
            ...meta(),
        };
    const d = activeDraft();
    if (d) return { surface: "editor", content: d.content, ...attached, ...meta() };
    return { surface: "library", library: buildLibrary(), ...attached, ...meta() };
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

function dispatch(ev: TurnEvent, aid: number): void {
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
                const shell = m.blocks.find(
                    (b): b is Extract<UIBlock, { k: "tool" }> =>
                        b.k === "tool" && b.blockId === ev.blockId,
                );
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
            // a capability's own progress line, shown under its shell
            const inner = ev.event;
            if (inner.type !== "narration") break;
            updateMsg(aid, (m) => {
                const shell = m.blocks.find(
                    (b): b is Extract<UIBlock, { k: "tool" }> =>
                        b.k === "tool" && b.blockId === ev.blockId,
                );
                if (shell && !shell.done) shell.detail = inner.text;
            });
            break;
        }
        case "chat.block":
            // action blocks have side effects (library stores) → handled outside the store updater
            if (ev.block.type === "action") {
                handleActionBlock(aid, ev.blockId, ev.block.action);
                break;
            }
            if (ev.block.type === "steer") chatTarget()?.setSteer?.(ev.block.note);
            updateMsg(aid, (m) => {
                const shell = m.blocks.find(
                    (b): b is Extract<UIBlock, { k: "tool" }> =>
                        b.k === "tool" && b.blockId === ev.blockId,
                );
                if (shell) shell.done = true;
                if (ev.block.type === "brief") {
                    m.blocks.push({
                        k: "brief",
                        blockId: ev.blockId,
                        brief: ev.block.brief,
                        state: "pending",
                    });
                    // spoken/typed approval: the build starts once this turn's stream closes
                    if (ev.block.brief.approved)
                        approvedBrief = { msgId: aid, blockId: ev.blockId };
                } else {
                    m.blocks.push({ k: "widget", blockId: ev.blockId, block: ev.block });
                    // spoken/typed approval: applied once this turn's stream closes
                    const t = ev.block.type;
                    if ((t === "outline" || t === "write" || t === "plan") && ev.block.approved)
                        approvedApply = { msgId: aid, blockId: ev.blockId, type: t };
                }
            });
            break;
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
    const request: TurnRequest = {
        kind: "chat",
        input: { message: t, context: buildContext(), history },
    };
    try {
        await streamTurn(request, (ev) => dispatch(ev, aid), abort.signal);
    } catch (e) {
        if (!abort?.signal.aborted) {
            pushText(aid, `\n\n_(${e instanceof Error ? e.message : "The chat failed."})_`);
            reportError(e, "The chat couldn’t finish");
        }
    } finally {
        const aborted = abort?.signal.aborted ?? false;
        setBusy(false);
        updateMsg(aid, (m) => {
            m.streaming = false;
            closeThinking(m); // don't leave the bubble spinning on a tool-only / interrupted turn
            for (const b of m.blocks) if (b.k === "tool") b.done = true;
        });
        abort = null;
        void loadBilling();
        // an in-message approval starts the build now that the chat turn is off the wire
        const auto = approvedBrief;
        approvedBrief = null;
        if (auto && !aborted) startBrief(auto.msgId, auto.blockId);
        // same for an approved generate-surface proposal: apply its card without a click
        const apply = approvedApply;
        approvedApply = null;
        if (apply && !aborted) {
            if (apply.type === "outline") applyOutline(apply.msgId, apply.blockId);
            else if (apply.type === "write") applyWrite(apply.msgId, apply.blockId);
            else applyPlanRequest(apply.msgId, apply.blockId);
        }
    }
}

export function stopChat(): void {
    abort?.abort();
}

export function resetThread(): void {
    abort?.abort();
    setThread("messages", []);
}

function draftDispatch(id: string, ev: TurnEvent): void {
    if (!drafts[id]) return;
    switch (ev.type) {
        case "plan":
            setDrafts(id, "total", ev.beats.length);
            break;
        case "phase":
            setDrafts(id, "phase", ev.name);
            break;
        case "section.status":
            if (ev.status === "done") setDrafts(id, "done", (n) => n + 1);
            break;
        case "patch": {
            const next = applyPatch(drafts[id].content, ev.ops);
            setDrafts(id, "content", next);
            setDrafts(id, "title", artifactTitle(next));
            break;
        }
        case "turn.done":
            setDrafts(id, { status: "ready", title: artifactTitle(drafts[id].content) });
            break;
        case "error":
            setDrafts(id, { status: "error", error: ev.message });
            break;
        default:
            break;
    }
}

let draftSeq = 0;

// set while a turn streams a brief the user already approved in their message
let approvedBrief: { msgId: number; blockId: string } | null = null;

// same, for an approved outline/write/plan card on the generate surface (last-wins)
let approvedApply: { msgId: number; blockId: string; type: "outline" | "write" | "plan" } | null =
    null;

/** Start a brief's build (button click or in-message approval) and resolve every pending card. */
export function startBrief(msgId: number, blockId: string): void {
    const msg = thread.messages.find((m) => m.id === msgId);
    const b = msg?.blocks.find(
        (x): x is Extract<UIBlock, { k: "brief" }> => x.k === "brief" && x.blockId === blockId,
    );
    if (!b || b.state !== "pending" || busy()) return;
    const brief = b.brief;
    for (const m of thread.messages)
        if (m.blocks.some((x) => x.k === "brief" && x.state === "pending"))
            updateMsg(m.id, (mm) => resolveBriefs(mm.blocks, mm.id === msgId ? blockId : null));
    void generateFromBrief(brief);
}

function lastUserText(): string | undefined {
    for (let i = thread.messages.length - 1; i >= 0; i--) {
        const m = thread.messages[i]!;
        if (m.role === "user") {
            const t = m.blocks
                .map((b) => (b.k === "text" ? b.text : ""))
                .join(" ")
                .trim();
            return t || undefined;
        }
    }
    return undefined;
}

export async function generateFromBrief(brief: GenBrief): Promise<void> {
    if (busy()) return;
    const id = `d-${++draftSeq}`;
    const theme = appTheme();
    const input: GenerateInput = {
        prompt: brief.prompt,
        surface: brief.surface,
        theme,
        length: brief.length,
        goal: brief.goal,
        audience: brief.audience,
        tone: brief.tone,
        source: brief.sourceFromMessage ? lastUserText() : undefined,
        sourceArtifactId: brief.sourceArtifactId,
    };
    setDrafts(id, {
        id,
        content: { format: brief.surface, theme, sections: [] },
        title: "Generating…",
        status: "building",
        total: 0,
        done: 0,
        state: "live",
    });
    setActiveDraftId(id);
    const aid = ++mid;
    setThread("messages", (arr) => [
        ...arr,
        { id: aid, role: "assistant", blocks: [{ k: "draft", draftId: id }], streaming: true },
    ]);

    setBusy(true);
    abort = new AbortController();
    try {
        await streamTurn({ kind: "generate", input }, (ev) => draftDispatch(id, ev), abort.signal);
        // a stream that closes without turn.done (an instance swap mid-deploy, a proxy timeout)
        // must fail the card loudly instead of leaving it generating forever
        if (drafts[id]?.status === "building")
            setDrafts(id, {
                status: "error",
                error: "The connection dropped mid-build — try again.",
            });
    } catch (e) {
        if (!abort?.signal.aborted) {
            setDrafts(id, {
                status: "error",
                error: e instanceof Error ? e.message : "Generation failed.",
            });
            reportError(e, "Couldn’t build that artifact");
        }
    } finally {
        setBusy(false);
        updateMsg(aid, (m) => (m.streaming = false));
        abort = null;
        void loadBilling();
    }
}

export async function startDraftFromTemplate(templateId: string): Promise<void> {
    if (busy()) return;
    let all: Template[];
    try {
        all = await templatesOnce();
    } catch {
        return;
    }
    const t = all.find((x) => x.id === templateId);
    if (!t) return;
    const id = `d-${++draftSeq}`;
    setDrafts(id, {
        id,
        content: t.content,
        title: artifactTitle(t.content),
        status: "ready",
        total: t.content.sections.length,
        done: t.content.sections.length,
        templateId,
        state: "live",
    });
    setActiveDraftId(id);
    const aid = ++mid;
    setThread("messages", (arr) => [
        ...arr,
        { id: aid, role: "assistant", blocks: [{ k: "draft", draftId: id }], streaming: false },
    ]);
}

// the one point an in-chat draft becomes a library artifact
export async function persistDraft(id: string): Promise<string | null> {
    const d = drafts[id];
    if (!d) return null;
    const newId = await persistArtifact(
        d.content,
        d.title || artifactTitle(d.content),
        null,
        undefined,
        d.templateId,
    );
    if (newId) {
        setDrafts(id, "state", "opened");
        if (activeDraftId() === id) setActiveDraftId(null);
    }
    return newId;
}

export function discardDraft(id: string): void {
    if (drafts[id]) setDrafts(id, "state", "discarded");
    if (activeDraftId() === id) setActiveDraftId(null);
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

// trash waits for a confirm; share/export route via the component; everything else runs on arrival
const needsConfirm = (a: WorkspaceAction): boolean => a.kind === "trash";
const isRouting = (a: WorkspaceAction): boolean => a.kind === "share" || a.kind === "export";

function handleActionBlock(msgId: number, blockId: string, action: WorkspaceAction): void {
    const confirm = needsConfirm(action);
    updateMsg(msgId, (m) => {
        const shell = m.blocks.find(
            (b): b is Extract<UIBlock, { k: "tool" }> => b.k === "tool" && b.blockId === blockId,
        );
        if (shell) shell.done = true;
        m.blocks.push({ k: "action", blockId, action, state: confirm ? "pending" : "done" });
    });
    if (!confirm && !isRouting(action)) runAction(action);
}

export function confirmAction(msgId: number, blockId: string): void {
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

async function saveProposalToArtifact(id: string, patch: Patch): Promise<void> {
    try {
        const { artifact } = await api.getArtifact(id);
        const next = applyPatch(artifact.draftContent, patch);
        await api.saveArtifact(id, { draftContent: next });
        void loadLibrary();
    } catch {
        /* failed save → thumbnail just doesn't update */
    }
}

function markApplied(msgId: number, blockId: string, state: "applied" | "discarded"): void {
    const type = findWidget(msgId, blockId)?.block.type;
    updateMsg(msgId, (m) => {
        const b = m.blocks.find((x) => x.k === "widget" && x.blockId === blockId);
        if (b && b.k === "widget") b.applied = state;
    });
    // applying an outline/write/plan card (click or auto-approval) retires every earlier
    // still-unapplied card of its kind, so no stale actionable card remains
    if (state !== "applied" || (type !== "outline" && type !== "write" && type !== "plan")) return;
    for (const m of thread.messages) {
        if (m.id > msgId) break;
        updateMsg(m.id, (mm) =>
            discardSuperseded(mm.blocks, type, mm.id === msgId ? blockId : null),
        );
    }
}

// only the bound target holds the beats, so an outline revision has nowhere else to go
export function applyOutline(msgId: number, blockId: string): void {
    const w = findWidget(msgId, blockId);
    if (!w || w.block.type !== "outline" || w.applied) return;
    chatTarget()?.applyBeats?.(w.block.ops);
    markApplied(msgId, blockId, "applied");
}

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
    const patch: Patch = [{ op: "setMeta", theme: saved.id }];
    const t = chatTarget();
    if (t) t.apply(patch);
    else {
        const d = activeDraft();
        if (d) setDrafts(d.id, "content", applyPatch(d.content, patch));
        else commit(applyPatch(editor.artifact, patch));
    }
    markApplied(msgId, blockId, "applied");
}

// writing runs through the studio's own build turns, so the console and the board share one path
export function applyWrite(msgId: number, blockId: string): void {
    const w = findWidget(msgId, blockId);
    if (!w || w.block.type !== "write" || w.applied) return;
    chatTarget()?.writeBeats?.(w.block.beatIds);
    markApplied(msgId, blockId, "applied");
}

// planning runs the studio's own plan turn, for the same reason
export function applyPlanRequest(msgId: number, blockId: string): void {
    const w = findWidget(msgId, blockId);
    if (!w || w.block.type !== "plan" || w.applied) return;
    chatTarget()?.requestPlan?.({ guidance: w.block.guidance, andWrite: w.block.andWrite });
    markApplied(msgId, blockId, "applied");
}

export function applyProposal(msgId: number, blockId: string): void {
    const w = findWidget(msgId, blockId);
    if (!w || w.block.type !== "proposal" || w.applied) return;
    const p = w.block;
    const t = chatTarget();
    if (p.targetArtifactId) {
        void saveProposalToArtifact(p.targetArtifactId, p.patch);
    } else if (t) {
        t.apply(p.patch);
    } else {
        const d = activeDraft();
        if (d) setDrafts(d.id, "content", applyPatch(d.content, p.patch));
        else commit(applyPatch(editor.artifact, p.patch));
    }
    markApplied(msgId, blockId, "applied");
}

export function clearSteer(msgId: number, blockId: string): void {
    chatTarget()?.setSteer?.("");
    markApplied(msgId, blockId, "discarded");
}

export function discardProposal(msgId: number, blockId: string): void {
    markApplied(msgId, blockId, "discarded");
}
