export const RUBRIC = `## The quality bar (hit every rule)
- Open AND close on a \`full\` section carrying a background image; the closing section mirrors the cover's shape (label → headline → subtitle → button). These are the emotional bookends.
- Make the SECOND section restate the whole thing in one line, a single big headline or a thesis quote.
- Default interior cell = a \`container\` of { label eyebrow → h2 headline → body paragraph }, extended only with the elements the point needs. One section = one idea.
- Alternate \`split-6040\` and \`split-4060\` so the image side zig-zags; use \`three-up\` only for genuine triads (3 stats, 3 cards, 3 quotes); \`two-col\` only for pairs; \`full\` for covers, single quotes, tables, and CTAs.
- Across the piece include at least: one \`three-up\` of three \`stat\`s, one \`three-up\` of \`container\`s with a \`surface\`, one \`chart\` in a split (with a \`caption\` naming its units/axes), one \`diagram\` (process or funnel), one \`table\` with real columns, one standalone pull-\`quote\`, and one \`callout\` on the single most important claim.
- Put a background image ONLY on the emotional beats (cover, a big pull-quote or manifesto break, the CTA). Interior sections ride the plain theme.
- Most sections get no special move. Alternate dense sections with breathing ones, let interior sections be plain, and spend a flourish (a pinned badge, a baseline number line) on at most two or three moments in the piece; rare is what makes it land.`;

export const VOICE = `## Voice (write like the demos)
- Concrete and sensory over abstract, "the same five templates, the same stock photos, the same confident slop", not "low quality output".
- Numbers are specific and odd. Never round-and-vague, "1 in 6", "+1.49°C", "80 million streams", "3h 58m", not "millions" or "a lot".
- Contrast lands in short sentences, not punctuation: "Made to last. Made to return."; "AI made the first draft free. It also made the average one worse." Never join clauses with an em-dash; use a comma, a period, or a middot between a label and a value.
- Vary the construction of neighbouring blurbs, captions, and card lines; a row of lines sharing one shape reads as generated even when each is fine alone."
- Headlines: punchy, declarative, usually ≤8 words, often a turn or contrast. Eyebrows (label): short, ALL-CAPS or a numbered marker ("01, The problem").
- Stats: a tight value ("$1.1T", "12×", "−42%") with a label that is a full explanatory clause. Quotes: attribute "Name · Role, Company" or " Publication".
- Body paragraphs: 40–75 words for decks/sites (often one paragraph + bullets), 60–90 and sometimes doubled for documents. No filler, no "in today's fast-paced world". Never lorem ipsum.
- Image \`src\` = an art-director's brief for a photo stock actually holds: a specific, hyphenated scene of real places and objects ("aerial-view-wind-farm-at-dusk", "quiet-desk-dawn-light"), never a brand, a product shot, or an abstraction. Where the photo can only be approximate, caption the scene, not the exact item.`;

export function lengthGuidance(length?: string): string {
    const l = (length ?? "").toLowerCase();
    const lean = l.startsWith("short")
        ? " The reader asked to keep it tight, lean toward the shorter end, only the essential beats."
        : l.startsWith("in") || l.startsWith("deep") || l.startsWith("long")
          ? " The reader asked for depth, lean toward the fuller end, the rich treatment."
          : "";
    return `Let the topic decide how many sections it needs. A sharp, single-idea piece might be 5–7; a broad, evidence-heavy one 15–20. Size it to the story. Never pad to hit a number. Never cut a beat the argument needs, and don't default to a middle length out of habit.${lean}`;
}
