import type { GenerateInput, Surface } from "@model/ai";
import { heading } from "./system";

interface Arc {
    key: string;
    label: string;
    arc: string;
    tells: string;
}

export const ARCS = {
    pitch: {
        key: "pitch",
        label: "Pitch / fundraising deck",
        arc: "cover → problem → why now → the product → market size (stat-trio) → how it works (diagram) → traction (chart) → business model / pricing (table) → why we win → team → the ask (CTA)",
        tells: "deck; numbered kickers ('01, The problem'); big stat-trios; a raise badge on the cover ('$4M SEED · LED BY …'); one thesis quote over an image; ends on 'the ask' with a contact button.",
    },
    sales: {
        key: "sales",
        label: "Sales / product deck",
        arc: "cover → the problem → cost of inaction (stat-trio) → the solution → how it works → case study → results (stat-trio + chart) → customer quote → pricing (table) → next steps (CTA)",
        tells: "deck; buyer-centric; leads with the customer's pain; ends on a low-friction offer ('See your own fleet's risk in 30 minutes'), not a fundraise.",
    },
    report: {
        key: "report",
        label: "Report / research",
        arc: "cover → executive summary → headline stats (stat-trio) → findings (each a section with a captioned chart or a status-column table) → implications (callout) → recommendations (bullets) → methodology closer",
        tells: "doc; measured third-person voice; the most chart/table/stat-dense category; every chart gets a caption naming units/axes; tables carry a status/change column; credentials badge on the cover; closes with a methodology/about note.",
    },
    marketing: {
        key: "marketing",
        label: "Marketing site / landing page",
        arc: "hero band carrying the docked topbar (its nav items name the sections below) → the problem → a tinted logo or stat band → the product, image-led split → the feature areas in `tabs` → a slim image interlude → how it works (diagram) → proof: `testimonial` row, then a stat band over an image → pricing, three `pricing` tiers side by side → FAQ (`faq`, collapsible) → the closing CTA band in its own colour → footer row (justify between)",
        tells: "web; second-person benefit-forward voice; the first section carries the topbar, a 16:7 frame and a full-bleed image, and every nav item links to a real `#section-id`; a button in the hero AND one in the closing band, both pointing down the page (the bookend); the section backgrounds alternate surface, tinted, image rather than repeating; composites (`pricing`, `feature`, `testimonial`) instead of hand-rolled cards; inline feature badges ('ON-DEVICE'); reassurance under the CTA ('Ships free · 60-night trial').",
    },
    event: {
        key: "event",
        label: "Event / invitation page",
        arc: "hero band with the docked topbar, the date, city and venue sitting under the title → what the day is → the programme (a `timeline` or `roadmap` diagram) → who is speaking (a row of `profile`s) → an image band of the venue → tickets, as `pricing` tiers → practical questions (`faq`, collapsible) → the RSVP band → footer row with the address",
        tells: "web; warm and concrete, never breathless; the date, time and place appear in the hero and again in the footer; the topbar's pill CTA is the RSVP and every button on the page links down to it; ticket tiers rather than a price table; the FAQ answers travel, access, dietary needs and refunds; one image band of the actual place, not a stock crowd.",
    },
    proposal: {
        key: "proposal",
        label: "Proposal / client update",
        arc: "cover → the opportunity → what we heard → our approach → deliverables (three-up cards) → timeline (diagram) → investment (table) → why us (stat-trio + success callout) → next steps (CTA)",
        tells: "deck or doc; numbered kickers; money-and-structure tables (investment, milestones, roles); a success callout with the ROI headline; a validity clause ('valid for 30 days'); closes on an action button ('Approve & schedule kickoff').",
    },
    creative: {
        key: "creative",
        label: "Portfolio / personal / editorial",
        arc: "hero band with the docked topbar → statement → selected work or chapters (image-led, alternating full image bands with image+prose splits) → one project in depth (`tabs`, or a slim 16:5 image interlude between the beats) → a lyric quote break → about, with a `profile` → contact / close (a CTA band) → footer row",
        tells: "doc or web; first-person, literary, intimate voice; imagery- and quote-driven with almost no charts or tables; as a site it still opens on a docked topbar over a 16:7 hero, keeps the alternating band rhythm, and links each nav item to the piece of work it names; status badges on work ('FEATURED', 'SHIPPING'); photo-essay beats wrap an image with a lyrical caption.",
    },
    generic: {
        key: "generic",
        label: "General",
        arc: "cover → one-line thesis → 3–5 body sections (alternating splits) → a stat-trio → a pull-quote break → close (CTA)",
        tells: "adapt the mix to the topic; keep one idea per section and the emotional bookends.",
    },
} satisfies Record<string, Arc>;

const has = (text: string, ...words: string[]): boolean =>
    words.some((w) => new RegExp(`\\b${w}`, "i").test(text));

/** The arc a brief calls for, read off everything it says: the prompt as well as the planner's goal. */
export function chooseArc(text?: string, surface?: Surface): Arc {
    const g = (text ?? "").toLowerCase();
    if (
        has(
            g,
            "pitch",
            "investor",
            "fundrais",
            "raise\\b",
            "raising\\b",
            "seed round",
            "series [a-d]\\b",
            "venture",
            "vcs?\\b",
        )
    )
        return ARCS.pitch;
    if (has(g, "proposal", "client update", "statement of work", "sow\\b", "tender", "rfp"))
        return ARCS.proposal;
    if (has(g, "sell", "sales?\\b", "prospect", "buyer"))
        return surface === "web" ? ARCS.marketing : ARCS.sales;
    if (has(g, "report", "research", "findings", "audit", "analysis", "whitepaper", "white paper"))
        return ARCS.report;
    if (has(g, "event", "invit", "rsvp", "conference", "wedding", "summit", "meetup"))
        return ARCS.event;
    if (has(g, "announce", "landing page", "product page")) return ARCS.marketing;
    if (has(g, "portfolio", "resume", "cv\\b", "personal site", "about me", "photo essay"))
        return ARCS.creative;
    if (surface === "web") return ARCS.marketing;
    if (has(g, "teach", "inform", "explain", "lesson", "course")) return ARCS.report;
    return ARCS.generic;
}

export function arcGuidance(input: GenerateInput): string {
    const a = chooseArc(
        [input.prompt, input.goal, input.audience].filter(Boolean).join(" "),
        input.surface,
    );
    return heading(
        "Design the structure for THIS brief",
        `Decide the narrative this specific topic, goal, and audience need, then choose the sections and their order to serve it, don't reach for a stock template. As one reference, a "${a.label}" often runs:\n${a.arc}\nTreat that as a proven shape to draw from, remix, or set aside, not a checklist. Two different briefs should not produce the same skeleton. Signatures of this genre: ${a.tells}`,
    );
}
