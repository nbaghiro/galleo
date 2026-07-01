import type { TurnKind } from "./event";

// What the client asks the agent to do. Every capability is a turn with a kind + a typed input; the
// runtime routes on the kind. `generate` has no prior artifact; the rest operate on the artifact the
// turn is attached to (and `section` on a specific section/cell within it).

export type Surface = "deck" | "doc" | "web";

export interface GenerateInput {
    prompt: string;
    surface: Surface;
    theme: string;
    goal?: string;
    audience?: string;
    tone?: string;
    length?: string;
    contextRefs?: string[]; // ids of attached context (doc/url) in the artifact's ContextPack
}

export interface EditInput {
    instruction: string; // a whole-artifact revision ("make it punchier", "add a competition slide")
}

export interface SectionInput {
    instruction: string;
    sectionId: string;
    cell?: string; // narrow to one element/block within the section
}

export interface ChatInput {
    message: string; // conversational turn; may research + propose a patch, or just reply
}

export type TurnRequest =
    | { kind: "generate"; input: GenerateInput }
    | { kind: "edit"; input: EditInput }
    | { kind: "section"; input: SectionInput }
    | { kind: "chat"; input: ChatInput };

export type TurnStatus = "pending" | "running" | "done" | "error" | "canceled";

export const isKind = (k: string): k is TurnKind =>
    k === "generate" || k === "edit" || k === "section" || k === "chat";
