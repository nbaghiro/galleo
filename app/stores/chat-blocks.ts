import type { ChatBlock, GenBrief, WorkspaceAction } from "@model/ai";

// The thread's block shapes and their ordering rule. Split out of chat.ts, which reaches the router
// and the editor store at import time and so cannot be exercised on its own.

export type UIBlock =
    | { k: "thinking"; steps: string[]; done: boolean }
    | { k: "text"; text: string }
    | { k: "tool"; blockId: string; tool: string; title: string; done: boolean; detail?: string }
    | { k: "brief"; brief: GenBrief }
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

// A tool's card is pushed the moment the tool returns, but the prose introducing it streams after.
// Text therefore sinks above any trailing cards instead of landing underneath them; the tool shell
// left in between keeps a second prose run from merging into the first.
export function textInsertAt(blocks: readonly UIBlock[]): number {
    let at = blocks.length;
    while (at > 0 && OUTPUT_BLOCKS.includes(blocks[at - 1]!.k)) at--;
    return at;
}
