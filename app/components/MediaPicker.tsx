import type { Component, JSX } from "solid-js";
import {
    createEffect,
    createSignal,
    For,
    Match,
    on,
    onCleanup,
    onMount,
    Show,
    Switch,
} from "solid-js";
import type { IconItem, MediaGenStyle, MediaItem, MediaKind, MediaProvider } from "@model/media";
import { MEDIA_ASPECTS, MEDIA_GEN_STYLES } from "@model/media";
import { editorTokens } from "@editor/editor";
import { api, streamGenerateMedia, type MediaProvidersState } from "../api";
import { closeMediaPicker, mediaRequest, pickMedia, pickMediaIcon } from "../stores/media";
import { overlayThemeVars } from "../stores/theme";
import { CloseIcon, SparkleIcon } from "@ui/icons";
import { Modal } from "@ui/overlay";
import { Button, Chip, Eyebrow, IconButton } from "@ui/button";
import { TextArea, TextField } from "@ui/inputs";

type Source = "recent" | "upload" | MediaProvider | "generate" | "icons";
const STOCK: MediaProvider[] = ["openverse", "unsplash", "pexels", "pixabay"];

const KIND_TITLE: Record<MediaKind, string> = {
    photo: "Add an image",
    gif: "Add a GIF",
    illustration: "Add an illustration",
    sticker: "Add a sticker",
    icon: "Add an icon",
};
const KIND_NOUN: Record<MediaKind, string> = {
    photo: "photos",
    gif: "GIFs",
    illustration: "illustrations",
    sticker: "stickers",
    icon: "icons",
};

const DEFAULT_QUERY: Record<MediaKind, string> = {
    photo: "nature",
    gif: "abstract",
    illustration: "abstract",
    sticker: "emoji",
    icon: "",
};

const STARTER_ICONS = [
    "lucide:home",
    "lucide:search",
    "lucide:user",
    "lucide:settings",
    "lucide:heart",
    "lucide:star",
    "lucide:bell",
    "lucide:mail",
    "lucide:calendar",
    "lucide:clock",
    "lucide:map-pin",
    "lucide:phone",
    "lucide:camera",
    "lucide:image",
    "lucide:folder",
    "lucide:file",
    "lucide:download",
    "lucide:upload",
    "lucide:trash-2",
    "lucide:pencil",
    "lucide:check",
    "lucide:x",
    "lucide:plus",
    "lucide:minus",
    "lucide:arrow-right",
    "lucide:arrow-up-right",
    "lucide:chevron-right",
    "lucide:external-link",
    "lucide:link",
    "lucide:share-2",
    "lucide:lock",
    "lucide:eye",
    "lucide:zap",
    "lucide:sparkles",
    "lucide:rocket",
    "lucide:flame",
    "lucide:sun",
    "lucide:moon",
    "lucide:cloud",
    "lucide:globe",
    "lucide:shopping-cart",
    "lucide:credit-card",
    "lucide:gift",
    "lucide:thumbs-up",
    "lucide:message-circle",
    "lucide:play",
    "lucide:music",
    "lucide:code",
].map((id) => ({ id }));

const RailIcon = {
    recent: () => (
        <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.9"
            stroke-linecap="round"
        >
            <circle cx="12" cy="12" r="8.5" />
            <path d="M12 7.5V12l3 2" />
        </svg>
    ),
    upload: () => (
        <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.9"
            stroke-linecap="round"
            stroke-linejoin="round"
        >
            <path d="M12 16V4M7 9l5-5 5 5" />
            <path d="M5 20h14" />
        </svg>
    ),
    photo: () => (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
            <rect x="3" y="4" width="18" height="16" rx="2" />
            <circle cx="9" cy="10" r="1.5" />
            <path d="M4 18l5-5 4 4 3-3 4 4" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
    ),
    icons: () => (
        <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
            stroke-linejoin="round"
        >
            <rect x="3.5" y="3.5" width="7" height="7" rx="1.6" />
            <circle cx="17" cy="7" r="3.6" />
            <path d="M17 14.5l3.2 6H13.8z" />
            <rect x="3.5" y="14" width="7" height="7" rx="1.6" />
        </svg>
    ),
};

export const MediaPicker: Component = () => {
    const [source, setSource] = createSignal<Source>("recent");
    const [providers, setProviders] = createSignal<MediaProvidersState>({
        stock: { openverse: true, unsplash: false, pexels: false, pixabay: false },
        generate: false,
    });
    const [query, setQuery] = createSignal("");
    const [items, setItems] = createSignal<MediaItem[]>([]);
    const [loading, setLoading] = createSignal(false);
    const [error, setError] = createSignal("");
    const [page, setPage] = createSignal(1);
    const [hasMore, setHasMore] = createSignal(false);
    const [prompt, setPrompt] = createSignal("");
    const [aspect, setAspect] = createSignal("16:9");
    const [genStyle, setGenStyle] = createSignal<MediaGenStyle>("photo");
    // count of shimmer placeholders still generating
    const [generating, setGenerating] = createSignal(0);
    const [kind, setKind] = createSignal<MediaKind>("photo");
    // icon mode: separate list from the url-based media grid
    const [iconItems, setIconItems] = createSignal<IconItem[]>([]);

    let debounce = 0;
    let fileInput!: HTMLInputElement;

    const isStock = (s: Source): s is MediaProvider => (STOCK as string[]).includes(s);
    const themeVars = (): JSX.CSSProperties | undefined => overlayThemeVars();
    // photos: all providers; other kinds: Openverse-only
    const stockSources = (): MediaProvider[] => (kind() === "photo" ? STOCK : ["openverse"]);

    createEffect(
        on(mediaRequest, (req) => {
            if (!req) return;
            const k = req.kind ?? "photo";
            setKind(k);
            setGenStyle(k === "illustration" || k === "sticker" ? "illustration" : "photo");
            setQuery(req.query ?? "");
            setError("");
            setItems([]);
            setIconItems([]);
            setHasMore(false);
            setPage(1);
            setGenerating(0);
            api.mediaProviders()
                .then(setProviders)
                .catch(() => {});
            if (k === "icon") {
                setSource("icons");
                runIconSearch();
            } else if (k === "photo") {
                setSource("recent");
                loadRecent();
            } else {
                setSource("openverse");
                runSearch(true);
            }
        }),
    );

    async function runIconSearch(): Promise<void> {
        if (!query().trim()) {
            setIconItems(STARTER_ICONS);
            return;
        }
        setLoading(true);
        setError("");
        try {
            setIconItems((await api.searchIcons(query().trim(), 60)).icons);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Icon search failed");
        }
        setLoading(false);
    }

    async function pickIcon(id: string): Promise<void> {
        try {
            const { icon } = await api.getIcon(id);
            pickMediaIcon(icon);
        } catch {
            // best-effort; failed fetch leaves the picker open
        }
    }

    async function loadRecent(): Promise<void> {
        setLoading(true);
        try {
            setItems((await api.recentMedia()).items);
        } catch {
            setItems([]);
        }
        setLoading(false);
    }

    async function runSearch(reset: boolean): Promise<void> {
        const s = source();
        if (!isStock(s)) return;
        const q = query().trim() || DEFAULT_QUERY[kind()];
        if (!q) return;
        const p = reset ? 1 : page() + 1;
        setLoading(true);
        setError("");
        try {
            const res = await api.searchMedia(s, q, p, kind());
            setItems((cur) => (reset ? res.items : [...cur, ...res.items]));
            setPage(p);
            setHasMore(res.hasMore);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Search failed");
        }
        setLoading(false);
    }

    const selectSource = (s: Source): void => {
        setSource(s);
        setError("");
        setItems([]);
        setHasMore(false);
        setPage(1);
        if (s === "recent") loadRecent();
        else if (s === "icons") runIconSearch();
        else if (isStock(s)) runSearch(true);
    };

    const onQuery = (v: string): void => {
        setQuery(v);
        if (source() === "icons") {
            window.clearTimeout(debounce);
            debounce = window.setTimeout(() => runIconSearch(), 300);
            return;
        }
        if (!isStock(source())) return;
        window.clearTimeout(debounce);
        debounce = window.setTimeout(() => runSearch(true), 350);
    };

    async function generate(): Promise<void> {
        if (!prompt().trim()) return;
        const want = 4;
        setLoading(true);
        setError("");
        setItems([]);
        setGenerating(want);
        try {
            await streamGenerateMedia(
                { prompt: prompt().trim(), aspect: aspect(), n: want, style: genStyle() },
                (e) => {
                    if (e.type === "image" && e.item) {
                        const item = e.item;
                        setItems((prev) => [...prev, item]);
                        setGenerating((g) => Math.max(0, g - 1));
                    } else if (e.type === "fail") {
                        setGenerating((g) => Math.max(0, g - 1));
                    } else if (e.type === "done") {
                        setGenerating(0);
                    }
                },
            );
        } catch (e) {
            setError(e instanceof Error ? e.message : "Generation failed");
        }
        setGenerating(0);
        setLoading(false);
    }

    async function onFiles(files: FileList | null): Promise<void> {
        const file = files?.[0];
        if (!file) return;
        setLoading(true);
        setError("");
        try {
            const dataUrl = await new Promise<string>((res, rej) => {
                const r = new FileReader();
                r.onload = () => res(String(r.result));
                r.onerror = () => rej(new Error("read failed"));
                r.readAsDataURL(file);
            });
            const base64 = dataUrl.split(",")[1] ?? "";
            const im = new Image();
            im.src = dataUrl;
            await im.decode().catch(() => {});
            const { item } = await api.uploadMedia({
                data: base64,
                mime: file.type || "image/png",
                name: file.name,
                width: im.naturalWidth || undefined,
                height: im.naturalHeight || undefined,
            });
            await pick(item);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Upload failed");
            setLoading(false);
        }
    }

    async function pick(it: MediaItem): Promise<void> {
        try {
            await api.useMedia(it);
        } catch {
            // best-effort; never block the pick
        }
        pickMedia(it.url);
    }

    onMount(() => {
        const onKey = (e: KeyboardEvent): void => {
            if (e.key === "Escape" && mediaRequest()) closeMediaPicker();
        };
        window.addEventListener("keydown", onKey);
        onCleanup(() => window.removeEventListener("keydown", onKey));
    });

    const railBtn = (
        id: Source,
        label: string,
        icon: () => JSX.Element,
        disabled = false,
    ): JSX.Element => (
        <button
            class={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] ${
                source() === id
                    ? "bg-accent/12 font-semibold text-accent"
                    : "text-soft hover:bg-canvas hover:text-ink"
            } ${disabled ? "opacity-45" : ""}`}
            onClick={() => selectSource(id)}
        >
            <span class="grid h-4 w-4 flex-none place-items-center">{icon()}</span>
            <span class="min-w-0 flex-1 truncate">{label}</span>
            <Show when={disabled}>
                <Eyebrow size={8.5} weight="normal">
                    key
                </Eyebrow>
            </Show>
        </button>
    );

    const railGroup = (label: string): JSX.Element => (
        <Eyebrow as="div" size={9} tracking="wide" class="mb-1.5 mt-3 px-2.5 first:mt-1">
            {label}
        </Eyebrow>
    );

    const grid = (): JSX.Element => (
        <Show
            when={items().length > 0 || generating() > 0}
            fallback={
                <div class="grid h-full place-items-center text-[13px] text-muted">
                    <Show when={loading()} fallback={emptyHint()}>
                        Loading…
                    </Show>
                </div>
            }
        >
            <Show when={!query().trim() && isStock(source())}>
                <Eyebrow as="div" size={9} tracking="wide" class="mb-2">
                    Popular {KIND_NOUN[kind()]}
                </Eyebrow>
            </Show>
            <div class="[column-gap:8px] columns-2 sm:columns-3">
                <For each={items()}>
                    {(it) => (
                        <button
                            class="group relative mb-2 block w-full overflow-hidden rounded-lg border border-line/70 hover:border-accent"
                            classList={{ "mp-pop": it.source === "generated" }}
                            onClick={() => pick(it)}
                        >
                            <img
                                src={it.thumbUrl}
                                alt={it.alt ?? ""}
                                loading="lazy"
                                class="block w-full bg-canvas"
                            />
                            <Show when={it.attribution?.author}>
                                <span
                                    class="absolute inset-x-0 bottom-0 truncate px-2 pb-1 pt-5 text-left text-[10px] text-white opacity-0 transition group-hover:opacity-100"
                                    style={{ background: "linear-gradient(transparent,#000000b0)" }}
                                >
                                    {it.attribution!.author} · {it.attribution!.provider}
                                </span>
                            </Show>
                        </button>
                    )}
                </For>
                {/* shimmer sized to aspect so real images swap in without a layout jump */}
                <For each={Array.from({ length: generating() })}>
                    {() => (
                        <div
                            class="mp-shimmer mb-2 grid w-full place-items-center overflow-hidden rounded-lg border border-line/70"
                            style={{ "aspect-ratio": aspect().replace(":", " / ") }}
                        >
                            <span class="text-muted opacity-40">
                                <SparkleIcon size={18} />
                            </span>
                        </div>
                    )}
                </For>
            </div>
            <Show when={hasMore() && isStock(source())}>
                <div class="mt-2 flex justify-center">
                    <Button variant="outline" onClick={() => runSearch(false)}>
                        {loading() ? "Loading…" : "Load more"}
                    </Button>
                </div>
            </Show>
        </Show>
    );

    const emptyHint = (): JSX.Element => (
        <span class="text-center">
            <Show when={isStock(source())} fallback="No images yet.">
                Search {source()} for {KIND_NOUN[kind()]}.
            </Show>
        </span>
    );

    const iconGrid = (): JSX.Element => (
        <Show
            when={iconItems().length > 0}
            fallback={
                <div class="grid h-full place-items-center px-6 text-center text-[13px] text-muted">
                    <Show
                        when={loading()}
                        fallback={
                            query().trim()
                                ? "No icons found."
                                : "Search 200,000+ icons — try “rocket”, “heart”, or “arrow”."
                        }
                    >
                        Loading…
                    </Show>
                </div>
            }
        >
            <Show when={!query().trim()}>
                <Eyebrow as="div" size={9} tracking="wide" class="mb-2">
                    Popular icons
                </Eyebrow>
            </Show>
            <div class="grid grid-cols-6 gap-1.5 sm:grid-cols-8">
                <For each={iconItems()}>
                    {(it) => (
                        <button
                            title={it.id}
                            class="grid aspect-square place-items-center rounded-lg border border-line/50 hover:border-accent hover:bg-accent/5"
                            onClick={() => pickIcon(it.id)}
                        >
                            <img
                                src={`https://api.iconify.design/${it.id.replace(":", "/")}.svg?height=28&color=${encodeURIComponent(editorTokens().ink)}`}
                                alt={it.id}
                                loading="lazy"
                                class="h-7 w-7"
                            />
                        </button>
                    )}
                </For>
            </div>
        </Show>
    );

    return (
        <Show when={mediaRequest()}>
            <Modal
                onClose={closeMediaPicker}
                scrim="blur"
                vars={themeVars()}
                class="flex h-[600px] max-h-[86vh] max-w-[900px] flex-col overflow-hidden"
            >
                <header class="flex flex-none items-center gap-3 border-b border-line px-5 py-3">
                    <h2
                        class="font-display text-[16px] font-semibold text-ink"
                        style={{ "font-weight": "var(--hw)" }}
                    >
                        {KIND_TITLE[kind()]}
                    </h2>
                    <Show when={error()}>
                        <span class="truncate text-[12px] text-red-500">{error()}</span>
                    </Show>
                    <IconButton size="md" tone="muted" class="ml-auto" onClick={closeMediaPicker}>
                        <CloseIcon size={15} />
                    </IconButton>
                </header>

                <div class="flex min-h-0 flex-1">
                    <nav class="w-[170px] flex-none overflow-y-auto border-r border-line px-2 py-2">
                        <Show
                            when={kind() !== "icon"}
                            fallback={
                                <>
                                    {railGroup("Icons")}
                                    {railBtn("icons", "Icons", RailIcon.icons)}
                                </>
                            }
                        >
                            {railGroup("Yours")}
                            {railBtn("recent", "Recent", RailIcon.recent)}
                            {railBtn("upload", "Upload", RailIcon.upload)}
                            {railGroup("Stock")}
                            <For each={stockSources()}>
                                {(p) =>
                                    railBtn(
                                        p,
                                        p.charAt(0).toUpperCase() + p.slice(1),
                                        RailIcon.photo,
                                        !providers().stock[p],
                                    )
                                }
                            </For>
                            {/* generate is image-only — hidden for GIFs */}
                            <Show when={kind() !== "gif"}>
                                {railGroup("Create")}
                                {railBtn(
                                    "generate",
                                    "Generate",
                                    () => (
                                        <SparkleIcon size={14} />
                                    ),
                                    !providers().generate,
                                )}
                            </Show>
                        </Show>
                    </nav>

                    <div class="flex min-w-0 flex-1 flex-col">
                        <Show when={isStock(source()) || source() === "icons"}>
                            <div class="flex-none px-4 pt-3">
                                <TextField
                                    icon="search"
                                    placeholder={
                                        source() === "icons"
                                            ? "Search icons…"
                                            : `Search ${source()}…`
                                    }
                                    value={query()}
                                    onChange={onQuery}
                                    onKeyDown={(e) =>
                                        e.key === "Enter" &&
                                        (source() === "icons" ? runIconSearch() : runSearch(true))
                                    }
                                />
                            </div>
                        </Show>

                        <Show when={source() === "generate"}>
                            <div class="flex-none px-4 pt-3">
                                <TextArea
                                    rows={2}
                                    rounded="lg"
                                    placeholder="Describe the image — e.g. a rooftop solar array at golden hour, wide angle"
                                    value={prompt()}
                                    onChange={setPrompt}
                                />
                                <div class="mt-2 flex flex-wrap items-center gap-1.5">
                                    <span class="text-[11px] text-muted">Style</span>
                                    <For each={MEDIA_GEN_STYLES}>
                                        {(s) => (
                                            <Chip
                                                variant="soft"
                                                selected={genStyle() === s.value}
                                                onClick={() => setGenStyle(s.value)}
                                            >
                                                {s.label}
                                            </Chip>
                                        )}
                                    </For>
                                </div>
                                <div class="mt-2 flex items-center gap-1.5">
                                    <span class="text-[11px] text-muted">Ratio</span>
                                    <For each={MEDIA_ASPECTS}>
                                        {(a) => (
                                            <Chip
                                                variant="soft"
                                                selected={aspect() === a.value}
                                                onClick={() => setAspect(a.value)}
                                            >
                                                {a.label}
                                            </Chip>
                                        )}
                                    </For>
                                    <Button
                                        variant="primary"
                                        size="sm"
                                        class="ml-auto"
                                        loading={loading()}
                                        disabled={!prompt().trim()}
                                        onClick={generate}
                                    >
                                        <SparkleIcon size={13} />
                                        {loading() ? "Generating…" : "Generate"}
                                    </Button>
                                </div>
                            </div>
                        </Show>

                        <div class="min-h-0 flex-1 overflow-y-auto p-4">
                            <Switch fallback={grid()}>
                                <Match when={source() === "icons"}>{iconGrid()}</Match>
                                <Match when={source() === "upload"}>
                                    <button
                                        class="grid h-full w-full place-items-center rounded-xl border-2 border-dashed border-line text-center text-muted hover:border-accent hover:text-ink"
                                        onClick={() => fileInput.click()}
                                    >
                                        <span>
                                            <span class="mx-auto mb-2 grid h-9 w-9 place-items-center rounded-full bg-canvas">
                                                {RailIcon.upload()}
                                            </span>
                                            <span class="block text-[13.5px] font-medium text-ink">
                                                {loading()
                                                    ? "Uploading…"
                                                    : "Choose a file to upload"}
                                            </span>
                                            <span class="block text-[12px]">PNG, JPG, or GIF</span>
                                        </span>
                                    </button>
                                </Match>
                            </Switch>
                        </div>
                    </div>
                </div>
                <input
                    ref={fileInput}
                    type="file"
                    accept="image/*"
                    class="hidden"
                    onChange={(e) => onFiles(e.currentTarget.files)}
                />
            </Modal>
        </Show>
    );
};
