import type { Component, JSX } from "solid-js";
import { createMemo, createSignal, For, Index, onMount, Show } from "solid-js";
import type { ArtifactContent } from "@model/artifact";
import { api, type ContextItemMeta, type ContextSummary } from "@app/api";
import { Button, Chip, Eyebrow, IconButton, Spinner } from "@ui/button";
import { TextArea, TextField } from "@ui/inputs";
import { Icon } from "@ui/icons";
import { Markdown } from "@ui/markdown";
import { PreviewCanvas } from "@app/components/previews";
import { createAttachSources } from "@app/components/context-attach";
import { templatesOnce } from "@app/stores/templates";
import {
    addItem,
    contextList,
    contextsLoaded,
    createContext,
    deleteContext,
    loadContexts,
    loadItems,
    removeItem,
    resyncItem,
    updateContext,
} from "@app/stores/contexts";
import { reportError } from "@app/stores/errors";
import { extensionOf, readAttachment } from "@app/components/attachments";

const KIND: Record<ContextItemMeta["kind"], { label: string; icon: string }> = {
    file: { label: "file", icon: "doc" },
    link: { label: "link", icon: "link" },
    artifact: { label: "from your library", icon: "library" },
    template: { label: "template", icon: "templates" },
    text: { label: "pasted", icon: "text" },
};

const IMAGE_EXTS = ["png", "jpg", "jpeg", "webp"];
const SHEET_EXTS = ["csv", "tsv", "xlsx", "xlsm"];

// files differentiate by format; every other kind keeps its kind icon
const itemIcon = (item: ContextItemMeta): string => {
    if (item.kind !== "file") return KIND[item.kind].icon;
    const ext = extensionOf(item.title);
    if (ext === "pdf") return "filePdf";
    if (IMAGE_EXTS.includes(ext)) return "fileImage";
    if (SHEET_EXTS.includes(ext)) return "fileSheet";
    return "doc";
};

// a binary uploaded before originals were stored has only its extracted text to show
const missingOriginal = (item: ContextItemMeta): boolean =>
    item.kind === "file" &&
    !item.original &&
    (extensionOf(item.title) === "pdf" || IMAGE_EXTS.includes(extensionOf(item.title)));

const day = (iso: string): string =>
    new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });

const hostOf = (ref: string): string => {
    try {
        return new URL(ref).hostname;
    } catch {
        return ref;
    }
};

const URL_RE = /^https?:\/\/\S+$/;

// ——— the snapshot viewer's shapes: the original, in its format's reading view ———

type Snapshot =
    | { view: "sections"; content: ArtifactContent }
    | { view: "markdown"; body: string }
    | { view: "table"; rows: string[][] }
    | { view: "prose"; body: string }
    | { view: "pdf"; url: string }
    | { view: "image"; url: string; title: string };

const TABLE_ROW_CAP = 60;

// quote-aware enough for a reading view: handles quoted fields and "" escapes
function parseDelimited(body: string, sep: string): string[][] {
    const rows: string[][] = [];
    for (const line of body.split("\n")) {
        if (!line.trim()) continue;
        const cells: string[] = [];
        let cur = "";
        let quoted = false;
        for (let i = 0; i < line.length; i++) {
            const ch = line[i]!;
            if (quoted && ch === '"' && line[i + 1] === '"') {
                cur += '"';
                i++;
            } else if (ch === '"') quoted = !quoted;
            else if (ch === sep && !quoted) {
                cells.push(cur);
                cur = "";
            } else cur += ch;
        }
        cells.push(cur);
        rows.push(cells);
        if (rows.length > TABLE_ROW_CAP) break;
    }
    return rows;
}

// ——— the sky: one star per chunk, one constellation per source. The sky zooms with its
// contents — a young context gets a few large, bright, line-joined stars pulled to the centre;
// as it fills, the stars shrink, the figure lines fade, and it becomes a dense field. ———

const GOLDEN = 2.39996; // radians; phyllotaxis keeps the layout deterministic — no randomness
const DOT_CAP = 48; // per constellation; the remainder is owned up to with a "+N" label

// alpha per constellation index, matching the row chips; the lit one reads full
const clusterAlpha = (i: number, lit: boolean): number =>
    lit ? 1 : Math.max(0.3, 0.85 - i * 0.14);

interface SkyCluster {
    dots: { x: number; y: number }[];
    o: number;
    lit: boolean;
    overflow: number; // chunks beyond the dot cap
    labelX: number;
    labelY: number;
}

interface SkyScene {
    clusters: SkyCluster[];
    young: number; // 1 = a few chunks, 0 = grown; drives dot size and line strength
    dotR: number;
    lineO: number; // figure-line opacity factor, fades as the sky fills
}

function skyScene(
    clusters: number[],
    w: number,
    h: number,
    lit: number | null,
    off: number,
): SkyScene {
    const total = clusters.reduce((a, b) => a + b, 0);
    const young = Math.max(0, Math.min(1, 1 - total / 40));
    const dotR = 1.3 + 2.1 * young;
    const step = 3.2 + 6.5 * young;
    const cx = w * (0.5 + off);
    const cy = h * 0.54;
    // cluster centres land at cx ± spread·1.6, and each cluster's own dots reach further — clamp
    // the spread so the widest constellation still clears the nearest edge instead of clipping
    const maxShown = Math.min(clusters.length ? Math.max(...clusters) : 0, DOT_CAP);
    const reach = step * Math.sqrt(maxShown + 0.6) * 1.35 + 8;
    const spread = Math.min(
        Math.min(w, h * 2.2) * (0.36 - 0.16 * young),
        Math.max(0, (Math.min(cx, w - cx) - reach) / 1.6),
    );
    const scene = clusters.map((n, ci) => {
        const a = ci * GOLDEN + 0.9;
        const r = clusters.length === 1 ? 0 : spread * (0.45 + 0.55 * ((ci * 0.618) % 1));
        const gx = cx + Math.cos(a) * r * 1.6;
        const gy = cy + Math.sin(a) * r * 0.52;
        const shown = Math.min(n, DOT_CAP);
        const dots = Array.from({ length: shown }, (_, i) => {
            const da = i * GOLDEN;
            const dr = step * Math.sqrt(i + 0.6);
            return { x: gx + Math.cos(da) * dr * 1.35, y: gy + Math.sin(da) * dr * 0.8 };
        });
        const edge = dots[dots.length - 1] ?? { x: gx, y: gy };
        return {
            dots,
            o: clusterAlpha(ci, lit === ci),
            lit: lit === ci,
            overflow: n - shown,
            labelX: edge.x + 5,
            labelY: edge.y + 3,
        };
    });
    return { clusters: scene, young, dotR, lineO: 0.38 * young };
}

// Paints in the theme's accent; halos are the same marks at low opacity, so dark themes glow and
// light themes read as soft ink — no color of its own anywhere.
const Sky: Component<{
    clusters: number[];
    w: number;
    h: number;
    lit?: number | null;
    off?: number; // shift the sky off-center (fraction of width), for heroes with a legend
    fit?: "meet" | "slice"; // slice fills the box (heroes); meet letterboxes (cards)
    class?: string;
}> = (props) => {
    const scene = createMemo(() =>
        skyScene(props.clusters, props.w, props.h, props.lit ?? null, props.off ?? 0),
    );
    const s = (): number => Math.min(1.6, Math.max(1, props.w / 320)); // marks scale with the sky
    const dotR = (c: SkyCluster): number => (scene().dotR + (c.lit ? 0.4 : 0)) * s();
    return (
        <svg
            viewBox={`0 0 ${props.w} ${props.h}`}
            preserveAspectRatio={`xMidYMid ${props.fit ?? "meet"}`}
            class={`block w-full ${props.class ?? ""}`}
            style={{
                background:
                    "radial-gradient(ellipse at 50% 130%, color-mix(in srgb, var(--color-accent) 8%, transparent), transparent 65%)",
            }}
            aria-hidden="true"
        >
            <Show when={!props.clusters.length}>
                {/* an empty sky shows where the first star will land */}
                <circle
                    cx={props.w * (0.5 + (props.off ?? 0))}
                    cy={props.h * 0.54}
                    r={9 * s()}
                    class="fill-accent"
                    opacity={0.1}
                />
                <circle
                    cx={props.w * (0.5 + (props.off ?? 0))}
                    cy={props.h * 0.54}
                    r={2.4 * s()}
                    class="fill-accent"
                    opacity={0.3}
                />
            </Show>
            <Index each={scene().clusters}>
                {(c) => (
                    <>
                        {/* figure lines: drawn constellations while young, gone once dense */}
                        <Show when={scene().lineO > 0.04}>
                            <Index each={c().dots.slice(1)}>
                                {(d, i) => (
                                    <line
                                        x1={c().dots[i]!.x}
                                        y1={c().dots[i]!.y}
                                        x2={d().x}
                                        y2={d().y}
                                        class="stroke-accent"
                                        stroke-width={0.8 * s()}
                                        opacity={scene().lineO * c().o * (c().lit ? 1.4 : 1)}
                                    />
                                )}
                            </Index>
                        </Show>
                        <Index each={c().dots}>
                            {(d) => (
                                <>
                                    <circle
                                        cx={d().x}
                                        cy={d().y}
                                        r={dotR(c()) * (2.6 + 1.6 * scene().young)}
                                        class="fill-accent"
                                        opacity={c().o * 0.14}
                                    />
                                    <circle
                                        cx={d().x}
                                        cy={d().y}
                                        r={dotR(c())}
                                        class="fill-accent"
                                        opacity={c().o}
                                    />
                                </>
                            )}
                        </Index>
                        <Show when={c().overflow > 0}>
                            <text
                                x={c().labelX}
                                y={c().labelY}
                                class="fill-accent font-mono"
                                font-size={`${7.5 * s()}`}
                                opacity={c().o * 0.75}
                            >
                                {`+${c().overflow}`}
                            </text>
                        </Show>
                    </>
                )}
            </Index>
        </svg>
    );
};

const SnapshotView: Component<{ snap: Snapshot }> = (props) => {
    // safe under the `view` check each block sits behind
    const as = <V extends Snapshot["view"]>(): Extract<Snapshot, { view: V }> =>
        props.snap as Extract<Snapshot, { view: V }>;
    return (
        <>
            <Show when={props.snap.view === "sections"}>
                {/* the publish/preview renderer: the artifact in its own format at full width,
                    exactly as the editor paints it, minus the controls */}
                <div class="h-120">
                    <PreviewCanvas
                        content={as<"sections">().content}
                        format={() => as<"sections">().content.format}
                    />
                </div>
            </Show>
            <Show when={props.snap.view === "markdown"}>
                <Markdown text={as<"markdown">().body} class="px-4 py-3 text-[12.5px]" />
            </Show>
            <Show when={props.snap.view === "table"}>
                <div class="overflow-x-auto p-3">
                    <table class="w-full border-collapse text-[11.5px]">
                        <For each={as<"table">().rows}>
                            {(row, i) => (
                                <tr>
                                    <For each={row}>
                                        {(cell) => (
                                            <td
                                                class={`border border-line px-2 py-1 ${
                                                    i() === 0
                                                        ? "bg-canvas font-mono text-[9.5px] uppercase tracking-[0.06em] text-muted"
                                                        : "text-soft"
                                                }`}
                                            >
                                                {cell}
                                            </td>
                                        )}
                                    </For>
                                </tr>
                            )}
                        </For>
                    </table>
                </div>
            </Show>
            <Show when={props.snap.view === "prose"}>
                <p class="whitespace-pre-wrap px-4 py-3 text-[12.5px] leading-relaxed text-soft">
                    {as<"prose">().body || "Nothing readable was stored for this source."}
                </p>
            </Show>
            <Show when={props.snap.view === "pdf"}>
                {/* the browser's own PDF viewer, reading the stored original; the fragment strips
                    its toolbar and thumbnail rail so only the pages remain */}
                <iframe
                    src={`${as<"pdf">().url}#toolbar=0&navpanes=0&view=FitH`}
                    title="Source PDF"
                    class="h-120 w-full border-0 bg-canvas"
                />
            </Show>
            <Show when={props.snap.view === "image"}>
                <div class="bg-canvas p-3">
                    <img
                        src={as<"image">().url}
                        alt={as<"image">().title}
                        class="mx-auto max-w-full rounded-md border border-line"
                    />
                </div>
            </Show>
        </>
    );
};

// One context open: the sky is the hero — every source a cluster, hovering a row lights its stars.
const ContextDetail: Component<{ context: ContextSummary; onDeleted: () => void }> = (props) => {
    const [items, setItems] = createSignal<ContextItemMeta[]>([]);
    const [loading, setLoading] = createSignal(true);
    const [busy, setBusy] = createSignal(false);
    const [dropping, setDropping] = createSignal(false);
    const [lit, setLit] = createSignal<number | null>(null);
    const [syncing, setSyncing] = createSignal<string | null>(null);
    const [editingName, setEditingName] = createSignal(false);
    const [nameDraft, setNameDraft] = createSignal("");
    const [editingDesc, setEditingDesc] = createSignal(false);
    const [descDraft, setDescDraft] = createSignal("");
    const [reading, setReading] = createSignal<ContextItemMeta | null>(null);
    const [snapshot, setSnapshot] = createSignal<Snapshot | null>(null);

    const fetchBodyView = async (item: ContextItemMeta): Promise<Snapshot> => {
        const { body } = await api.getContextItemSnapshot(props.context.id, item.id);
        const ext = extensionOf(item.title);
        if (item.kind === "file" && (ext === "md" || ext === "markdown"))
            return { view: "markdown", body };
        if (item.kind === "file" && (ext === "csv" || ext === "tsv"))
            return { view: "table", rows: parseDelimited(body, ext === "tsv" ? "\t" : ",") };
        return { view: "prose", body };
    };

    const originalUrl = (item: ContextItemMeta): string =>
        `/api/contexts/${props.context.id}/items/${item.id}/original`;

    // artifacts and templates render as real sections; uploads with a stored original render as
    // the real file (the browser's PDF viewer, an image); everything else shows the extracted
    // text in its format's reading view. The chunked form stays the machine's private business.
    const fetchSnapshot = async (item: ContextItemMeta): Promise<Snapshot> => {
        try {
            if (item.kind === "artifact" && item.ref) {
                const { artifact } = await api.getArtifact(item.ref);
                return { view: "sections", content: artifact.draftContent };
            }
            if (item.kind === "template" && item.ref) {
                const tpl = (await templatesOnce()).find((t) => t.id === item.ref);
                if (tpl) return { view: "sections", content: tpl.content };
            }
            if (item.kind === "file" && item.original) {
                const ext = extensionOf(item.title);
                if (ext === "pdf") return { view: "pdf", url: originalUrl(item) };
                if (["png", "jpg", "jpeg", "webp"].includes(ext))
                    return { view: "image", url: originalUrl(item), title: item.title };
                // docx/xlsx have no in-browser renderer; their extracted text reads better
            }
            return await fetchBodyView(item);
        } catch {
            // e.g. the library piece was deleted since — fall back to the stored snapshot
            return fetchBodyView(item).catch(() => ({ view: "prose" as const, body: "" }));
        }
    };

    const toggleReading = (item: ContextItemMeta): void => {
        if (reading()?.id === item.id) {
            setReading(null);
            return;
        }
        setSnapshot(null);
        setReading(item);
        void fetchSnapshot(item).then(setSnapshot);
    };

    // the list is the live source; the prop is just the snapshot that opened the pane
    const ctx = (): ContextSummary =>
        contextList().find((c) => c.id === props.context.id) ?? props.context;

    const reload = async (): Promise<void> => {
        try {
            setItems(await loadItems(props.context.id));
        } finally {
            setLoading(false);
        }
    };
    onMount(() => void reload());

    const run = async (fn: () => Promise<unknown>): Promise<void> => {
        if (busy()) return;
        setBusy(true);
        try {
            await fn();
            await reload();
        } finally {
            setBusy(false);
        }
    };

    const addFiles = (files: FileList | null): void => {
        if (!files?.length) return;
        void run(async () => {
            for (const file of Array.from(files)) {
                const { attachment, error } = await readAttachment(file);
                if (error) reportError(new Error(error), error);
                if (attachment)
                    await addItem(props.context.id, {
                        kind: "file",
                        title: attachment.name,
                        body: attachment.text,
                        ...(attachment.original ? { original: attachment.original } : {}),
                    });
            }
        });
    };

    const addText = (text: string): void => {
        void run(() =>
            addItem(props.context.id, { kind: "text", title: "Pasted text", body: text }),
        );
    };

    const addLink = (target: string): void => {
        void run(() => addItem(props.context.id, { kind: "link", url: target }));
    };

    // the shared source flows, wired to permanent ingestion instead of one-off attachments
    const attach = createAttachSources({
        onFiles: addFiles,
        onPaste: addText,
        onLink: (target) => {
            addLink(target);
            return Promise.resolve(true);
        },
        onPick: (pick) =>
            void run(() =>
                addItem(
                    props.context.id,
                    pick.kind === "artifact"
                        ? { kind: "artifact", artifactId: pick.id }
                        : { kind: "template", templateId: pick.id },
                ),
            ),
        pastePlaceholder: "Paste the material this context should carry…",
        pasteLabel: "Add it",
        linkPlaceholder: "https://…  (fetched and snapshotted as text)",
    });

    // ⌘V anywhere in the pane: a URL becomes a link, files become files, anything else is pasted text
    const onPaste = (e: ClipboardEvent): void => {
        const target = e.target as HTMLElement | null;
        if (target?.closest("input, textarea")) return;
        if (e.clipboardData?.files.length) {
            e.preventDefault();
            addFiles(e.clipboardData.files);
            return;
        }
        const text = e.clipboardData?.getData("text/plain").trim();
        if (!text) return;
        e.preventDefault();
        if (URL_RE.test(text)) addLink(text);
        else addText(text);
    };

    const commitName = (): void => {
        setEditingName(false);
        const name = nameDraft().trim();
        if (name && name !== ctx().name) void updateContext(props.context.id, { name });
    };
    const commitDesc = (): void => {
        setEditingDesc(false);
        const description = descDraft().trim();
        if (description !== (ctx().description ?? ""))
            void updateContext(props.context.id, { description: description || null });
    };

    const totalChars = createMemo(() => items().reduce((n, i) => n + i.chars, 0));
    const totalChunks = createMemo(() => items().reduce((n, i) => n + i.chunks, 0));
    const clusters = createMemo(() => items().map((i) => i.chunks));

    const quickPill = (label: string, onClick: () => void): JSX.Element => (
        <button
            class="flex-none rounded-full border border-line px-3 py-1.5 font-mono text-[10px] text-soft transition-colors hover:border-accent hover:text-accent disabled:pointer-events-none disabled:opacity-40"
            disabled={busy()}
            onClick={onClick}
        >
            {label}
        </button>
    );

    return (
        <div
            class="w-full"
            onPaste={onPaste}
            onDragOver={(e) => {
                e.preventDefault();
                setDropping(true);
            }}
            onDragLeave={() => setDropping(false)}
            onDrop={(e) => {
                e.preventDefault();
                setDropping(false);
                addFiles(e.dataTransfer?.files ?? null);
            }}
        >
            {/* ——— the observatory: full-bleed sky, legend set into it ——— */}
            <div class="relative overflow-hidden border-b border-line bg-panel">
                <Sky
                    clusters={clusters()}
                    w={1100}
                    h={230}
                    off={0.18}
                    fit="slice"
                    lit={lit()}
                    class="h-52 md:h-56"
                />
                <div class="absolute left-5 top-1/2 max-w-[46%] -translate-y-1/2 md:left-9">
                    <Show
                        when={!editingName()}
                        fallback={
                            <TextField
                                compact
                                autofocus
                                value={nameDraft()}
                                onChange={setNameDraft}
                                onBlur={commitName}
                                onKeyDown={(e: KeyboardEvent) => {
                                    if (e.key === "Enter") commitName();
                                    if (e.key === "Escape") setEditingName(false);
                                }}
                            />
                        }
                    >
                        <button
                            class="block text-left"
                            title="Rename this context"
                            onClick={() => {
                                setNameDraft(ctx().name);
                                setEditingName(true);
                            }}
                        >
                            <h2
                                class="text-[24px] leading-tight text-ink md:text-[30px]"
                                style={{ "font-family": "var(--font-display)" }}
                            >
                                {ctx().name}
                            </h2>
                        </button>
                    </Show>
                    <Show
                        when={!editingDesc()}
                        fallback={
                            <TextArea
                                rows={2}
                                rounded="md"
                                autofocus
                                class="mt-1 bg-panel text-[12.5px]"
                                value={descDraft()}
                                onChange={setDescDraft}
                                onBlur={commitDesc}
                                onKeyDown={(e: KeyboardEvent) => {
                                    if (e.key === "Escape") setEditingDesc(false);
                                }}
                            />
                        }
                    >
                        <button
                            class="block text-left"
                            title="Describe what this context carries"
                            onClick={() => {
                                setDescDraft(ctx().description ?? "");
                                setEditingDesc(true);
                            }}
                        >
                            <p
                                class={`mt-1 text-[13px] italic leading-snug ${ctx().description ? "text-soft" : "text-muted"}`}
                                style={{ "font-family": "var(--font-display)" }}
                            >
                                {ctx().description ?? "Add a line about what this context carries…"}
                            </p>
                        </button>
                    </Show>
                    <div class="mt-3.5 flex items-center gap-1.5">
                        <Chip
                            variant="outline"
                            size="sm"
                            rounded="md"
                            title="Everyone in this workspace can use and edit it"
                        >
                            Shared · workspace
                        </Chip>
                        <IconButton
                            size="sm"
                            tone="danger"
                            rounded="md"
                            title="Delete this context"
                            onClick={() => {
                                void deleteContext(props.context.id);
                                props.onDeleted();
                            }}
                        >
                            <Icon name="trash" size={13} />
                        </IconButton>
                    </div>
                </div>
                <Show when={!loading() && !items().length}>
                    <p class="absolute bottom-4 right-5 font-mono text-[10.5px] text-muted md:right-9">
                        no stars yet. Everything you feed it becomes one
                    </p>
                </Show>
            </div>

            {/* ——— the stat strip: the observatory's instrument panel ——— */}
            <div class="flex divide-x divide-line border-b border-line bg-panel">
                <For
                    each={[
                        ["Sources", String(items().length)],
                        ["Chunks", String(totalChunks())],
                        ["Material", `${totalChars().toLocaleString()} ch`],
                        ["Updated", day(ctx().updatedAt)],
                    ]}
                >
                    {([label, value]) => (
                        <div class="flex-1 px-4 py-2.5 text-center md:px-6">
                            <div class="font-mono text-[8.5px] uppercase tracking-[0.14em] text-muted">
                                {label}
                            </div>
                            <div
                                class="mt-0.5 text-[19px] leading-tight text-ink"
                                style={{ "font-family": "var(--font-display)" }}
                            >
                                {value}
                            </div>
                        </div>
                    )}
                </For>
            </div>

            <div class="px-5 pb-8 pt-5 md:px-9">
                {/* ——— feeding ——— */}
                <div class="flex flex-wrap items-center gap-2">
                    <button
                        class="flex min-w-60 flex-1 cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed bg-panel px-4 py-2.5 text-left transition-colors disabled:pointer-events-none disabled:opacity-40"
                        classList={{
                            "border-accent": dropping(),
                            "border-line hover:border-accent": !dropping(),
                        }}
                        disabled={busy()}
                        onClick={() => attach.openFiles()}
                    >
                        <span class="flex-none text-accent">
                            <Show when={!busy()} fallback={<Spinner size={16} />}>
                                <Icon name="plus" size={16} />
                            </Show>
                        </span>
                        <span class="min-w-0 flex-1 text-[12.5px] text-soft">
                            <span class="font-semibold text-ink">Drop anything here</span>: files, a
                            pasted block, or a link
                        </span>
                        <span class="flex-none rounded-md border border-line px-1.5 py-0.5 font-mono text-[9px] text-muted">
                            ⌘V
                        </span>
                    </button>
                    {quickPill("paste", () => attach.openPaste())}
                    {quickPill("link", () => attach.openLink())}
                    {quickPill("artifact · template", () => attach.togglePick())}
                </div>

                <attach.Panels class="mt-3" />

                {/* ——— the sources, each one a cluster; click one to read its snapshot ——— */}
                <Show when={loading()}>
                    <div class="flex h-24 items-center justify-center">
                        <Spinner size={16} />
                    </div>
                </Show>
                <Show when={!loading() && items().length}>
                    <div
                        class="mt-3.5 grid items-start gap-4"
                        classList={{ "md:grid-cols-2": !!reading() }}
                    >
                        <div class="flex flex-col gap-2" onMouseLeave={() => setLit(null)}>
                            <For each={items()}>
                                {(item, i) => (
                                    <div
                                        class="group flex cursor-pointer items-center gap-3 rounded-xl border bg-panel px-3.5 py-2.5 transition-colors"
                                        classList={{
                                            "border-accent": reading()?.id === item.id,
                                            "border-accent/60":
                                                lit() === i() && reading()?.id !== item.id,
                                            "border-line":
                                                lit() !== i() && reading()?.id !== item.id,
                                        }}
                                        onMouseEnter={() => setLit(i())}
                                        onClick={() => toggleReading(item)}
                                    >
                                        <span
                                            class="grid size-7 flex-none place-items-center rounded-full bg-accent/10 text-accent"
                                            style={{
                                                opacity: Math.max(
                                                    0.55,
                                                    clusterAlpha(i(), lit() === i()),
                                                ),
                                            }}
                                        >
                                            <Icon name={itemIcon(item)} size={13} />
                                        </span>
                                        <span class="min-w-0 flex-1">
                                            <span class="block truncate text-[13px] font-semibold text-ink">
                                                {item.title}
                                            </span>
                                            <span class="block truncate font-mono text-[9.5px] tracking-[0.04em] text-muted">
                                                {KIND[item.kind].label}
                                                {item.kind === "link" && item.ref
                                                    ? ` · ${hostOf(item.ref)}`
                                                    : ""}
                                                {" · "}
                                                {item.chunks} chunk{item.chunks === 1 ? "" : "s"} ·{" "}
                                                {item.chars.toLocaleString()} ch ·{" "}
                                                {day(item.createdAt)}
                                            </span>
                                        </span>
                                        <span class="flex flex-none gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                                            <Show
                                                when={
                                                    item.kind === "link" ||
                                                    item.kind === "artifact" ||
                                                    item.kind === "template"
                                                }
                                            >
                                                <IconButton
                                                    size="sm"
                                                    tone="muted"
                                                    rounded="md"
                                                    title="Re-read from the source"
                                                    onClick={(e: MouseEvent) => {
                                                        e.stopPropagation();
                                                        setSyncing(item.id);
                                                        void resyncItem(props.context.id, item.id)
                                                            .then(() => reload())
                                                            .finally(() => setSyncing(null));
                                                    }}
                                                >
                                                    <Show
                                                        when={syncing() !== item.id}
                                                        fallback={<Spinner size={12} />}
                                                    >
                                                        <Icon name="refresh" size={12} />
                                                    </Show>
                                                </IconButton>
                                            </Show>
                                            <IconButton
                                                size="sm"
                                                tone="muted"
                                                rounded="md"
                                                title="Remove from this context"
                                                onClick={(e: MouseEvent) => {
                                                    e.stopPropagation();
                                                    if (reading()?.id === item.id) setReading(null);
                                                    void removeItem(props.context.id, item.id).then(
                                                        () => reload(),
                                                    );
                                                }}
                                            >
                                                <Icon name="close" size={12} />
                                            </IconButton>
                                        </span>
                                    </div>
                                )}
                            </For>
                        </div>

                        {/* the snapshot inspector: the stored text, split exactly as it was embedded */}
                        <Show when={reading()}>
                            {(item) => (
                                <div class="overflow-hidden rounded-xl border border-line bg-panel md:sticky md:top-4">
                                    <div class="flex items-center gap-2.5 border-b border-line px-3.5 py-2.5">
                                        <span class="grid size-7 flex-none place-items-center rounded-full bg-accent/10 text-accent">
                                            <Icon name={itemIcon(item())} size={13} />
                                        </span>
                                        <span class="min-w-0 flex-1">
                                            <span class="block truncate text-[13px] font-semibold text-ink">
                                                {item().title}
                                            </span>
                                            <span class="block truncate font-mono text-[9px] text-muted">
                                                <Show
                                                    when={item().kind === "link" && item().ref}
                                                    fallback={`${KIND[item().kind].label} · snapshotted ${day(item().createdAt)}`}
                                                >
                                                    <a
                                                        href={item().ref!}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        class="underline decoration-line underline-offset-2 hover:text-accent"
                                                    >
                                                        {hostOf(item().ref!)}
                                                    </a>
                                                    {` · snapshotted ${day(item().createdAt)}`}
                                                </Show>
                                            </span>
                                        </span>
                                        <IconButton
                                            size="sm"
                                            tone="muted"
                                            rounded="md"
                                            title="Close the snapshot"
                                            onClick={() => setReading(null)}
                                        >
                                            <Icon name="close" size={12} />
                                        </IconButton>
                                    </div>
                                    <Show when={missingOriginal(item())}>
                                        <p class="border-b border-line bg-canvas px-3.5 py-2 font-mono text-[9.5px] leading-relaxed text-muted">
                                            the source file wasn't stored for this item (added
                                            before file storage), showing its extracted text;
                                            re-attach the file to view it
                                        </p>
                                    </Show>
                                    <div class="max-h-120 overflow-y-auto">
                                        <Show
                                            when={snapshot()}
                                            fallback={
                                                <div class="flex h-16 items-center justify-center">
                                                    <Spinner size={14} />
                                                </div>
                                            }
                                        >
                                            {(snap) => <SnapshotView snap={snap()} />}
                                        </Show>
                                    </div>
                                </div>
                            )}
                        </Show>
                    </div>
                </Show>
            </div>
        </div>
    );
};

// Hosted inside the generate studio (the intake stays mounted underneath, prompt intact), so
// building a context is a detour within the flow rather than a separate destination.
export const ContextsPane: Component<{ onBack: () => void }> = (props) => {
    const [openId, setOpenId] = createSignal<string | null>(null);
    const [naming, setNaming] = createSignal(false);
    const [name, setName] = createSignal("");

    onMount(() => void loadContexts());

    const open = (): ContextSummary | undefined =>
        contextList().find((c) => c.id === openId()) ?? undefined;

    const totalSources = (): number => contextList().reduce((n, c) => n + c.items, 0);
    const totalChunksAll = (): number =>
        contextList().reduce((n, c) => n + c.clusters.reduce((a, b) => a + b, 0), 0);

    const create = (): void => {
        const n = name().trim();
        setName("");
        setNaming(false);
        if (!n) return;
        void createContext(n).then((id) => {
            if (id) setOpenId(id);
        });
    };

    return (
        <div class="flex h-full flex-col">
            <div class="flex flex-none items-center gap-2 border-b border-line px-4 py-2.5 md:px-6">
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => (openId() ? setOpenId(null) : props.onBack())}
                >
                    <Icon name="chevronLeft" size={13} /> Back
                </Button>
                <span class="text-[13.5px] font-semibold tracking-tight">
                    {open()?.name ?? "Contexts"}
                </span>
                <span class="font-mono text-[10px] text-muted">
                    {open() ? "shared with your workspace" : "what your generates draw from"}
                </span>
            </div>
            <div class="min-h-0 flex-1 overflow-y-auto">
                <Show
                    when={!open()}
                    fallback={<ContextDetail context={open()!} onDeleted={() => setOpenId(null)} />}
                >
                    <div class="w-full">
                        {/* masthead: the shelf opens like a page, not a widget */}
                        <div class="flex flex-wrap items-end justify-between gap-4 border-b border-line bg-panel px-5 pb-5 pt-6 md:px-9">
                            <div class="min-w-0">
                                <Eyebrow tracking="widest" as="div">
                                    Workspace memory
                                </Eyebrow>
                                <h2
                                    class="mt-1 text-[28px] leading-tight text-ink"
                                    style={{ "font-family": "var(--font-display)" }}
                                >
                                    Contexts
                                </h2>
                                <p class="mt-1 max-w-lg text-[12.5px] leading-relaxed text-soft">
                                    Every star is a chunk Galleo has read; every constellation is a
                                    source. Attach one from the + menu and your generates quote the
                                    real thing.
                                </p>
                            </div>
                            <div class="flex-none text-right font-mono text-[9.5px] uppercase leading-relaxed tracking-[0.1em] text-muted">
                                <span class="block">
                                    {contextList().length} context
                                    {contextList().length === 1 ? "" : "s"} ·{" "}
                                    <span class="text-soft">{totalSources()} sources</span>
                                </span>
                                <span class="block">
                                    <span class="text-soft">{totalChunksAll()} chunks</span> in the
                                    sky
                                </span>
                            </div>
                        </div>

                        {/* poster rows: each context claims the full width */}
                        <For each={contextList()}>
                            {(ctx) => (
                                <button
                                    class="group grid w-full grid-cols-[7rem_minmax(0,1fr)_auto] items-center border-b border-line bg-panel text-left transition-colors hover:bg-canvas md:grid-cols-[17.5rem_minmax(0,1fr)_auto]"
                                    onClick={() => setOpenId(ctx.id)}
                                >
                                    <Sky
                                        clusters={ctx.clusters}
                                        w={280}
                                        h={118}
                                        fit="slice"
                                        class="h-24 md:h-29"
                                    />
                                    <span class="min-w-0 py-4 pr-4">
                                        <span
                                            class="block truncate text-[19px] leading-tight text-ink transition-colors group-hover:text-accent md:text-[22px]"
                                            style={{ "font-family": "var(--font-display)" }}
                                        >
                                            {ctx.name}
                                        </span>
                                        <span
                                            class={`mt-0.5 line-clamp-2 text-[12.5px] italic leading-snug ${ctx.description ? "text-soft" : "text-muted"}`}
                                            style={{ "font-family": "var(--font-display)" }}
                                        >
                                            {ctx.description ?? "No description yet."}
                                        </span>
                                    </span>
                                    <span class="flex-none px-5 py-4 text-right font-mono text-[9.5px] leading-relaxed text-muted md:px-9">
                                        <span class="block tabular-nums text-soft">
                                            {ctx.items
                                                ? `${ctx.items} source${ctx.items === 1 ? "" : "s"} · ${ctx.clusters.reduce((n, c) => n + c, 0)} chunks`
                                                : "dark sky"}
                                        </span>
                                        <span class="block">updated {day(ctx.updatedAt)}</span>
                                    </span>
                                </button>
                            )}
                        </For>

                        {/* the seed line closes the shelf */}
                        <Show
                            when={naming()}
                            fallback={
                                <button
                                    class="group flex w-full items-center gap-3 px-5 py-4 text-left transition-colors hover:text-accent md:px-9"
                                    onClick={() => setNaming(true)}
                                >
                                    <span class="grid size-6.5 flex-none place-items-center rounded-md border-2 border-dashed border-line text-accent transition-colors group-hover:border-accent">
                                        <Icon name="plus" size={13} />
                                    </span>
                                    <span class="text-[13px] font-semibold text-ink transition-colors group-hover:text-accent">
                                        Seed a new context
                                    </span>
                                    <span class="font-mono text-[9.5px] text-muted">
                                        it grows a star per chunk you feed it
                                    </span>
                                </button>
                            }
                        >
                            <div class="flex max-w-130 items-center gap-1.5 px-5 py-3.5 md:px-9">
                                <TextField
                                    compact
                                    autofocus
                                    value={name()}
                                    placeholder="“Q3 board pack”, “Brand voice”…"
                                    onChange={setName}
                                    onKeyDown={(e: KeyboardEvent) => {
                                        if (e.key === "Enter") create();
                                        if (e.key === "Escape") setNaming(false);
                                    }}
                                />
                                <Button
                                    variant="outline"
                                    size="sm"
                                    class="flex-none"
                                    onClick={create}
                                >
                                    Create
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    class="flex-none"
                                    onClick={() => setNaming(false)}
                                >
                                    Cancel
                                </Button>
                            </div>
                        </Show>
                        <Show when={contextsLoaded() && !contextList().length}>
                            <p class="max-w-md px-5 pb-8 text-[12.5px] leading-relaxed text-muted md:px-9">
                                Nothing here yet. A context is remembered material your whole
                                workspace can attach to any generate.{" "}
                                <span class="font-mono text-[10.5px] text-soft">
                                    Seed the first one above.
                                </span>
                            </p>
                        </Show>
                    </div>
                </Show>
            </div>
        </div>
    );
};
