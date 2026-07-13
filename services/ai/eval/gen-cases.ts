import type { Surface } from "@model/ai";
import type { ArtifactContent } from "@model/artifact";
import { galleo } from "../../demos/galleo";
import { helios } from "../../demos/helios";
import { slowweb } from "../../demos/slowweb";
import { lumen } from "../../demos/lumen";
import { terra } from "../../demos/terra";

export interface GenCase {
    id: string;
    prompt: string;
    surface: Surface;
    length?: string; // Short | Standard | In-depth
    reference: ArtifactContent;
    referenceName: string;
}

export const GEN_CASES: GenCase[] = [
    {
        id: "pitch-fintech",
        prompt: "A seed pitch deck for a B2B fintech that automates expense reports",
        surface: "deck",
        reference: galleo,
        referenceName: "galleo (deck)",
    },
    {
        id: "launch-notetaker",
        prompt: "A product launch deck for an AI note-taking app for teams",
        surface: "deck",
        reference: galleo,
        referenceName: "galleo (deck)",
    },
    {
        id: "report-ai-health",
        prompt: "A 2026 state-of-AI-in-healthcare research report",
        surface: "doc",
        reference: helios,
        referenceName: "helios (report)",
    },
    {
        id: "whitepaper-stablecoin",
        prompt: "A whitepaper on stablecoin settlement for cross-border payments",
        surface: "doc",
        reference: helios,
        referenceName: "helios (report)",
    },
    {
        id: "essay-focus",
        prompt: "An essay on why deep focus is a competitive advantage in modern work",
        surface: "doc",
        reference: slowweb,
        referenceName: "slowweb (essay)",
    },
    {
        id: "land-purifier",
        prompt: "A landing page for a whisper-quiet air purifier",
        surface: "web",
        reference: lumen,
        referenceName: "lumen (product page)",
    },
    {
        id: "site-architecture",
        prompt: "A homepage for a boutique architecture studio",
        surface: "web",
        reference: terra,
        referenceName: "terra (brand site)",
    },
];
