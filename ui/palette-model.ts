import type { JSX } from "solid-js";
import { createSignal } from "solid-js";
import { rankItems } from "./fuzzy";
import { GROUP_LABEL, GROUP_ORDER, type CommandGroup, type KeyCtx, type PaletteItem } from "./keys";

// A matched excerpt with [start, end) ranges to highlight; structurally the wire `SearchSnippet`.
export interface PaletteSnippet {
    text: string;
    marks: [number, number][];
}

export interface Row extends PaletteItem {
    group?: CommandGroup;
    slash?: string; // "/generate" — how this row is reached in command mode, and shown on it
    hintIcon?: string; // shared-Icon name shown instead of the text hint (glyph-rendered keys)
    subtitle?: string;
    meta?: string; // right-aligned trailing text (timestamps)
    snippet?: PaletteSnippet | null;
    thumb?: () => JSX.Element; // render prop: @ui never learns what an artifact looks like
    altRun?: (ctx: KeyCtx) => void | Promise<void>; // ⌘↵ variant (open in a new tab)
    altLabel?: string; // what ⌘↵ does on this row, for the footer
}

/** A snippet split into plain and highlighted runs, in order. */
export function snippetRuns(snippet: PaletteSnippet): { text: string; hit: boolean }[] {
    const runs: { text: string; hit: boolean }[] = [];
    let at = 0;
    for (const [start, end] of snippet.marks) {
        if (start < at || end > snippet.text.length || end <= start) continue;
        if (start > at) runs.push({ text: snippet.text.slice(at, start), hit: false });
        runs.push({ text: snippet.text.slice(start, end), hit: true });
        at = end;
    }
    if (at < snippet.text.length) runs.push({ text: snippet.text.slice(at), hit: false });
    return runs;
}

export const haystack = (r: Row): string =>
    `${r.title} ${r.slash ?? ""} ${(r.keywords ?? []).join(" ")}`;

export interface PaletteSection {
    id: string;
    label: string;
    order: number; // ascending; commands sit at 100 so sources land above them
}

/** Rows merged into the list: `local` runs per keystroke, `remote` is debounced and replaces it. */
export interface PaletteSource {
    id: string;
    section: PaletteSection;
    local?: (query: string, ctx: KeyCtx) => Row[];
    remote?: (query: string, ctx: KeyCtx, signal: AbortSignal) => Promise<Row[]>;
    minQuery?: number; // characters before `remote` fires (default 1; 0 also fires on an empty query)
    when?: (ctx: KeyCtx) => boolean;
}

export const COMMANDS_SECTION: PaletteSection = { id: "commands", label: "Commands", order: 100 };

const sources = new Map<string, PaletteSource>();
const [sourceTick, setSourceTick] = createSignal(0);
export { sourceTick };

export function registerPaletteSource(source: PaletteSource): void {
    sources.set(source.id, source);
    setSourceTick((n) => n + 1);
}

export function listPaletteSources(ctx: KeyCtx): PaletteSource[] {
    sourceTick();
    return [...sources.values()].filter((s) => !s.when || s.when(ctx));
}

/** Test/HMR helper: wipe the source registry. */
export function _resetPaletteSources(): void {
    sources.clear();
    setSourceTick((n) => n + 1);
}

export interface Bucket {
    section: PaletteSection;
    rows: Row[];
}

export interface DisplayRow {
    row: Row;
    header?: string;
}

const withHeaders = (label: string, rows: Row[]): DisplayRow[] =>
    rows.map((row, i) => ({ row, header: i === 0 ? label : undefined }));

/** Recently-run commands kept on the landing list; the rest are a "/" away. */
const RECENT_KEPT = 3;

export interface DisplayOpts {
    commands: Row[];
    query: string; // the term, with any "/" prefix already stripped
    atRoot: boolean;
    recentIds: string[];
    buckets?: Bucket[];
    /** "/" mode: the full command catalog, browsable and filterable, and nothing else. */
    commandMode?: boolean;
}

/** The flat, header-annotated list the palette renders: landing, searching, or "/" command mode. */
export function paletteDisplay(o: DisplayOpts): DisplayRow[] {
    const q = o.query.trim();
    const commands = o.commands;
    if (!o.atRoot) return rankItems(q, commands, haystack).map((row) => ({ row }));

    const grouped = (): DisplayRow[] => {
        const out: DisplayRow[] = [];
        for (const g of GROUP_ORDER) {
            const inGroup = commands.filter((r) => r.group === g);
            if (inGroup.length) out.push(...withHeaders(GROUP_LABEL[g], inGroup));
        }
        return out;
    };
    const recent = (limit: number): Row[] =>
        o.recentIds
            .map((id) => commands.find((r) => r.id === id))
            .filter((r): r is Row => !!r)
            .slice(0, limit);

    if (o.commandMode) {
        if (q) return withHeaders(COMMANDS_SECTION.label, rankItems(q, commands, haystack));
        const rec = recent(RECENT_KEPT);
        return [...(rec.length ? withHeaders("Recent", rec) : []), ...grouped()];
    }

    const out: DisplayRow[] = [];
    for (const b of [...(o.buckets ?? [])].sort((a, b) => a.section.order - b.section.order))
        if (b.rows.length) out.push(...withHeaders(b.section.label, b.rows));

    if (q) {
        out.push(...withHeaders(COMMANDS_SECTION.label, rankItems(q, commands, haystack)));
        return out;
    }
    const rec = recent(RECENT_KEPT);
    if (rec.length) out.push(...withHeaders("Recent commands", rec));
    return out;
}
