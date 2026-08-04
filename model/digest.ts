import type { ArtifactDigest, Cover, SectionSummary } from "@model/artifact";

// Read-only derivations over a stored content tree: the library cover, the section filmstrip, and the
// flat text the search index is built from. Runs against `artifacts.draft_content` as it comes out of
// jsonb, so every shape here is optional — a row may have been written by any past version.

interface RawEl {
    type?: string;
    data?: Record<string, unknown>;
}
interface RawSection {
    id?: string;
    background?: { image?: string };
    root?: RawEl;
}
interface RawDraft {
    background?: { image?: string };
    sections?: RawSection[];
}

const asDraft = (draft: unknown): RawDraft =>
    draft !== null && typeof draft === "object" ? (draft as RawDraft) : {};

const isEl = (v: unknown): v is RawEl =>
    v !== null && typeof v === "object" && typeof (v as RawEl).type === "string";

// children (groups, cards…) and cells (table) both hold nested elements
const nestedOf = (el: RawEl): RawEl[] => {
    const out: RawEl[] = [];
    for (const v of Object.values(el.data ?? {}))
        if (Array.isArray(v)) for (const item of v) if (isEl(item)) out.push(item);
    return out;
};

export function walkContent(el: RawEl | undefined, visit: (el: RawEl) => void): void {
    if (!el || typeof el !== "object") return;
    visit(el);
    for (const kid of nestedOf(el)) walkContent(kid, visit);
}

export function artifactCover(draft: unknown): Cover {
    const d = asDraft(draft);
    const sec = d.sections?.[0];
    if (!sec) return {};
    const texts: { style?: string; text?: string }[] = [];
    let image = d.background?.image ?? sec.background?.image;
    walkContent(sec.root, (el) => {
        const data = el.data;
        if (!data) return;
        if (el.type === "text") texts.push({ style: str(data.style), text: str(data.text) });
        if (el.type === "image" && !image) image = str(data.src);
    });
    const find = (...styles: string[]): string | undefined =>
        texts.find((t) => t.style && styles.includes(t.style))?.text;
    return {
        eyebrow: find("label"),
        title: find("h1", "h2", "h3"),
        sub: find("subtitle", "body", "caption"),
        image,
    };
}

export function artifactSections(draft: unknown): SectionSummary[] {
    return (asDraft(draft).sections ?? []).map((sec, idx) => {
        let title: string | undefined;
        const kinds = new Set<string>();
        walkContent(sec.root, (el) => {
            const data = el.data;
            if (el.type === "text" && data) {
                const style = str(data.style);
                const text = str(data.text);
                if (text && !title && style && !["label", "caption"].includes(style)) title = text;
            }
            if (el.type && !["text", "group", "card"].includes(el.type)) kinds.add(el.type);
        });
        let kind = "cover";
        if (idx > 0) {
            kind = "content";
            if (kinds.has("chart")) kind = "chart";
            else if (kinds.has("table")) kind = "table";
            else if (kinds.has("diagram")) kind = "diagram";
            else if (
                kinds.has("image") ||
                kinds.has("video") ||
                kinds.has("embed") ||
                sec.background?.image
            )
                kind = "media";
            else if (kinds.has("stat")) kind = "stat";
            else if (kinds.has("quote")) kind = "quote";
        }
        // size feeds the height a windowed client reserves before the section itself arrives
        return { title: title?.slice(0, 64), kind, id: sec.id, size: byteLength(sec) };
    });
}

const byteLength = (sec: RawSection): number => {
    try {
        return JSON.stringify(sec)?.length ?? 0;
    } catch {
        return 0; // a cyclic or unserializable row shouldn't take the digest down with it
    }
};

/** Both list-facing derivations in one pass; stored in `artifacts.digest` on every write. */
export const artifactDigest = (draft: unknown): ArtifactDigest => ({
    cover: artifactCover(draft),
    sections: artifactSections(draft),
});

const str = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);

// keys whose values are ids/enums/paints, never prose — indexing them would match every artifact
const NOISE_KEYS = new Set([
    "align",
    "color",
    "colors",
    "direction",
    "fit",
    "flow",
    "font",
    "fontId",
    "format",
    "gradient",
    "href",
    "icon",
    "iconId",
    "id",
    "image",
    "kind",
    "layout",
    "marker",
    "mime",
    "palette",
    "provider",
    "radius",
    "shape",
    "size",
    "src",
    "style",
    "theme",
    "tone",
    "type",
    "url",
    "variant",
    "weight",
]);

const NOISE_VALUE = /^(#[0-9a-f]{3,8}$|https?:\/\/|data:|blob:|asset:|\/api\/)/i;
const BLOB = 200; // a long unbroken run is a token/base64 payload, not a sentence

/** Cap on the indexed text per artifact; a tsvector is hard-limited to 1MB. */
export const SEARCH_TEXT_LIMIT = 100_000;

function collect(value: unknown, key: string | null, push: (s: string) => void): void {
    if (typeof value === "string") {
        if (key !== null && NOISE_KEYS.has(key)) return;
        const s = value.trim();
        if (!s || NOISE_VALUE.test(s)) return;
        if (s.length > BLOB && !/\s/.test(s)) return;
        push(s);
        return;
    }
    if (Array.isArray(value)) {
        for (const v of value) collect(v, key, push);
        return;
    }
    if (value !== null && typeof value === "object")
        for (const [k, v] of Object.entries(value)) collect(v, k, push);
}

/** Every prose string in the tree, section-blocks separated by a blank line so snippets never span two. */
export function artifactSearchText(draft: unknown): string {
    const blocks: string[] = [];
    let len = 0;
    for (const sec of asDraft(draft).sections ?? []) {
        const seen = new Set<string>();
        const parts: string[] = [];
        collect(sec.root, null, (s) => {
            if (seen.has(s)) return;
            seen.add(s);
            parts.push(s);
        });
        if (!parts.length) continue;
        const block = parts.join(" ");
        blocks.push(block);
        len += block.length + 2;
        if (len >= SEARCH_TEXT_LIMIT) break;
    }
    return blocks.join("\n\n").slice(0, SEARCH_TEXT_LIMIT);
}
