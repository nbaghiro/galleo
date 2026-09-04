export const RUBRIC = `## The quality bar (hit every rule)
- Open AND close on a \`full\` section carrying a background image; the closing section mirrors the cover's shape (label → headline → subtitle → button). These are the emotional bookends.
- Make the SECOND section restate the whole thing in one line, a single big headline or a thesis quote.
- Default interior cell = a \`container\` of { label eyebrow → h2 headline → body paragraph }, extended only with the elements the point needs. One section = one idea.
- Alternate \`split-6040\` and \`split-4060\` so the image side zig-zags; use \`three-up\` only for genuine triads (3 stats, 3 cards, 3 quotes); \`two-col\` only for pairs; \`full\` for covers, single quotes, tables, and CTAs.
- Across the piece include at least: one \`three-up\` of three \`stat\`s, one \`three-up\` of \`container\`s with a \`surface\`, one \`chart\` in a split (with a \`caption\` naming its units/axes), one \`diagram\` (process or funnel), one \`table\` with real columns, one standalone pull-\`quote\`, and one \`callout\` on the single most important claim.
- Put a background image ONLY on the emotional beats (cover, a big pull-quote or manifesto break, the CTA), plus at most ONE interior mood band: a full-bleed image section carrying a single h2 line and nothing else, at the piece's emotional midpoint. Every other interior section rides the plain theme.
- Most sections get no special move. Alternate dense sections with breathing ones, let interior sections be plain, and spend a flourish (a pinned badge, a baseline number line) on at most two or three moments in the piece; rare is what makes it land.`;

export const VOICE = `## Voice (write like the demos)
- Concrete and sensory over abstract, "the same five templates, the same stock photos, the same confident slop", not "low quality output".
- Numbers are specific and odd. Never round-and-vague, "1 in 6", "+1.49°C", "80 million streams", "3h 58m", not "millions" or "a lot".
- Contrast lands in short sentences, not punctuation: "Made to last. Made to return."; "AI made the first draft free. It also made the average one worse." Never join clauses with an em-dash; use a comma, a period, or a middot between a label and a value.
- Vary the construction of neighbouring blurbs, captions, and card lines; a row of lines sharing one shape reads as generated even when each is fine alone.
- Headlines: punchy, declarative, usually ≤8 words, often a turn or contrast. Eyebrows (label): short, ALL-CAPS or a numbered marker ("01, The problem").
- Stats: a tight value ("$1.1T", "12×", "−42%") with a label that is a full explanatory clause. Quotes: attribute "Name · Role, Company" or " Publication".
- Table cells never contain a comma, thousands separators included: cells split on commas, so "2,720 GBP" becomes two cells. Write "2720 GBP", and join a label to a value with a middot ("Coastal · two nights").
- Numbers reconcile across the piece: a chart's series sums to the stat that cites it, a use-of-funds table sums to the ask, hours times rate matches the price. Readers check.
- Body paragraphs: 40–75 words for decks/sites (often one paragraph + bullets), 60–90 and sometimes doubled for documents. No filler, no "in today's fast-paced world". Never lorem ipsum.
- Image \`src\` = an art-director's brief for a photo stock actually holds: a specific scene of real places and objects, written as a phrase with spaces ("aerial view of a wind farm at dusk", "quiet desk in dawn light"), never a brand, a product shot, or an abstraction. Where the photo can only be approximate, caption the scene, not the exact item.`;

// The one place the section count is stated, so the planner is not handed three ranges to
// reconcile. The bands bracket what the estimate prices for each length (`sectionsForLength`).
export function lengthGuidance(length?: string): string {
    const l = (length ?? "").toLowerCase();
    if (l.startsWith("short"))
        return "Keep it tight: 5 to 8 sections, only the beats the argument needs. Never pad to hit a number.";
    if (l.startsWith("in") || l.startsWith("deep") || l.startsWith("long"))
        return "Give it the full treatment: 14 to 20 sections, the rich version with its proof and detail. Never pad to hit a number, and never cut a beat the argument needs.";
    return "Size it to the story, usually 8 to 14 sections: a sharp single idea sits at the low end, an evidence-heavy argument at the high end. Never pad to hit a number, and never cut a beat the argument needs.";
}
