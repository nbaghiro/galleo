import type { GenerateInput, Surface } from "@model/ai";
import { heading } from "./system";

// Canonical section arcs, extracted from the 30 starter templates (services/templates/*). Each category of
// artifact has a proven sequence and a set of "tells" (kicker style, dominant elements, how it closes). The
// outline prompt is handed the arc that best fits the brief as a scaffold to adapt — not copy — so a
// generation follows a structure that already works for that job.

export interface Arc {
    key: string;
    label: string;
    arc: string; // the ordered section sequence
    tells: string; // the category's signature choices
}

export const ARCS = {
    pitch: {
        key: "pitch",
        label: "Pitch / fundraising deck",
        arc: "cover → problem → why now → the product → market size (stat-trio) → how it works (diagram) → traction (chart) → business model / pricing (table) → why we win → team → the ask (CTA)",
        tells: "deck; numbered em-dash kickers ('01 — The problem'); big stat-trios; a raise badge on the cover ('$4M SEED · LED BY …'); one thesis quote over an image; ends on 'the ask' with a contact button.",
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
        arc: "hero (with a button) → the problem → stat band → the product → feature highlight → how it works (diagram) → features (three-up cards) → social proof (quote + stats) → pricing (table) → FAQ (two-col) → final CTA (button)",
        tells: "web; second-person benefit-forward voice; a button in the hero AND a button in the closing CTA (the bookend); inline feature badges ('ON-DEVICE'); reassurance callouts ('Ships free · 60-night trial').",
    },
    proposal: {
        key: "proposal",
        label: "Proposal / client update",
        arc: "cover → the opportunity → what we heard → our approach → deliverables (three-up cards) → timeline (diagram) → investment (table) → why us (stat-trio + success callout) → next steps (CTA)",
        tells: "deck or doc; numbered kickers; money-and-structure tables (investment, milestones, roles); a success callout with the ROI headline; a validity clause ('valid for 30 days'); closes on an action button ('Approve & schedule kickoff').",
    },
    creative: {
        key: "creative",
        label: "Personal / creative / editorial",
        arc: "hero → statement → selected work or chapters (image-led, alternating full images and image+prose splits) → a feature → a lyric quote break → contact / close",
        tells: "doc or web; first-person, literary, intimate voice; imagery- and quote-driven with almost no charts/tables; status badges on work ('FEATURED', 'SHIPPING'); photo-essay beats wrap an image with a lyrical caption.",
    },
    generic: {
        key: "generic",
        label: "General",
        arc: "cover → one-line thesis → 3–5 body sections (alternating splits) → a stat-trio → a pull-quote break → close (CTA)",
        tells: "adapt the mix to the topic; keep one idea per section and the emotional bookends.",
    },
} satisfies Record<string, Arc>;

// Pick the arc that best fits the brief — primarily off the intake `goal` chip, with the surface as a hint.
export function chooseArc(goal?: string, surface?: Surface): Arc {
    const g = (goal ?? "").toLowerCase();
    if (g.includes("pitch")) return ARCS.pitch;
    if (g.includes("sell") || g.includes("sale"))
        return surface === "web" ? ARCS.marketing : ARCS.sales;
    if (g.includes("report")) return ARCS.report;
    if (g.includes("announce")) return ARCS.marketing;
    if (surface === "web") return ARCS.marketing;
    if (g.includes("teach") || g.includes("inform")) return ARCS.report;
    return ARCS.generic;
}

export function arcGuidance(input: GenerateInput): string {
    const a = chooseArc(input.goal, input.surface);
    return heading(
        "Design the structure for THIS brief",
        `Decide the narrative this specific topic, goal, and audience need, then choose the sections and their order to serve it — don't reach for a stock template. As one reference, a "${a.label}" often runs:\n${a.arc}\nTreat that as a proven shape to draw from, remix, or set aside — not a checklist. Two different briefs should not produce the same skeleton. Signatures of this genre: ${a.tells}`,
    );
}
