import type { ArtifactContent } from "@model/artifact";
import { aria } from "../../../services/demos/aria";
import { fieldnotes } from "../../../services/demos/fieldnotes";
import { galleo } from "../../../services/demos/galleo";
import { helios } from "../../../services/demos/helios";
import { lumen } from "../../../services/demos/lumen";
import { slowweb } from "../../../services/demos/slowweb";
import { terra } from "../../../services/demos/terra";
import type { Surface } from "./session";

// The demo generation set: each example prompt is paired with a real, hand-built artifact (the same
// fixtures the demo library ships). In demo mode the intake's starters are these, and "generating" one
// plays a client-side narration that reveals that artifact — so the product is testable end to end with
// beautiful, believable output and no backend LLM. Surface + theme come from the fixture itself.

export interface DemoExample {
    id: string;
    surface: Surface;
    label: string; // short chip label in the intake
    prompt: string; // the full prompt (what a user would have typed)
    title: string; // the saved artifact's title
    artifact: ArtifactContent;
}

const mk = (
    id: string,
    label: string,
    prompt: string,
    title: string,
    artifact: ArtifactContent,
): DemoExample => ({ id, label, prompt, title, artifact, surface: artifact.format as Surface });

export const DEMO_EXAMPLES: DemoExample[] = [
    mk(
        "galleo",
        "Seed pitch deck",
        "An investor seed deck for Galleo — one canvas that presents as a deck, reads as a doc, and ships as a site. Confident, bold, and credible.",
        "Galleo — Seed deck",
        galleo,
    ),
    mk(
        "aria",
        "Album launch",
        "An album launch deck for Aria's new record — the mood, the tracklist, the story behind it, and the tour. Cinematic and moody.",
        "Aria — Album launch",
        aria,
    ),
    mk(
        "terra",
        "Brand site",
        "A brand site for Terra, a regenerative farming collective — a striking hero, the mission, what they grow, and how to get involved.",
        "Terra — Brand site",
        terra,
    ),
    mk(
        "lumen",
        "Product launch",
        "A launch page for Lumen — a warm, minimal lamp that wakes you with light. A hero, the features, the story, and a preorder CTA.",
        "Lumen — Product launch",
        lumen,
    ),
    mk(
        "slowweb",
        "Long-form essay",
        "A long-form essay making the case for the slow web — calmer, hand-made corners of the internet. Editorial and unhurried.",
        "The Slow Web — Essay",
        slowweb,
    ),
    mk(
        "helios",
        "Climate report",
        "A climate report on home electrification in 2026 — the cost curve, the key findings, and clear recommendations. Data-rich and authoritative.",
        "Helios — Climate report",
        helios,
    ),
    mk(
        "fieldnotes",
        "Photo essay",
        "A photo essay from the Faroe Islands — field notes from a week of wind, cliffs, and fog. Immersive and image-led.",
        "Field Notes — Faroe Islands",
        fieldnotes,
    ),
];
