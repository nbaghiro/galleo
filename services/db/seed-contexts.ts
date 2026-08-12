// Demo material for the context library: hand-written sources that match the seeded artifacts'
// universe, so a demo generate against them quotes facts that visibly line up with the library.

import { LUMEN_KNOWLEDGE } from "./seed-knowledge";

export interface SeedContextItem {
    kind: "file" | "text";
    title: string;
    body: string;
}

export interface SeedContext {
    name: string;
    description: string;
    items: SeedContextItem[];
    artifactTitles: string[]; // seeded artifacts to pull in via addArtifactItem
}

const LUMEN_SPEC = `# Lumen One — spec sheet (internal, v1.4)

Positioning: a whisper-quiet air purifier for bedrooms and small studios; no app required.

## Hardware
- Filtration: true HEPA-13 with activated-carbon prefilter; captures 99.95% of particles at 0.3 µm.
- CADR: 210 m³/h. Recommended room size: up to 38 m² (410 sq ft).
- Noise: 18 dB on Night mode, 31 dB on Standard, 44 dB on Boost — measured at 1 m.
- Power draw: 4.5 W on Night, 27 W max. Standby under 0.5 W.
- Size and weight: 46 cm tall, 22 cm diameter, 3.4 kg. Cable length 1.8 m.
- Controls: one dial, three modes, no app, no wifi, no microphone. A single amber LED shows filter life.

## Filters
- Filter life: about 6 months at 8 hours/day; the LED shifts from green to amber at 15% remaining.
- Replacement: Lumen Filter Duo (HEPA + carbon) at $12 per quarter on subscription or $19 one-off.
- The prefilter is vacuumable; we recommend a monthly pass.

## What ships in the box
Lumen One, one pre-installed Filter Duo, the fabric cable, a quick-start card (12 words long).

## Certifications
CARB-compliant, Energy Star, Quiet Mark pending (expected before launch week).`;

const LUMEN_PRICING = `Launch pricing and offers — Lumen One

- Pre-order price: $249, ships in 6 weeks. Full price after launch window: $299.
- Launch bundle: Lumen One + a year of filters (4 Filter Duos) for $289 pre-order only.
- Filter subscription: $12/quarter, pausable anytime, free shipping, first Duo included free.
- Returns: 60 nights, free return label, no restocking fee. Warranty: 3 years.
- Retail: online-only at launch; two retail partners (Foundry Home, Nest & North) from Q1.
- Price-match: we don't. The pre-order discount is the only discount we run all year.`;

const LUMEN_CLAIMS = `Claims we can and cannot make (legal-approved, June)

CAN say: "removes 99.95% of airborne particles as small as 0.3 microns"; "quieter than a library
whisper on Night mode (18 dB)"; "cleans a 38 m² room about twice per hour"; "Energy Star certified".

CANNOT say: anything about preventing illness, allergies "cured" or "eliminated" (use "reduces
exposure to common allergens"), "the quietest purifier" (unverified superlative), medical-device
comparisons, or specific claims about wildfire smoke beyond "captures fine smoke particles (PM2.5)".`;

const TERRA_VOICE = `# Terra — voice guidelines

Terra sounds like a knowledgeable friend who happens to be a farmer: warm, plain, and specific.
We write like people who touch soil, not like a wellness brand.

## Principles
1. Plain beats poetic. "We plant in October because the rains come in November" beats "we dance
   with the seasons."
2. Specific beats grand. Name the farm, the variety, the week. "Marisol's fields in Jalisco"
   beats "our global network of growers".
3. Short sentences carry weight. One idea per sentence. Paragraphs of two or three.
4. We never talk down. No "did you know?", no lectures about what the reader should feel guilty
   about. We share what we do; readers draw conclusions.
5. Numbers are welcome when they're honest and rounded: "about 40 families", "three harvests".

## Vocabulary
- We say: soil, growers, harvest, batch, single-origin, direct trade, the farm's own name.
- We avoid: artisanal, curated, elevated, journey, ethically-sourced (show it instead), premium,
  hand-crafted (unless hands actually crafted it), sustainable as a bare adjective.

## Tone by surface
Site headlines: five to nine words, concrete image first ("Grown slow on volcanic soil").
Product pages: one paragraph of origin, one of taste, one of practical detail.
Email: first sentence is the point; no "we hope this finds you well".`;

const TERRA_BANNED = `Words we avoid, and what to use instead

- "artisanal" → name the person: "roasted by Inés in small batches"
- "curated" → "chosen" or just say what it is
- "elevated" → describe the change: "brighter, cleaner cup"
- "journey" → "harvest", "season", or delete the sentence
- "premium" → the price says it; the copy shouldn't
- "eco-friendly" → the specific practice: "shade-grown", "no synthetic fertilizer"`;

const HELIOS_METRICS = `# Helios — Q3 metrics (board copy, final)

Deployment
- 14 new rooftop arrays commissioned; 1.4 MW added; portfolio now 11.2 MW across 96 sites.
- Average install time fell from 11 weeks to 8.5 weeks (permit pre-packs did most of the work).

Commercial
- Revenue $4.8M (+22% QoQ); gross margin 34% (up from 31%).
- Churn 2.0% annualized, down from 3.1% — the Ørsted-referenced pilot converted to a 3-year term.
- Pipeline: 41 qualified sites, 6.8 MW, weighted value $9.3M. Two municipal tenders pending.

Operations
- Fleet availability 98.6%; two inverter failures, both swapped within 48 hours.
- Monitoring migration finished: all 96 sites report into one dashboard, 5-minute resolution.

People
- Headcount 58 (+6); first dedicated permitting team of 3 stood up in September.`;

const HELIOS_MEMO = `Q3 narrative memo — what actually happened

The quarter's story is boring in the best way: we got faster at the thing we already do. The
permit pre-pack experiment from Q2 became standard practice, and it cut median install time by
two and a half weeks. That, more than any single deal, drove the revenue beat — we simply
commissioned sites earlier than planned.

The Ørsted-referenced pilot mattered for a different reason. The win wasn't the contract value
(modest) but the reference itself: two of the six municipal tenders in the pipeline name that
pilot in their prequalification notes. Reliability is the product now; the panels are table
stakes. Fleet availability at 98.6% is the number to protect, and the 48-hour inverter swaps are
the operational story worth telling wherever we present.

Risks we're watching: the two pending tenders decide in November and would each be our largest
site to date; grid-connection queues in two regions stretched past 90 days; and filter — sorry,
inverter — supply lead times crept from 6 to 9 weeks, so we've started holding two spares per
20 sites instead of one.

If the board asks for one sentence: we added 1.4 MW, grew revenue 22%, cut churn a third, and
made installs 23% faster — the machine works, feed it pipeline.`;

export const DEMO_CONTEXTS: SeedContext[] = [
    {
        name: "Everything Lumen",
        description: "The whole knowledge base — attach when any Lumen question might come up.",
        items: LUMEN_KNOWLEDGE.map((d) => ({
            kind: "file" as const,
            title: d.title,
            body: d.body,
        })),
        artifactTitles: ["Lumen — Product launch"],
    },
    {
        name: "Lumen — product facts",
        description: "The Lumen One launch: specs, pricing, and the claims legal signed off on.",
        items: [
            { kind: "file", title: "lumen-spec-sheet.md", body: LUMEN_SPEC },
            { kind: "file", title: "launch-pricing-and-offers.txt", body: LUMEN_PRICING },
            { kind: "text", title: "Claims we can and cannot make", body: LUMEN_CLAIMS },
        ],
        artifactTitles: ["Lumen — Product launch"],
    },
    {
        name: "Terra — brand voice",
        description: "How Terra sounds: warm, plain, specific — and the words it never uses.",
        items: [
            { kind: "file", title: "terra-voice-guidelines.md", body: TERRA_VOICE },
            { kind: "text", title: "Words we avoid", body: TERRA_BANNED },
        ],
        artifactTitles: ["Terra — Brand site"],
    },
    {
        name: "Helios — Q3 board pack",
        description: "The Q3 numbers and the narrative behind them, board-ready.",
        items: [
            { kind: "file", title: "q3-metrics.md", body: HELIOS_METRICS },
            { kind: "file", title: "q3-narrative-memo.md", body: HELIOS_MEMO },
        ],
        artifactTitles: ["Helios — Climate report"],
    },
];
