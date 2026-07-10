import type {
    ChatBlock,
    ChatContext,
    ChatFocus,
    ChatLibrary,
    TurnEvent,
    TurnRequest,
} from "@model/ai";
import type { ElementInstance, Section } from "@model/artifact";
import type { Target } from "@model/target";
import { applyPatch } from "@model/ai";
import { createSignal } from "solid-js";
import { createStore, produce } from "solid-js/store";
import { commit, currentArtifactId, editor, selection } from "@editor/editor";
import { streamTurn } from "../../api";
import { loadBilling } from "../../stores/billing";
import { artifacts, formatLabel } from "../../stores/library";

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
    if (id)
        return {
            surface: "editor",
            artifactId: id,
            content: editor.artifact,
            focus: deriveFocus(),
        };
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
                m.blocks.push({ k: "widget", blockId: ev.blockId, block: ev.block });
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

// ---- proposals: apply to the editor (undoable) or discard ----

function findWidget(msgId: number, blockId: string): Extract<UIBlock, { k: "widget" }> | undefined {
    const m = thread.messages.find((x) => x.id === msgId);
    const b = m?.blocks.find((x) => x.k === "widget" && x.blockId === blockId);
    return b && b.k === "widget" ? b : undefined;
}

export function applyProposal(msgId: number, blockId: string): void {
    const w = findWidget(msgId, blockId);
    if (!w || w.block.type !== "proposal" || w.applied) return;
    commit(applyPatch(editor.artifact, w.block.patch));
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
