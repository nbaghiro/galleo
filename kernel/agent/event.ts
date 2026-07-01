import type { Patch } from "./patch";

// The streamed agent protocol — the single contract the runtime emits, the event log persists, and the
// Console UI (and today's simulator) consume. The terminal renders `narration`; the canvas applies
// `patch` ops as they stream; `reply` carries a chat answer. Swapping the simulator for the real LLM
// runtime changes nothing on the client, because both speak exactly this.

export type TurnKind = "generate" | "edit" | "section" | "chat";

export type Phase =
    | "intake"
    | "spine"
    | "outline"
    | "plan"
    | "build"
    | "edit"
    | "research"
    | "compose"
    | "done";

export type SectionStatus = "queued" | "active" | "writing" | "image" | "done";

export interface Beat {
    id: string;
    label: string;
    role: string;
}

export type AgentEvent =
    | { type: "turn.start"; kind: TurnKind }
    | { type: "phase"; name: Phase }
    | { type: "narration"; text: string; mono?: string; sub?: string } // the Console terminal lines
    | { type: "plan"; beats: Beat[] }
    | { type: "section.status"; id: string; status: SectionStatus }
    | { type: "patch"; ops: Patch } // apply to the canvas as it streams
    | { type: "reply"; text: string } // chat/research answer
    | { type: "turn.done"; summary?: string }
    | { type: "error"; message: string };

// A persisted event = an AgentEvent plus its monotonic sequence in the turn's log (the SSE resume cursor).
export interface LoggedEvent {
    seq: number;
    event: AgentEvent;
}
