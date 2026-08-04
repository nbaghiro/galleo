// Gemini's thought summaries arrive as markdown essays — usually a bold step heading followed by a
// paragraph of prose. Streaming all of that at the user buries the answer, so we forward only the
// step HEADLINES: one short line per move the agent makes. Pure, so the parsing is testable.

const MAX = 56;

// a complete bold run on one line — the model's own name for the step it just started
const HEADING = /\*\*([^*\n]{2,90})\*\*/g;

function tidy(raw: string): string {
    const text = raw
        .replace(/[*_`#]/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .replace(/[.:;,]+$/, "");
    if (!text) return "";
    return text.length > MAX ? `${text.slice(0, MAX - 1).trimEnd()}…` : text;
}

function firstSentence(paragraph: string): string {
    const flat = paragraph.replace(/\s+/g, " ").trim();
    const end = flat.search(/[.!?](\s|$)/);
    return tidy(end < 0 ? flat : flat.slice(0, end));
}

/**
 * Every complete step headline in the buffer so far, in order and de-duplicated. Incomplete trailing
 * text is ignored, so a half-streamed heading never ships as a step.
 */
export function thinkingSteps(buffer: string): string[] {
    const out: string[] = [];
    const seen = new Set<string>();
    const push = (raw: string): void => {
        const label = tidy(raw);
        const key = label.toLowerCase();
        if (!label || seen.has(key)) return;
        seen.add(key);
        out.push(label);
    };

    const headings = [...buffer.matchAll(HEADING)];
    if (headings.length) {
        for (const h of headings) push(h[1]!);
        return out;
    }

    // No headings in this style: fall back to the opening sentence of each FINISHED paragraph, so a
    // paragraph still being written doesn't produce a step that then changes under the user.
    const paragraphs = buffer.split(/\n{2,}/);
    for (const p of paragraphs.slice(0, -1)) push(firstSentence(p));
    return out;
}
