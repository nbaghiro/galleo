import type { ChatBlock, PendingProposal, WorkspaceAction } from "@model/ai";

// The thread's block shapes and their ordering rule. Split out of chat.ts, which reaches the router
// and the editor store at import time and so cannot be exercised on its own.

export type UIBlock =
    | { k: "thinking"; steps: string[]; done: boolean }
    | { k: "text"; text: string }
    | { k: "tool"; blockId: string; tool: string; title: string; done: boolean; detail?: string }
    | {
          k: "action";
          blockId: string;
          action: WorkspaceAction;
          state: "pending" | "done" | "dismissed";
      }
    | { k: "widget"; blockId: string; block: ChatBlock; applied?: "applied" | "discarded" };

export interface ChatMsg {
    id: number;
    role: "user" | "assistant";
    blocks: UIBlock[];
    streaming: boolean;
}

// what a turn produced, as opposed to what it narrated on the way
export const OUTPUT_BLOCKS: UIBlock["k"][] = ["widget", "action"];

type Proposal = Extract<ChatBlock, { type: "proposal" }>;

// Applying one proposal of a tool discards every EARLIER still-unapplied proposal of the same tool
// that names no other target: the newer card supersedes the older ones, so no stale actionable card
// remains. `appliedId` marks the applied card in this message (null when it lives in a later
// message); cards after it stay live.
export function discardSuperseded(blocks: UIBlock[], tool: string, appliedId: string | null): void {
    for (const b of blocks) {
        if (b.k !== "widget" || b.block.type !== "proposal" || b.block.tool !== tool) continue;
        if (b.blockId === appliedId) return;
        if (!b.applied) b.applied = "discarded";
    }
}

// the cards still waiting on the person, newest last, with the payload the agent needs to apply one
export function pendingProposals(messages: readonly ChatMsg[], limit = 8): PendingProposal[] {
    const out: PendingProposal[] = [];
    for (const m of messages)
        for (const b of m.blocks) {
            if (b.k !== "widget" || b.block.type !== "proposal" || b.applied) continue;
            const p: Proposal = b.block;
            out.push({
                id: p.id,
                tool: p.tool,
                summary: p.summary,
                ...(p.call ? { call: p.call } : {}),
                ...(p.patch ? { patch: p.patch } : {}),
            });
        }
    return out.slice(-limit);
}

// A tool's card is pushed the moment the tool returns, but the prose introducing it streams after.
// Text therefore sinks above any trailing cards instead of landing underneath them; the tool shell
// left in between keeps a second prose run from merging into the first.
export function textInsertAt(blocks: readonly UIBlock[]): number {
    let at = blocks.length;
    while (at > 0 && OUTPUT_BLOCKS.includes(blocks[at - 1]!.k)) at--;
    return at;
}
