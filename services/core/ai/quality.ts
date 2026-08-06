import type { ElementInstance, Section } from "@model/artifact";

// structure/content heuristics only — services may not import canvas, so no real layout metrics here
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

function countEmptyRegions(el: ElementInstance): number {
    const kids = (el.data as { children?: ElementInstance[] }).children;
    if (!Array.isArray(kids)) return 0;
    if (kids.length === 0) return 1;
    return kids.reduce((n, k) => n + countEmptyRegions(k), 0);
}

export function checkSection(section: Section, surface: string): SectionCheck {
    const issues: string[] = [];

    const empties = countEmptyRegions(section.root);
    if (empties > 0) {
        issues.push(`${empties} empty region(s) — fill every column with a real element`);
    }

    const acc: Content = { texts: [], types: [], headings: 0 };
    walk(section.root, acc);
    const chars = acc.texts.join(" ").trim().length;
    const hasFocal = acc.types.some((t) => FOCAL_TYPES.has(t));

    if (acc.headings === 0 && !hasFocal && acc.texts.length > 0) {
        issues.push("no headline — lead with one text element styled h1 or h2");
    }
    if (acc.texts.some((t) => PLACEHOLDER_RE.test(t))) {
        issues.push("contains placeholder or lorem text — write real, specific copy");
    }
    if (surface === "deck" && acc.types.length <= 1 && chars < 120 && !hasFocal) {
        issues.push("too sparse for a slide — add supporting elements so it fills the frame");
    }
    if (chars < 12 && !hasFocal) {
        issues.push("almost no content — write real, finished copy");
    }

    return { ok: issues.length === 0, issues };
}
