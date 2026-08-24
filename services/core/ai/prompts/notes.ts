import type { ArtifactContent, Section } from "@model/artifact";
import { PERSONA } from "./persona";
import { heading, sectionText, stack } from "./system";
import type { PromptParts } from "./system";

// Speaker notes: what a person says over a section, plus the reminders only they see. The script is
// synthesized to audio verbatim, so this prompt is about speech rather than prose.

const SPOKEN_RULES = `## Writing the spoken script
- Write what a person SAYS, not what a page shows. Read every line back in your head; if it sounds like a caption, rewrite it.
- Short sentences. One idea each. A listener cannot re-read, so a clause they have to hold is a clause that fails.
- Say numbers the way a person says them: "about a third", "twelve thousand", "roughly two and a half times". Never "~1/3", "12k", "2.5x".
- Do not read the slide aloud. The audience can already see the headline; the script says what the headline does not.
- No bullet fragments, no parentheticals, no asides in brackets, no stage directions.
- Carry the piece forward: pick up where the previous section left off and hand off to the next. Never restate what an earlier section already said.
- Expand abbreviations and symbols into words the first time: "year over year", "per cent", "and".
- Two to five sentences for a normal section. A cover or a closer can be one.

## Writing the cues
- A cue is a private reminder for the presenter: timing, a thing to watch for, a question to expect, something NOT to say.
- Cues are never spoken and never shown to an audience, so put anything sensitive here rather than in the script.
- Most sections need none. Only add one when it earns its place. Never more than three.
- Keep each under about ten words.`;

const FORMAT_NOTE: Record<string, string> = {
    deck: "This is a deck. Each section is a slide someone stands in front of, so the script is a beat in a talk.",
    doc: "This is a written document. Each section is read aloud as narration, so the script is a spoken summary of what that part covers, not a performance.",
    web: "This is a web page. Each section is narrated to someone scrolling it, so the script is a short guide to what they are looking at.",
};

const CLIP = 700; // per section: enough to write from, short enough that a long deck still fits

const sectionRows = (sections: readonly Section[]): string =>
    sections
        .map((s, i) => {
            const body = sectionText(s).slice(0, CLIP) || "(no text)";
            return `${i + 1}. [${s.id}] ${body}`;
        })
        .join("\n\n");

/** Existing notes on sections we are NOT rewriting, so the new ones join up with them. */
const keptNotes = (sections: readonly Section[], writing: Set<string>): string | undefined => {
    const rows = sections
        .filter((s) => !writing.has(s.id) && s.notes?.spoken.trim())
        .map((s) => `[${s.id}] ${s.notes!.spoken.trim().slice(0, CLIP)}`);
    return rows.length
        ? heading(
              "Notes already written for other sections (do not rewrite these)",
              rows.join("\n"),
          )
        : undefined;
};

export function speakerNotesParts(
    content: ArtifactContent,
    targetIds: readonly string[],
    guidance?: string,
): PromptParts {
    const writing = new Set(targetIds);
    const targets = content.sections.filter((s) => writing.has(s.id));
    const whole = targets.length === content.sections.length;
    return {
        system: stack(
            PERSONA,
            "You write speaker notes: the words a presenter says over a piece, and the private cues they keep to themselves.",
            FORMAT_NOTE[content.format] ?? FORMAT_NOTE.deck!,
            SPOKEN_RULES,
        ),
        prompt: stack(
            heading(
                whole
                    ? "The piece, in order"
                    : "The piece, in order (context; write notes only for the sections named below)",
                sectionRows(content.sections),
            ),
            keptNotes(content.sections, writing),
            guidance && heading("What the author asked for", guidance),
            heading(
                "Write notes for these sections",
                targets.map((s) => `[${s.id}]`).join(", ") || "(none)",
            ),
            "Return one entry per named section, in the same order, each with the section's id.",
        ),
    };
}
