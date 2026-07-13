import type { ElementInstance, Section, SectionBackground } from "@model/artifact";
import { LAYOUT_PRESETS, childrenRaw, colGroup, rowGroup } from "@model/section";
import { getElement } from "@elements/spec";
import { columnFractions, splitSection, stripWidth } from "@elements/ops";

export interface SectionLayout {
    id: string;
    label: string;
    group: "split" | "media";
    applies: (s: Section) => boolean; // whether to offer this preset for the section
    matches: (s: Section) => boolean; // the section is already in this layout (active-state)
    transform: (s: Section) => Section;
}

type Role = "media" | "content";

const roleOf = (inst: ElementInstance): Role =>
    getElement(inst.type)?.category === "media" ? "media" : "content";

// unwrap transparent `group` scaffolding down to real content elements
function flatten(inst: ElementInstance, out: ElementInstance[]): void {
    if (inst.type === "group") for (const k of childrenRaw(inst) ?? []) flatten(k, out);
    else out.push(inst);
}

// ordered, role-tagged, width-stripped block list — the lossless bridge every preset rebuilds from
export function sectionBlocks(section: Section): { role: Role; inst: ElementInstance }[] {
    const out: ElementInstance[] = [];
    flatten(section.root, out);
    return out.map((inst) => ({ role: roleOf(inst), inst: stripWidth(inst) }));
}

function partition(section: Section): { media: ElementInstance[]; content: ElementInstance[] } {
    const blocks = sectionBlocks(section);
    return {
        media: blocks.filter((b) => b.role === "media").map((b) => b.inst),
        content: blocks.filter((b) => b.role === "content").map((b) => b.inst),
    };
}

const stack = (kids: ElementInstance[]): ElementInstance =>
    kids.length === 1 ? kids[0]! : colGroup(kids);

const dirOf = (inst: ElementInstance): "row" | "col" | null =>
    inst.type === "group"
        ? (inst.data as { direction?: string }).direction === "row"
            ? "row"
            : "col"
        : null;

// a column's role: "media"/"content" if all its blocks agree, else "mixed"
function columnRole(inst: ElementInstance): Role | "mixed" {
    const out: ElementInstance[] = [];
    flatten(inst, out);
    if (!out.length) return "mixed";
    const first = roleOf(out[0]!);
    return out.every((i) => roleOf(i) === first) ? first : "mixed";
}

// a 2-child row/col whose columns carry roles `a` then `b`
function twoUp(section: Section, dir: "row" | "col", a: Role, b: Role): boolean {
    if (dirOf(section.root) !== dir) return false;
    const kids = childrenRaw(section.root) ?? [];
    return kids.length === 2 && columnRole(kids[0]!) === a && columnRole(kids[1]!) === b;
}

const imageSrc = (inst: ElementInstance): string | undefined =>
    inst.type === "image" ? (inst.data as { src?: string }).src || undefined : undefined;

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

export const SECTION_LAYOUTS: SectionLayout[] = [...splitPresets, ...mediaPresets];
