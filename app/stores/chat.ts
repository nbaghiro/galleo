import type {
    ChatBlock,
    ChatContext,
    ChatFocus,
    ChatLibrary,
    GenBrief,
    GenerateInput,
    TurnEvent,
    TurnRequest,
} from "@model/ai";
import type { ArtifactContent, ElementInstance, Section } from "@model/artifact";
import type { Target } from "@model/target";
import { applyPatch } from "@model/ai";
import { createSignal } from "solid-js";
import { createStore, produce } from "solid-js/store";
import { commit, currentArtifactId, editor, selection } from "@editor/editor";
import { streamTurn } from "../api";
import { appTheme } from "../theme";
import { loadBilling } from "./billing";
import { artifactTitle, artifacts, formatLabel, persistArtifact } from "./library";

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
    return { view: "library", artifactCount: artifacts().length, recent };
}

function buildContext(): ChatContext {
    const id = currentArtifactId();
    if (editorActive() && id)
        return {
            surface: "editor",
            artifactId: id,
            content: editor.artifact,
            focus: deriveFocus(),
        };
    // A live in-chat draft is an editable (but unsaved) artifact — refine it through the same editor
    // toolset; proposals patch the draft (applyProposal), not the library, until the user opens it.
    const d = activeDraft();
    if (d) return { surface: "editor", content: d.content };
    return { surface: "library", library: buildLibrary() };
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

// ---- proposals: apply to the editor (undoable) or discard ----

function findWidget(msgId: number, blockId: string): Extract<UIBlock, { k: "widget" }> | undefined {
    const m = thread.messages.find((x) => x.id === msgId);
    const b = m?.blocks.find((x) => x.k === "widget" && x.blockId === blockId);
    return b && b.k === "widget" ? b : undefined;
}

export function applyProposal(msgId: number, blockId: string): void {
    const w = findWidget(msgId, blockId);
    if (!w || w.block.type !== "proposal" || w.applied) return;
    // A refine proposal on a live draft patches the DRAFT (still unsaved); otherwise it commits to the open
    // editor artifact (undoable). Either way the source re-renders — the draft card, or the editor canvas.
    const d = activeDraft();
    if (d) setDrafts(d.id, "content", applyPatch(d.content, w.block.patch));
    else commit(applyPatch(editor.artifact, w.block.patch));
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
