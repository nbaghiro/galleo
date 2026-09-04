import type { ElementInstance, Section } from "@model/artifact";
import { ELEMENTS, NESTED_TYPES } from "@services/core/ai/prompts/catalog";

// structure/content heuristics only — services may not import canvas, so no real layout metrics here
const PLACEHOLDER_RE =
    /lorem ipsum|placeholder text|to-?do|tbd|your (?:text|content) here|\bx{3,}\b/i;
const HEADING_STYLES = new Set(["h1", "h2", "h3", "subtitle"]);
const FOCAL_TYPES = new Set(["media", "image", "stat", "chart", "diagram", "table"]);

export interface Content {
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

/** The section's text and element types, flattened. Shared with the eval checks. */
export function contentOf(section: Section): Content {
    const acc: Content = { texts: [], types: [], headings: 0 };
    walk(section.root, acc);
    return acc;
}

export const PLACEHOLDER = PLACEHOLDER_RE;

interface SectionCheck {
    ok: boolean;
    issues: string[];
}

// what the model was told, held against what it sent back
//
// The catalog in prompts/catalog.ts is the contract: it names every type the model may emit and,
// per type, the fields without which the element says nothing. Checking a reply against that same
// table costs nothing and cannot drift, since a new element has to be declared there before it can
// be described at all. What it buys is the class of failure a word count never sees: an element
// that renders as a box with nothing in it.

const SPEC = new Map(ELEMENTS.map((e) => [e.type, e]));

// `group` and `card` are the pre-merge names for `container`, and the registry still resolves them
// (LEGACY_TYPES in canvas/elements/spec.ts, which this must stay in sync with). A reply using one
// renders correctly, so reporting it as unknown would send the writer chasing a non-problem.
const ALIASES: Record<string, string> = { group: "container", card: "container" };

// Named inside another element's description rather than given an entry of its own, so it is part
// of the vocabulary without being a type the model may reach for standalone. There is nothing to
// hold it to beyond its own presence, since the catalog states no fields for it.
const NESTED = new Set(NESTED_TYPES);

const isElement = (v: unknown): v is ElementInstance =>
    !!v && typeof v === "object" && typeof (v as ElementInstance).type === "string";

const dataOf = (el: ElementInstance): Record<string, unknown> =>
    (el.data ?? {}) as Record<string, unknown>;

/** Whether a field arrived carrying something, across the shapes the catalog's types can take. */
function filled(v: unknown): boolean {
    if (typeof v === "string") return v.trim().length > 0;
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === "number") return Number.isFinite(v);
    if (typeof v === "boolean") return true;
    if (v && typeof v === "object") return Object.keys(v).length > 0;
    return false;
}

// The layout containers, the ones the model arranges freely. Everything else in the catalog that
// holds children owns its slots and dictates their roles, which is why a rule about the model's own
// arrangement must not reach inside one. Mirrors STACK_TYPES in canvas/elements/compose.ts.
const FLOW_TYPES = new Set(["container", "group", "card"]);

// Types that ARE their required field: without it the element paints an empty box wherever it sits,
// so these are held to it even inside a composite that may leave a slot blank on purpose.
const CARRIERS = new Set([
    "media",
    "image",
    "chart",
    "diagram",
    "table",
    "code",
    "button",
    "badge",
]);

function walkTree(
    el: ElementInstance,
    visit: (el: ElementInstance, inFlow: boolean) => void,
    inFlow = true,
): void {
    visit(el, inFlow);
    const kids = dataOf(el).children;
    if (!Array.isArray(kids)) return;
    const childrenInFlow = inFlow && FLOW_TYPES.has(el.type);
    for (const k of kids) if (isElement(k)) walkTree(k, visit, childrenInFlow);
}

const plural = (n: number, one: string, many: string): string => (n === 1 ? one : `${n} ${many}`);

/**
 * The column shares of a row. `rowShares` in canvas/elements/compose.ts reads the same field and
 * falls back to equal columns the moment ONE child is missing its share, so a half-annotated row is
 * a silent loss of the layout the model designed rather than an error anyone sees.
 */
function rowIssue(el: ElementInstance): string | null {
    const d = dataOf(el);
    if (d.direction !== "row") return null;
    const kids = Array.isArray(d.children) ? d.children.filter(isElement) : [];
    if (kids.length < 2) return null;
    const pcts = kids.map((k) => {
        const w = k.layout?.width;
        return w && typeof w === "object" ? w.pct : null;
    });
    // A row is only as tall as the children that size to their content, so if every one of them
    // asks to stretch there is no height to stretch into and the whole row measures zero. Verified
    // against the engine rather than read off the type: two filling columns paint nothing at all.
    if (kids.every((k) => k.layout?.height === "fill"))
        return 'a row where every column carries layout.height "fill", which collapses it to nothing: leave it off the tallest column so the row has a height to share';
    const given = pcts.filter((p): p is number => typeof p === "number");
    if (!given.length) return null; // no shares at all is fine: the row splits evenly
    if (given.length !== kids.length)
        return `a row where only ${given.length} of ${kids.length} columns carry layout.width.pct, so the whole row falls back to equal columns: give every column its share, or none of them`;
    const sum = given.reduce((a, b) => a + b, 0);
    return Math.abs(sum - 100) > 5
        ? `a row whose column shares add up to ${Math.round(sum)} rather than 100`
        : null;
}

/**
 * Everything decidable from the tree alone: a type we cannot render, a container with nothing in it,
 * a required field that never arrived, and the two layout slips that read as broken.
 *
 * Reported by kind and count rather than by path, because the writer never sees its previous JSON:
 * "an image with no src" is something it can act on, "root/1/0" is not.
 */
interface Found {
    unknown: Set<string>;
    missing: Map<string, number>;
    rows: Set<string>;
    raggedTables: number;
    emptyContainers: number;
    h1s: number;
}

function scan(section: Section): Found {
    const f: Found = {
        unknown: new Set(),
        missing: new Map(),
        rows: new Set(),
        raggedTables: 0,
        emptyContainers: 0,
        h1s: 0,
    };
    walkTree(section.root, (el, inFlow) => {
        const spec = SPEC.get(ALIASES[el.type] ?? el.type);
        if (!spec) {
            if (!NESTED.has(el.type)) f.unknown.add(el.type);
            return; // nothing to hold an undeclared element to
        }
        const data = dataOf(el);
        // A stat's value is an h1 because the catalog says so, and three stats in a row is the
        // corpus's most common shape; only a headline the model placed itself is counted.
        if (inFlow && el.type === "text" && data.style === "h1") f.h1s += 1;

        const row = rowIssue(el);
        if (row) f.rows.add(row);

        // cells split on commas, so a "2,720" thousands separator silently misaligns every column
        if (el.type === "table" && typeof data.data === "string") {
            const rows = (data.data as string).split("\n").filter((r) => r.trim() !== "");
            const cols = rows[0]?.split(",").length ?? 0;
            if (cols > 1 && rows.some((r) => r.split(",").length !== cols)) f.raggedTables += 1;
        }

        if (spec.container && !filled(data.children)) {
            f.emptyContainers += 1;
            return; // its missing children ARE the missing required field
        }
        // Inside a composite, a blank slot can be the author's answer: a pull quote with no
        // attribution leaves its caption empty rather than inventing one.
        if (!inFlow && !CARRIERS.has(el.type)) return;
        for (const field of spec.fields) {
            if (!field.required || field.default !== undefined) continue;
            if (filled(data[field.key])) continue;
            const key = `${spec.type}.${field.key}`;
            f.missing.set(key, (f.missing.get(key) ?? 0) + 1);
        }
    });
    return f;
}

/**
 * The faults any section has, whoever wrote it: an element that paints nothing, and a row the solver
 * cannot lay out the way it was written. A hand-built template is held to exactly this much, since
 * the rules below it are about what the MODEL was taught rather than about what renders.
 */
export function renderIssues(section: Section): string[] {
    const f = scan(section);
    const issues: string[] = [];
    if (f.emptyContainers)
        issues.push(
            `${plural(f.emptyContainers, "a container", "containers")} with no children, which renders as an empty box: fill it or drop it`,
        );
    for (const [key, n] of f.missing) {
        const [type, field] = key.split(".");
        issues.push(
            `${plural(n, `a \`${type}\``, `\`${type}\` elements`)} with no \`${field}\`, so nothing renders there`,
        );
    }
    if (f.raggedTables)
        issues.push(
            `${plural(f.raggedTables, "a table", "tables")} whose rows disagree with the header's column count: cells split on commas, so a comma inside a cell (a thousands separator like "2,720") breaks the grid. Write "2720", and join a label to a value with a middot`,
        );
    issues.push(...f.rows);
    return issues;
}

/** Everything above, plus the two rules only a model reply is held to: its vocabulary and its h1. */
export function structureIssues(section: Section): string[] {
    const f = scan(section);
    const issues: string[] = [];
    // Not "cannot render": the registry holds 65 types and the catalog names the 24 the model
    // writes, so an undeclared one may well paint. What we cannot tell from here is which, and an
    // invented type paints the error box, so the vocabulary is the line. A hand-built template
    // reaching for a registered internal (avatar) is not making that mistake, which is why this
    // rule sits here rather than in renderIssues.
    if (f.unknown.size)
        issues.push(
            `${plural(f.unknown.size, "an element type", "element types")} outside the catalog (${[...f.unknown].join(", ")}): use only the types it lists, an invented one renders as an error box`,
        );
    issues.push(...renderIssues(section));
    if (f.h1s > 1)
        issues.push(`${f.h1s} h1 headlines in one section; exactly one carries the section`);
    return issues;
}

export function checkSection(section: Section, surface: string): SectionCheck {
    // structure first: an element that cannot render is a harder failure than a thin one, and the
    // note reads better when the concrete faults lead
    const issues: string[] = [...structureIssues(section)];

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
