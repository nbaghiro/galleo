import type { ElementInstance, Section, SectionBackground } from "@model/artifact";
import { LAYOUT_PRESETS, childrenRaw, colGroup, rowGroup } from "@model/section";
import { getElement } from "@elements/spec";
import { columnFractions, splitSection, stripWidth } from "@elements/ops";

// Section layout presets — curated, one-click arrangements over the recursive section tree. Each is a PURE
// `(section) => Section` transform built ONLY from the @model/section builders (rowGroup/colGroup/withWidth),
// so it yields an ordinary section the engine + renderer already handle: no engine changes, no new node
// types, no stored "layout mode" (the arrangement IS the tree). The editor renders the applicable presets as
// live thumbnails of `transform(section)` and commits the chosen one. Two families: structural SPLITS
// (column count + widths, role-agnostic) and role-aware MEDIA layouts (place the image against the text).

export interface SectionLayout {
    id: string;
    label: string;
    group: "split" | "media";
    applies: (s: Section) => boolean; // whether to offer this preset for the section
    matches: (s: Section) => boolean; // the section is already in this layout (active-state)
    transform: (s: Section) => Section; // the reflow
}

// --- the canonical block view: flatten top-level content, tagging each block's role ---

type Role = "media" | "content";

const roleOf = (inst: ElementInstance): Role =>
    getElement(inst.type)?.category === "media" ? "media" : "content";

// Unwrap the transparent `group` scaffolding (rows/cols/stacks) down to the real content elements.
function flatten(inst: ElementInstance, out: ElementInstance[]): void {
    if (inst.type === "group") for (const k of childrenRaw(inst) ?? []) flatten(k, out);
    else out.push(inst);
}

// The section's content as an ordered, role-tagged, width-stripped list — the bridge every preset rebuilds
// from, so switching presets is lossless and role-aware regardless of the current arrangement.
export function sectionBlocks(section: Section): { role: Role; inst: ElementInstance }[] {
    const out: ElementInstance[] = [];
    flatten(section.root, out);
    return out.map((inst) => ({ role: roleOf(inst), inst: stripWidth(inst) }));
}

// The blocks partitioned into media vs. everything else, in document order.
function partition(section: Section): { media: ElementInstance[]; content: ElementInstance[] } {
    const blocks = sectionBlocks(section);
    return {
        media: blocks.filter((b) => b.role === "media").map((b) => b.inst),
        content: blocks.filter((b) => b.role === "content").map((b) => b.inst),
    };
}

// A column holding `kids`: the lone element itself, else a vertical stack.
const stack = (kids: ElementInstance[]): ElementInstance =>
    kids.length === 1 ? kids[0]! : colGroup(kids);

// --- structural inspection for `matches` ---

const dirOf = (inst: ElementInstance): "row" | "col" | null =>
    inst.type === "group"
        ? (inst.data as { direction?: string }).direction === "row"
            ? "row"
            : "col"
        : null;

// The role of a whole column: "media"/"content" if all its blocks agree, else "mixed".
function columnRole(inst: ElementInstance): Role | "mixed" {
    const out: ElementInstance[] = [];
    flatten(inst, out);
    if (!out.length) return "mixed";
    const first = roleOf(out[0]!);
    return out.every((i) => roleOf(i) === first) ? first : "mixed";
}

// A 2-child row/col whose columns carry roles `a` then `b` (image-left / -right / -top matches).
function twoUp(section: Section, dir: "row" | "col", a: Role, b: Role): boolean {
    if (dirOf(section.root) !== dir) return false;
    const kids = childrenRaw(section.root) ?? [];
    return kids.length === 2 && columnRole(kids[0]!) === a && columnRole(kids[1]!) === b;
}

const imageSrc = (inst: ElementInstance): string | undefined =>
    inst.type === "image" ? (inst.data as { src?: string }).src || undefined : undefined;

// --- split presets (structural, role-agnostic) ---

const SPLIT_LABELS: Record<string, string> = {
    full: "Full",
    "split-6040": "60 / 40",
    "split-4060": "40 / 60",
    "two-col": "Two columns",
    "three-up": "Three up",
};

const fractionsMatch = (a: number[], b: number[]): boolean =>
    a.length === b.length && a.every((v, i) => Math.abs(v - (b[i] ?? 0)) < 0.02);

const splitPresets: SectionLayout[] = Object.entries(LAYOUT_PRESETS).map(
    ([id, fr]): SectionLayout => ({
        id,
        label: SPLIT_LABELS[id] ?? id,
        group: "split",
        applies: () => true, // splits pad/merge, so any section can adopt any column count
        matches: (s) => fractionsMatch(columnFractions(s), fr),
        transform: (s) => splitSection(s, fr),
    }),
);

// --- media presets (role-aware; offered only when the section has both an image and other content) ---

const hasMediaAndContent = (s: Section): boolean => {
    const b = sectionBlocks(s);
    return b.some((x) => x.role === "media") && b.some((x) => x.role === "content");
};

const mediaPresets: SectionLayout[] = [
    {
        id: "media-right",
        label: "Image right",
        group: "media",
        applies: hasMediaAndContent,
        matches: (s) => twoUp(s, "row", "content", "media"),
        transform: (s) => {
            const { media, content } = partition(s);
            return { ...s, root: rowGroup([stack(content), stack(media)], [0.6, 0.4]) };
        },
    },
    {
        id: "media-left",
        label: "Image left",
        group: "media",
        applies: hasMediaAndContent,
        matches: (s) => twoUp(s, "row", "media", "content"),
        transform: (s) => {
            const { media, content } = partition(s);
            return { ...s, root: rowGroup([stack(media), stack(content)], [0.4, 0.6]) };
        },
    },
    {
        id: "media-top",
        label: "Image top",
        group: "media",
        applies: hasMediaAndContent,
        matches: (s) => twoUp(s, "col", "media", "content"),
        transform: (s) => {
            const { media, content } = partition(s);
            return { ...s, root: colGroup([stack(media), stack(content)]) };
        },
    },
    {
        id: "media-bleed",
        label: "Full-bleed image",
        group: "media",
        // Needs a real image (with a src) to move into the background, plus content to overlay.
        applies: (s) => {
            const b = sectionBlocks(s);
            return b.some((x) => imageSrc(x.inst)) && b.some((x) => x.role === "content");
        },
        matches: (s) => s.background?.kind === "image" && s.bleed === true,
        transform: (s) => {
            const { media, content } = partition(s);
            const bg = media.find((m) => imageSrc(m));
            const rest = media.filter((m) => m !== bg);
            const background: SectionBackground = {
                ...(s.background ?? { kind: "none" }),
                kind: "image",
                image: bg ? imageSrc(bg) : undefined,
                scrim: s.background?.scrim ?? 0.4,
            };
            return { ...s, bleed: true, background, root: stack([...content, ...rest]) };
        },
    },
];

// The full registry — the editor lists these, filters by `applies`, previews each `transform(section)`, and
// rings the one that `matches`. Split presets first, then media.
export const SECTION_LAYOUTS: SectionLayout[] = [...splitPresets, ...mediaPresets];
