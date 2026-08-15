import type { ChatBlock, GenBrief, WorkspaceAction } from "@model/ai";

// The thread's block shapes and their ordering rule. Split out of chat.ts, which reaches the router
// and the editor store at import time and so cannot be exercised on its own.

export type UIBlock =
    | { k: "thinking"; steps: string[]; done: boolean }
    | { k: "text"; text: string }
    | { k: "tool"; blockId: string; tool: string; title: string; done: boolean; detail?: string }
    | { k: "brief"; blockId: string; brief: GenBrief; state: "pending" | "started" | "superseded" }
    | { k: "draft"; draftId: string }
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
export const OUTPUT_BLOCKS: UIBlock["k"][] = ["widget", "brief", "action"];

// Starting one brief resolves the rest of the message's briefs: the started card shows progress,
// every other still-pending proposal is superseded so no stale "Generate →" button dangles.
export function resolveBriefs(blocks: UIBlock[], startedId: string | null): void {
    for (const b of blocks)
        if (b.k === "brief" && b.state === "pending")
            b.state = b.blockId === startedId ? "started" : "superseded";
}

// Applying one outline/write/plan card discards every EARLIER still-unapplied card of the same
// type: the newer proposal supersedes the older ones, so no stale actionable card remains.
// `appliedId` marks the applied card in this message (null when it lives in a later message);
// cards after it stay live.
export function discardSuperseded(
    blocks: UIBlock[],
    type: "outline" | "write" | "plan",
    appliedId: string | null,
): void {
    for (const b of blocks) {
        if (b.k !== "widget" || b.block.type !== type) continue;
        if (b.blockId === appliedId) return;
        if (!b.applied) b.applied = "discarded";
    }
}

// A tool's card is pushed the moment the tool returns, but the prose introducing it streams after.
// Text therefore sinks above any trailing cards instead of landing underneath them; the tool shell
// left in between keeps a second prose run from merging into the first.
export function textInsertAt(blocks: readonly UIBlock[]): number {
    let at = blocks.length;
    while (at > 0 && OUTPUT_BLOCKS.includes(blocks[at - 1]!.k)) at--;
    return at;
}
