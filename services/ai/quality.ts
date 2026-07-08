import type { ElementInstance, Section } from "@model/artifact";
import { GRID_TEMPLATES } from "@model/elements";

// Deterministic quality checks on a generated section — the gate for the inline auto-repair (a section that
// trips a check is regenerated once, with the issues fed back to the model). These are structure + content
// heuristics only: `services` may not import `canvas`, so true layout metrics (fill ratio, overflow, text
// clipping) belong to the offline eval harness, which can run the engine. What's here catches the common,
// unambiguous failures — empty cells, missing headline, placeholder copy, a near-empty slide.

const PLACEHOLDER_RE =
    /lorem ipsum|placeholder text|to-?do|tbd|your (?:text|content) here|\bx{3,}\b/i;
const HEADING_STYLES = new Set(["h1", "h2", "h3", "subtitle"]);
const FOCAL_TYPES = new Set(["image", "stat", "chart", "diagram", "table"]);

interface Content {
    texts: string[];
    types: string[];
    headings: number;
}

function walk(el: ElementInstance, acc: Content): void {
    acc.types.push(el.type);
    const data = el.data as { text?: unknown; style?: unknown; children?: ElementInstance[] };
    if (typeof data.text === "string") {
        acc.texts.push(data.text);
        if (
            el.type === "text" &&
            typeof data.style === "string" &&
            HEADING_STYLES.has(data.style)
        ) {
            acc.headings++;
        }
    }
    if (Array.isArray(data.children)) for (const k of data.children) walk(k, acc);
}

export interface SectionCheck {
    ok: boolean;
    issues: string[];
}

// Check one section. `surface` tunes expectations — a deck slide should carry more than a doc paragraph.
export function checkSection(section: Section, surface: string): SectionCheck {
    const issues: string[] = [];
    const keys = GRID_TEMPLATES.find((g) => g.id === section.grid)?.cells ?? ["a"];

    // 1. every cell the grid exposes must hold a real element (the blank-section failure)
    for (const k of keys) {
        if (!section.cells[k]?.element) {
            issues.push(`cell "${k}" is empty — fill it with a real element`);
        }
    }

    // gather all content across the filled cells
    const acc: Content = { texts: [], types: [], headings: 0 };
    for (const k of keys) {
        const el = section.cells[k]?.element;
        if (el) walk(el, acc);
    }
    const chars = acc.texts.join(" ").trim().length;
    const hasFocal = acc.types.some((t) => FOCAL_TYPES.has(t));

    // 2. a text-led section needs a headline (image/stat/chart-led sections are exempt)
    if (acc.headings === 0 && !hasFocal && acc.texts.length > 0) {
        issues.push("no headline — lead with one text element styled h1 or h2");
    }
    // 3. no placeholder / lorem copy
    if (acc.texts.some((t) => PLACEHOLDER_RE.test(t))) {
        issues.push("contains placeholder or lorem text — write real, specific copy");
    }
    // 4. a deck slide that's nearly empty (one thin element) reads as broken whitespace
    if (surface === "deck" && acc.types.length <= 1 && chars < 120 && !hasFocal) {
        issues.push("too sparse for a slide — add supporting elements so it fills the frame");
    }
    // 5. essentially no content at all
    if (chars < 12 && !hasFocal) {
        issues.push("almost no content — write real, finished copy");
    }

    return { ok: issues.length === 0, issues };
}
