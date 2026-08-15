import type { Surface } from "@model/ai";
import { PERSONA } from "./persona";
import { heading, stack } from "./system";
import type { PromptParts } from "./system";

const BRIEF_JOB = `## Your job
Expand a raw one-line prompt into a working brief the person will edit before anything is built. Infer, don't interrogate: read what the prompt implies about the goal (what the piece must achieve), the audience (who it's for), and the tone (the register to write in), and state each in one short, concrete line, plain inferences the person can correct, not questions. Then extract 2–6 "must cover" points: short, checkable noun phrases the piece has to address, pull them from the prompt itself where stated, and fill the obvious gaps for this kind of piece where not. Only if something genuinely ambiguous would change the piece's STRUCTURE (not its wording) may you add ONE clarifying question in \`clarify\`; otherwise omit it. Never restate the prompt as a question.`;

// A re-read that repeats the first read is worthless, so the previous one is shown and ruled out.
function rethink(previous: BriefRead): string {
    const lines = [
        `Goal: ${previous.goal}`,
        `Audience: ${previous.audience}`,
        `Tone: ${previous.tone}`,
        previous.mustInclude?.length ? `Must cover: ${previous.mustInclude.join("; ")}` : undefined,
    ].filter((l): l is string => !!l);
    return heading(
        "You already read it this way, don't repeat it",
        `${lines.join("\n")}\n\nGive a genuinely DIFFERENT reading of the same prompt: a different angle on what it's for, a different cut of who it's aimed at, and a must-cover list that emphasises different things. Same subject, different take, not a reworded version of the above.`,
    );
}

export interface BriefRead {
    goal: string;
    audience: string;
    tone: string;
    mustInclude?: string[];
}

export function briefParts(prompt: string, surface?: Surface, previous?: BriefRead): PromptParts {
    return {
        system: stack(PERSONA, BRIEF_JOB),
        prompt: stack(
            heading("The raw prompt", prompt),
            surface ? `It will be built as a ${surface}.` : "",
            previous ? rethink(previous) : undefined,
            "Draft the brief now.",
        ),
    };
}
