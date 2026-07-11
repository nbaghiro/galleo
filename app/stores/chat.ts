import type {
    ChatBlock,
    ChatContext,
    ChatFocus,
    ChatLibrary,
    GenBrief,
    GenerateInput,
    Patch,
    TurnEvent,
    TurnRequest,
    WorkspaceAction,
} from "@model/ai";
import type { ArtifactContent, ElementInstance, Section } from "@model/artifact";
import type { Target } from "@model/target";
import type { Template } from "@model/workspace";
import { applyPatch } from "@model/ai";
import { createSignal } from "solid-js";
import { createStore, produce } from "solid-js/store";
import { commit, currentArtifactId, editor, selection } from "@editor/editor";
import { api, streamTurn } from "../api";
import { appTheme } from "../theme";
import { openShare } from "../share";
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

// The chat panel's session — an in-memory thread (ephemeral for now) + the streaming dispatch that folds the
// backend's TurnEvents into an ordered list of blocks per assistant message. Context is assembled per message
// from the open artifact + current selection. Proposals apply to the editor via commit (undoable); nothing
// mutates until the user clicks Apply.

// A rendered block in a message — `reasoning` accumulates the streamed thinking tokens (the collapsible
// bubble, closed once the answer starts); `text` accumulates from chat.text deltas; a `tool` is the "working…"
// shell a tool shows while it runs; a `widget` is the finished ChatBlock (proposal / suggestions / preview).
export type UIBlock =
    | { k: "reasoning"; text: string; done: boolean }
    | { k: "text"; text: string }
    | { k: "tool"; blockId: string; tool: string; title: string; done: boolean }
    | { k: "brief"; brief: GenBrief } // a "Generate →" confirm card the agent handed back
    | { k: "draft"; draftId: string } // an in-chat generated artifact (streams into `drafts[draftId]`)
    | {
          k: "action";
          blockId: string;
          action: WorkspaceAction;
          state: "pending" | "done" | "dismissed";
      } // a workspace op (reversible → done on arrival; trash → pending until confirmed)
    | { k: "widget"; blockId: string; block: ChatBlock; applied?: "applied" | "discarded" };

export interface ChatMsg {
    id: number;
    role: "user" | "assistant";
    blocks: UIBlock[];
    streaming: boolean;
}

const [thread, setThread] = createStore<{ messages: ChatMsg[] }>({ messages: [] });
export { thread };

const [busy, setBusy] = createSignal(false);
export { busy };

const [chatOpen, setChatOpen] = createSignal(false);
export { chatOpen };

// Whether the editor route is the ACTIVE view — an artifact genuinely open on screen. EditorView sets this
// on mount / clears it on unmount, so the chat's surface tracks the real route. The editor store's
// `currentArtifactId` lingers after you navigate back to the library, so keying off it alone would make the
// chat think a document is still open and let the agent silently edit the last-opened one. This is the gate.
const [editorActive, setEditorActive] = createSignal(false);
export { editorActive, setEditorActive };

// ---- in-chat drafts ----
// An artifact generated inside the chat, held entirely client-side — it never touches the library until the
// user clicks "Open in editor" (persistDraft). It streams in section-by-section (status "building"), can be
// refined by follow-up messages (the agent's edit tools target it), and ends "opened" or "discarded". One
// active draft at a time is the REFINE target (`activeDraft`); older ones stay in the thread, frozen.
export interface Draft {
    id: string;
    content: ArtifactContent; // accumulates as generate streams; refine proposals patch it
    title: string; // derived from the first section's headline
    status: "building" | "ready" | "error";
    total: number; // planned section count (from the outline) — for the "n / m" readout
    done: number; // sections placed so far
    phase?: string; // the backend's current phase, for the building caption
    error?: string;
    state: "live" | "opened" | "discarded"; // live = the current refine target; terminal once opened/discarded
}
const [drafts, setDrafts] = createStore<Record<string, Draft>>({});
export { drafts };
const [activeDraftId, setActiveDraftId] = createSignal<string | null>(null);

// The draft the refine loop currently targets — the live one, if any. Once a draft is opened or discarded it
// stops being the active context (so a later message falls back to the library / open artifact).
export function activeDraft(): Draft | null {
    const id = activeDraftId();
    const d = id ? drafts[id] : undefined;
    return d && d.state === "live" ? d : null;
}

// The theme + format that section previews (proposals, carousels) should render in: the live draft's when
// one is active, else the open editor artifact's.
export function previewSource(): { theme: string; format: string } {
    const d = activeDraft();
    if (d) return { theme: d.content.theme, format: d.content.format };
    return { theme: editor.artifact.theme, format: editor.artifact.format };
}
export const openChat = (): void => {
    setChatOpen(true);
    void loadBilling(); // warm the credit balance so the agent can answer "how many credits do I have"
};
export const closeChat = (): void => {
    setChatOpen(false);
};
export const toggleChat = (): void => {
    setChatOpen((v) => !v);
};

let mid = 0;
let abort: AbortController | null = null;

// ---- context ----

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

// The workspace summary sent when no artifact is open — a few most-recent titles + a count, so the agent can
// ground itself in the user's real work instead of only knowing "nothing is open".
function buildLibrary(): ChatLibrary {
    const recent = [...artifacts()]
        .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""))
        .slice(0, 6)
        .map((a) => ({ title: a.title, format: formatLabel(a.formatId) }));
    return {
        view: "library",
        artifactCount: artifacts().length,
        recent,
        folders: folders().map((f) => ({ id: f.id, name: f.name })), // so the agent can resolve a move target
    };
}

// The plan + credit balance, from the billing store, so the agent can answer "how many credits do I have"
// and hint at gated capabilities. Undefined until billing loads (openChat kicks it off).
function meta(): Pick<ChatContext, "plan" | "credits"> {
    const b = billing();
    if (!b) return {};
    return {
        plan: b.plan,
        credits: {
            remaining: Math.max(0, b.credits.limit - b.credits.used),
            limit: b.credits.limit,
        },
    };
}

function buildContext(): ChatContext {
    const id = currentArtifactId();
    if (editorActive() && id)
        return {
            surface: "editor",
            artifactId: id,
            content: editor.artifact,
            focus: deriveFocus(),
            ...meta(),
        };
    // A live in-chat draft is an editable (but unsaved) artifact — refine it through the same editor
    // toolset; proposals patch the draft (applyProposal), not the library, until the user opens it.
    const d = activeDraft();
    if (d) return { surface: "editor", content: d.content, ...meta() };
    return { surface: "library", library: buildLibrary(), ...meta() };
}

// ---- streaming ----

function updateMsg(id: number, fn: (m: ChatMsg) => void): void {
    setThread(
        "messages",
        produce((msgs) => {
            const m = msgs.find((x) => x.id === id);
            if (m) fn(m);
        }),
    );
}

// Close (collapse) any still-open thinking bubble — the answer (or an error) has started.
function closeReasoning(m: ChatMsg): void {
    for (const b of m.blocks) if (b.k === "reasoning" && !b.done) b.done = true;
}

function pushReasoning(id: number, delta: string): void {
    updateMsg(id, (m) => {
        const last = m.blocks[m.blocks.length - 1];
        if (last && last.k === "reasoning" && !last.done) last.text += delta;
        else m.blocks.push({ k: "reasoning", text: delta, done: false });
    });
}

function pushText(id: number, delta: string): void {
    updateMsg(id, (m) => {
        closeReasoning(m); // prose has begun → the thinking bubble auto-collapses
        const last = m.blocks[m.blocks.length - 1];
        if (last && last.k === "text") last.text += delta;
        else m.blocks.push({ k: "text", text: delta });
    });
}

function dispatch(ev: TurnEvent, aid: number): void {
    switch (ev.type) {
        case "chat.reasoning":
            pushReasoning(aid, ev.delta);
            break;
        case "chat.text":
            pushText(aid, ev.delta);
            break;
        case "chat.tool":
            updateMsg(aid, (m) =>
                m.blocks.push({
                    k: "tool",
                    blockId: ev.blockId,
                    tool: ev.tool,
                    title: ev.title,
                    done: false,
                }),
            );
            break;
        case "chat.block":
            // A workspace action has side effects (it runs against the library stores), so it's handled
            // outside the store updater — reversible ops execute on arrival, trash waits for a confirm.
            if (ev.block.type === "action") {
                handleActionBlock(aid, ev.blockId, ev.block.action);
                break;
            }
            updateMsg(aid, (m) => {
                const shell = m.blocks.find(
                    (b): b is Extract<UIBlock, { k: "tool" }> =>
                        b.k === "tool" && b.blockId === ev.blockId,
                );
                if (shell) shell.done = true;
                // The brief is a confirm card (its own UIBlock, with a Generate button), not an apply/discard
                // widget — everything else renders through the generic widget path.
                if (ev.block.type === "brief") m.blocks.push({ k: "brief", brief: ev.block.brief });
                else m.blocks.push({ k: "widget", blockId: ev.blockId, block: ev.block });
            });
            break;
        case "error":
            pushText(aid, `\n\n_(${ev.message})_`);
            break;
        default:
            break; // turn.start / turn.done / chat.nested / phase — nothing to render (yet)
    }
}

export async function sendChat(text: string): Promise<void> {
    const t = text.trim();
    if (!t || busy()) return;
    // history: prior turns compacted to their text (before we append this exchange)
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
    abort = new AbortController();
    const request: TurnRequest = {
        kind: "chat",
        input: { message: t, context: buildContext(), history },
    };
    try {
        await streamTurn(request, (ev) => dispatch(ev, aid), abort.signal);
    } catch (e) {
        if (!abort?.signal.aborted)
            pushText(aid, `\n\n_(${e instanceof Error ? e.message : "The chat failed."})_`);
    } finally {
        setBusy(false);
        updateMsg(aid, (m) => {
            m.streaming = false;
            closeReasoning(m); // a tool-only / interrupted turn → don't leave the bubble spinning
        });
        abort = null;
        void loadBilling();
    }
}

export function stopChat(): void {
    abort?.abort();
}

export function resetThread(): void {
    abort?.abort();
    setThread("messages", []);
}

// ---- generate a full artifact in-chat (from a confirmed brief) ----

// Fold one generate TurnEvent into a draft — the same accumulation the generate modal does (applyPatch the
// streamed addSection ops), but into `drafts[id]` so the draft card fills section-by-section.
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

// The most recent user message's text — the source material when the agent flags a build "from what they
// pasted" (sourceFromMessage), so a long paste never has to round-trip through the model.
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

// Run a real `generate` turn from a confirmed brief, streaming it into a fresh in-chat draft (a new assistant
// message hosting the draft card). The generation is a normal top-level turn — metered server-side exactly
// like the modal — and the result lives only in `drafts` until the user opens it. Becomes the active refine
// target so follow-up messages edit it.
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
        // Source-grounded generation: the client resolves the source here (rather than round-tripping long
        // text through the model) — the user's pasted message, and/or an existing artifact to repurpose.
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
    } catch (e) {
        if (!abort?.signal.aborted)
            setDrafts(id, {
                status: "error",
                error: e instanceof Error ? e.message : "Generation failed.",
            });
    } finally {
        setBusy(false);
        updateMsg(aid, (m) => (m.streaming = false));
        abort = null;
        void loadBilling();
    }
}

// Start an in-chat draft from a starter template — instant (no generation), the template's content dropped
// straight into a live draft the user can refine and open. Same draft machinery as a generated one, so
// refine + Open in editor work identically. Templates are fetched once and cached.
let templateCache: Template[] | null = null;
export async function startDraftFromTemplate(templateId: string): Promise<void> {
    if (busy()) return;
    if (!templateCache) {
        try {
            templateCache = (await api.listTemplates()).templates;
        } catch {
            return;
        }
    }
    const t = templateCache.find((x) => x.id === templateId);
    if (!t) return;
    const id = `d-${++draftSeq}`;
    setDrafts(id, {
        id,
        content: t.content,
        title: artifactTitle(t.content),
        status: "ready",
        total: t.content.sections.length,
        done: t.content.sections.length,
        state: "live",
    });
    setActiveDraftId(id);
    const aid = ++mid;
    setThread("messages", (arr) => [
        ...arr,
        { id: aid, role: "assistant", blocks: [{ k: "draft", draftId: id }], streaming: false },
    ]);
}

// "Open in editor" — the ONE point an in-chat draft becomes a real library artifact. Persists it, marks the
// draft opened (so it stops being the refine target), and returns the new id for the caller to navigate to.
export async function persistDraft(id: string): Promise<string | null> {
    const d = drafts[id];
    if (!d) return null;
    const newId = await persistArtifact(d.content, d.title || artifactTitle(d.content));
    if (newId) {
        setDrafts(id, "state", "opened");
        if (activeDraftId() === id) setActiveDraftId(null);
    }
    return newId;
}

// Drop a draft without saving — it stays in the thread as a "Discarded" card, and stops being editable.
export function discardDraft(id: string): void {
    if (drafts[id]) setDrafts(id, "state", "discarded");
    if (activeDraftId() === id) setActiveDraftId(null);
}

// ---- workspace actions: run against the (optimistic) library stores ----

// Execute one workspace action through the existing library/folder store functions — the same optimistic
// paths the sidebar + card menus use, so the UI updates instantly and the server catches up.
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

// A human label for an action card, resolved from the client's own stores (which hold the titles/folders).
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

// Outward-facing routing — open the Share panel (publishing is opt-in there). Export navigation lives in the
// component (it needs the router); this covers share, which only opens a modal.
export function shareArtifactAction(id: string): void {
    const art = artifacts().find((x) => x.id === id);
    openShare({ artifactId: id, title: art?.title ?? "Untitled" });
}

// Policy (client-side, so the tools stay tiny): trash waits for an explicit confirm; share/export are
// outward-facing → a one-click routing card handled by the component (never auto-run); everything else is
// reversible and runs on arrival.
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

// The confirm card's buttons (destructive actions only).
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

// ---- proposals: apply to the editor (undoable) or discard ----

function findWidget(msgId: number, blockId: string): Extract<UIBlock, { k: "widget" }> | undefined {
    const m = thread.messages.find((x) => x.id === msgId);
    const b = m?.blocks.find((x) => x.k === "widget" && x.blockId === blockId);
    return b && b.k === "widget" ? b : undefined;
}

// Apply a proposal's patch to a NAMED library artifact (one that isn't open): fetch its current content,
// patch it, save it back, and refresh the library so its thumbnail updates. The single write-to-a-library-
// artifact path — the "edit my Aria deck from here" case, saved without ever opening it.
async function saveProposalToArtifact(id: string, patch: Patch): Promise<void> {
    try {
        const { artifact } = await api.getArtifact(id);
        const next = applyPatch(artifact.draftContent, patch);
        await api.saveArtifact(id, { draftContent: next });
        void loadLibrary();
    } catch {
        /* a rare failed save shows as the thumbnail simply not updating; the thread keeps the proposal */
    }
}

export function applyProposal(msgId: number, blockId: string): void {
    const w = findWidget(msgId, blockId);
    if (!w || w.block.type !== "proposal" || w.applied) return;
    const p = w.block;
    // Three targets, one widget: a NAMED artifact (save via API) · a live draft (patch it) · else the open
    // editor artifact (undoable commit). Each re-renders its own surface — thumbnail, draft card, or canvas.
    if (p.targetArtifactId) {
        void saveProposalToArtifact(p.targetArtifactId, p.patch);
    } else {
        const d = activeDraft();
        if (d) setDrafts(d.id, "content", applyPatch(d.content, p.patch));
        else commit(applyPatch(editor.artifact, p.patch));
    }
    updateMsg(msgId, (m) => {
        const b = m.blocks.find((x) => x.k === "widget" && x.blockId === blockId);
        if (b && b.k === "widget") b.applied = "applied";
    });
}

export function discardProposal(msgId: number, blockId: string): void {
    updateMsg(msgId, (m) => {
        const b = m.blocks.find((x) => x.k === "widget" && x.blockId === blockId);
        if (b && b.k === "widget") b.applied = "discarded";
    });
}
