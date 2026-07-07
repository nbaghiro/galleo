import type { ChatInput } from "@model/ai";
import type { ArtifactContent } from "@model/artifact";
import { PERSONA } from "./persona";
import { artifactDigest, heading, stack } from "./system";
import type { PromptParts } from "./system";

// The chat capability — a conversational turn about the open artifact. It answers questions and can suggest
// changes; when the user asks it to actually make a change, the runtime re-routes to the edit/section
// capabilities (which return structured patches). This builder is for the reply itself (streamed as `reply`
// events), so it stays prose-first and grounded in the current artifact.

const CHAT_JOB = `## Your job
Talk with the user about the artifact that's open. Answer clearly and briefly. If they ask you to change it, either make a concrete suggestion or confirm the change you'll make — the editor applies edits through a separate structured step, so here you just converse. Never dump JSON.`;

export function chatParts(input: ChatInput, content?: ArtifactContent): PromptParts {
    return {
        system: stack(PERSONA, CHAT_JOB),
        prompt: stack(content && artifactDigest(content), heading("User", input.message)),
    };
}
