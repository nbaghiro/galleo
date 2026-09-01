import type { Component, JSX } from "solid-js";
import {
    createEffect,
    createMemo,
    createSignal,
    For,
    Index,
    Match,
    on,
    onCleanup,
    onMount,
    Show,
    Switch,
} from "solid-js";
import type {
    IconItem,
    MediaGenStyle,
    MediaItem,
    MediaKind,
    MediaProvider,
    MediaSearchResponse,
} from "@model/media";
import { isEmbedVideoUrl, KIND_PROVIDERS, MEDIA_ASPECTS, MEDIA_GEN_STYLES } from "@model/media";
import { editorTokens } from "@editor/core/store";
import {
    api,
    ApiError,
    streamGenerateMedia,
    streamGenerateVideo,
    type MediaProvidersState,
} from "@app/api";
import { queryBucket } from "@model/analytics";
import { estimateCost } from "@model/tools";
import { capture } from "@ui/analytics";
import { Credits } from "@app/components/Credits";
import { reportError } from "@app/stores/errors";
import {
    closeMediaPicker,
    mediaRequest,
    pickMedia,
    pickMediaIcon,
    removeMedia,
} from "@app/stores/media";
import { overlayThemeVars } from "@app/stores/theme";
import { CloseIcon, SparkleIcon, TrashIcon } from "@ui/icons";
import { ConfirmModal, Modal } from "@ui/overlay";
import { Button, Chip, Eyebrow, IconButton } from "@ui/button";
import { TextArea, TextField } from "@ui/inputs";
import { createSentinel } from "@ui/scroll";

type Source = "library" | "upload" | "link" | MediaProvider | "generate" | "icons";

// flat catalog prices, shown before a tap spends them; video is heavy enough to ask first
const IMAGE_COST = estimateCost("generate-image");
const VIDEO_COST = estimateCost("generate-video");
const STOCK: MediaProvider[] = ["openverse", "unsplash", "pexels", "pixabay", "giphy"];

const KIND_TITLE: Record<MediaKind, string> = {
    photo: "Add an image",
    gif: "Add a GIF",
    illustration: "Add an illustration",
    sticker: "Add a sticker",
    icon: "Add an icon",
    video: "Add a video",
};
const KIND_NOUN: Record<MediaKind, string> = {
    photo: "photos",
    gif: "GIFs",
    illustration: "illustrations",
    sticker: "stickers",
    icon: "icons",
    video: "videos",
};

const DEFAULT_QUERY: Record<MediaKind, string> = {
    photo: "nature",
    gif: "abstract",
    illustration: "abstract",
    sticker: "emoji",
    icon: "",
    video: "nature",
};

// the address a person would actually be pasting, per kind
const LINK_EXAMPLE: Record<MediaKind, string> = {
    photo: "photo.jpg",
    gif: "loop.gif",
    illustration: "drawing.svg",
    sticker: "sticker.png",
    icon: "icon.svg",
    video: "clip.mp4",
};

// what the chips offer; icons have their own rail and arrive as a glyph rather than a url
const PICK_KINDS: MediaKind[] = ["photo", "video", "illustration", "gif", "sticker", "icon"];

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

// stable identities so <For> reuses shimmer DOM across appends
const SHIMS: { shim: true }[] = Array.from({ length: 4 }, () => ({ shim: true }));
type GridTile = MediaItem | { shim: true };

const RailIcon = {
    library: () => (
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
    link: () => (
        <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.9"
            stroke-linecap="round"
        >
            <path d="M10 13.5a4 4 0 006 .5l2-2a4 4 0 10-5.7-5.7l-1 1" />
            <path d="M14 10.5a4 4 0 00-6-.5l-2 2a4 4 0 105.7 5.7l1-1" />
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
    const [source, setSource] = createSignal<Source>("library");
    const [providers, setProviders] = createSignal<MediaProvidersState>({
        stock: { openverse: true, unsplash: false, pexels: false, pixabay: false, giphy: false },
        generate: false,
        generateVideo: false,
    });
    const [query, setQuery] = createSignal("");
    const [items, setItems] = createSignal<MediaItem[]>([]);
    const [loading, setLoading] = createSignal(false);
    const [error, setError] = createSignal("");
    const [page, setPage] = createSignal(1);
    const [hasMore, setHasMore] = createSignal(false);
    const [prompt, setPrompt] = createSignal("");
    const [polishing, setPolishing] = createSignal(false);
    // one clip is a hundred credits, so a single tap must not be the whole decision
    const [confirmingVideo, setConfirmingVideo] = createSignal(false);

    // user-triggered: spends one credit, writes the fuller prompt back into the box so it stays
    // editable, and leaves generation itself alone — a refined prompt is just a prompt
    const polishPrompt = async (): Promise<void> => {
        const rough = prompt().trim();
        if (!rough || polishing()) return;
        setPolishing(true);
        try {
            setPrompt(
                await api.refinePrompt({
                    prompt: rough,
                    kind: kind() === "video" ? "video" : "image",
                }),
            );
        } catch {
            /* leave the user's own words in place */
        } finally {
            setPolishing(false);
        }
    };
    const [aspect, setAspect] = createSignal("16:9");
    const [genStyle, setGenStyle] = createSignal<MediaGenStyle>("photo");
    // count of shimmer placeholders still generating
    const [generating, setGenerating] = createSignal(0);
    const [kind, setKind] = createSignal<MediaKind>("photo");
    // a generated take chosen as the base for image-conditioned refinement
    const [refItem, setRefItem] = createSignal<MediaItem | null>(null);
    const [linkUrl, setLinkUrl] = createSignal("");
    // icon mode: separate list from the url-based media grid
    const [iconItems, setIconItems] = createSignal<IconItem[]>([]);

    let debounce = 0;
    let fileInput!: HTMLInputElement;
    let scrollRef!: HTMLDivElement;
    let sentinelEl: HTMLDivElement | undefined;
    let gridRo: ResizeObserver | undefined;
    // masonry column count follows the scroll container's width, not the viewport
    const [gridW, setGridW] = createSignal(0);

    const armScroll = (el: HTMLDivElement): void => {
        scrollRef = el;
        gridRo?.disconnect();
        gridRo = new ResizeObserver((es) => setGridW(es[0]?.contentRect.width ?? el.clientWidth));
        gridRo.observe(el);
    };

    const armSentinel = createSentinel(() => void loadMore(), { root: () => scrollRef });

    const isStock = (s: Source): s is MediaProvider => (STOCK as string[]).includes(s);
    const themeVars = (): JSX.CSSProperties | undefined => overlayThemeVars();
    // the rail lists only the providers that can serve the current kind
    const stockSources = (): MediaProvider[] => KIND_PROVIDERS[kind()];

    // search generation: bumped on every reset so stale responses and prefetches drop out
    let gen = 0;
    // the next page, fetched while the current one is browsed, so scrolling appends instantly
    let ahead: { page: number; res: Promise<MediaSearchResponse | null> } | null = null;
    const seen = new Set<string>();

    const searchQ = (): string => query().trim() || DEFAULT_QUERY[kind()];

    const fresh = (list: MediaItem[]): MediaItem[] => {
        const out: MediaItem[] = [];
        for (const it of list) {
            if (seen.has(it.id)) continue;
            seen.add(it.id);
            out.push(it);
        }
        return out;
    };

    const resetSearch = (): void => {
        gen++;
        ahead = null;
        seen.clear();
    };

    const prefetchNext = (p: number): void => {
        const s = source();
        if (!isStock(s)) return;
        const g = gen;
        ahead = {
            page: p,
            res: api.searchMedia(s, searchQ(), p, kind()).then(
                (r) => (g === gen ? r : null),
                () => null,
            ),
        };
    };

    async function loadMore(): Promise<void> {
        const s = source();
        if (!hasMore() || loading()) return;
        if (s === "library") return loadLibrary(false);
        if (!isStock(s)) return;
        const g = gen;
        const next = page() + 1;
        const buffered = ahead && ahead.page === next ? ahead.res : null;
        ahead = null;
        setLoading(true);
        let res = buffered ? await buffered : null;
        if (!res && g === gen) {
            res = await api.searchMedia(s, searchQ(), next, kind()).catch(() => null);
        }
        if (g !== gen) return;
        setLoading(false);
        if (!res) return;
        const add = fresh(res.items);
        setItems((cur) => [...cur, ...add]);
        setPage(next);
        setHasMore(res.hasMore);
        if (res.hasMore) prefetchNext(next + 1);
        // a short page can leave the sentinel visible with no further scroll — re-arm to re-fire
        if (sentinelEl) armSentinel(sentinelEl);
    }

    // Shortest-column placement is prefix-stable: appending a page never moves an existing tile,
    // unlike CSS columns, which rebalance the whole flow on every append.
    const columns = createMemo<GridTile[][]>(() => {
        const n = gridW() > 0 && gridW() < 560 ? 2 : 3;
        const [aw, ah] = aspect().split(":").map(Number);
        const shimRatio = aw && ah ? ah / aw : 1;
        const cols: GridTile[][] = Array.from({ length: n }, () => []);
        const heights = new Array<number>(n).fill(0);
        for (const t of [...items(), ...SHIMS.slice(0, generating())]) {
            const r =
                "shim" in t ? shimRatio : t.width > 0 && t.height > 0 ? t.height / t.width : 1.4;
            let best = 0;
            for (let i = 1; i < n; i++) if ((heights[i] ?? 0) < (heights[best] ?? 0)) best = i;
            cols[best]?.push(t);
            heights[best] = (heights[best] ?? 0) + r + 0.06;
        }
        return cols;
    });

    createEffect(
        on(mediaRequest, (req) => {
            if (!req) return;
            const k = req.kind ?? "photo";
            setKind(k);
            setGenStyle(k === "illustration" || k === "sticker" ? "illustration" : "photo");
            if (k === "video") setAspect("16:9"); // veo supports 16:9 / 9:16 only
            setQuery(req.query ?? "");
            setError("");
            resetSearch();
            setItems([]);
            setRefItem(null);
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
            } else if (k === "photo" || k === "video") {
                setSource("library");
                loadLibrary(true);
            } else {
                setSource(KIND_PROVIDERS[k][0] ?? "openverse");
                runSearch();
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

    // the library pages like a stock tab does, so a workspace with thousands of pictures scrolls
    let libraryBefore: string | null = null;
    async function loadLibrary(reset: boolean): Promise<void> {
        if (loading()) return;
        const g = gen;
        setLoading(true);
        try {
            const res = await api.libraryMedia({
                kind: kind() === "video" ? "video" : "image",
                q: query(),
                ...(reset ? {} : { before: libraryBefore ?? undefined }),
            });
            if (g !== gen) return;
            libraryBefore = res.nextBefore;
            setItems((cur) => (reset ? fresh(res.items) : [...cur, ...fresh(res.items)]));
            setHasMore(!!res.nextBefore);
        } catch {
            if (reset) setItems([]);
        }
        if (g === gen) setLoading(false);
    }

    async function runSearch(): Promise<void> {
        const s = source();
        if (!isStock(s)) return;
        const q = searchQ();
        if (!q) return;
        resetSearch();
        const g = gen;
        setLoading(true);
        setError("");
        try {
            const res = await api.searchMedia(s, q, 1, kind());
            if (g !== gen) return;
            // The query never travels, only its length and whether it found anything: "does search
            // work" is answerable, "what do people search for" is a content question we do not ask.
            capture("media_searched", {
                provider: s,
                result_count: res.items.length,
                query_length_bucket: queryBucket(q.length),
            });
            // the response carries live key state, so the rail heals itself
            setProviders((prev) => ({ ...prev, stock: res.providers }));
            setItems(fresh(res.items));
            setPage(1);
            setHasMore(res.hasMore);
            if (res.hasMore) prefetchNext(2);
        } catch (e) {
            if (g !== gen) return;
            setError(e instanceof Error ? e.message : "Search failed");
        }
        if (g === gen) setLoading(false);
    }

    // The kind is where you start, not where you are stuck: swapping it here is what lets an image
    // element come back from this modal holding a clip. The element is one type underneath, so the
    // pick is a data patch and the frame it sits in survives.
    const selectKind = (k: MediaKind): void => {
        if (k === kind()) return;
        setKind(k);
        setError("");
        resetSearch();
        setItems([]);
        setHasMore(false);
        const s = source();
        if (k === "icon") return selectSource("icons");
        if (s === "icons") return selectSource("library");
        if (isStock(s) && !KIND_PROVIDERS[k].includes(s))
            return selectSource(KIND_PROVIDERS[k][0] ?? "library");
        selectSource(s);
    };

    const selectSource = (s: Source): void => {
        setSource(s);
        setError("");
        resetSearch();
        setItems([]);
        setRefItem(null);
        setHasMore(false);
        setPage(1);
        if (s === "library") {
            libraryBefore = null;
            loadLibrary(true);
        } else if (s === "icons") runIconSearch();
        else if (s === "link") setLinkUrl("");
        else if (isStock(s)) runSearch();
    };

    const onQuery = (v: string): void => {
        setQuery(v);
        if (source() === "icons") {
            window.clearTimeout(debounce);
            debounce = window.setTimeout(() => runIconSearch(), 300);
            return;
        }
        if (source() === "library") {
            window.clearTimeout(debounce);
            debounce = window.setTimeout(() => {
                resetSearch();
                libraryBefore = null;
                void loadLibrary(true);
            }, 300);
            return;
        }
        if (!isStock(source())) return;
        window.clearTimeout(debounce);
        debounce = window.setTimeout(() => runSearch(), 350);
    };

    async function generate(): Promise<void> {
        if (!prompt().trim()) return;
        const want = 1; // one take per click; earlier takes stay in the grid for comparison
        setLoading(true);
        setError("");
        setItems((cur) => cur.filter((it) => it.source === "generated"));
        setGenerating(want);
        try {
            await streamGenerateMedia(
                {
                    prompt: prompt().trim(),
                    aspect: aspect(),
                    n: want,
                    style: genStyle(),
                    refId: refItem()?.id,
                },
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
            // a paywall carries remedies only the error modal knows how to offer
            if (e instanceof ApiError && e.status === 402) reportError(e, "Generating the image");
            else setError(e instanceof Error ? e.message : "Generation failed");
        }
        setGenerating(0);
        setLoading(false);
    }

    // progress heartbeats keep the shimmer honest through the ~1–2 min wait
    async function generateVideoClip(): Promise<void> {
        if (!prompt().trim()) return;
        setLoading(true);
        setError("");
        setItems((cur) => cur.filter((it) => it.source === "generated"));
        setGenerating(1);
        try {
            await streamGenerateVideo({ prompt: prompt().trim(), aspect: aspect() }, (e) => {
                if (e.type === "video" && e.item) {
                    const item = e.item;
                    setItems((prev) => [...prev, item]);
                    setGenerating(0);
                } else if (e.type === "fail") {
                    setGenerating(0);
                    if (e.error) setError(e.error);
                } else if (e.type === "done") {
                    setGenerating(0);
                }
            });
        } catch (e) {
            if (e instanceof ApiError && e.status === 402) reportError(e, "Generating the video");
            else setError(e instanceof Error ? e.message : "Generation failed");
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
            capture("media_upload_failed", {
                reason: e instanceof Error ? e.name : "unknown",
            });
            // the storage wall's remedy is a plan, which the error modal can actually offer
            if (e instanceof ApiError && e.status === 402) reportError(e, "Uploading the file");
            else setError(e instanceof Error ? e.message : "Upload failed");
            setLoading(false);
        }
    }

    // Deleting something a deck still shows would leave a hole in it, so the server refuses and
    // names the artifacts instead; the picker just relays that.
    async function removeAsset(it: MediaItem): Promise<void> {
        setError("");
        try {
            await api.deleteMedia(it.id);
            setItems((cur) => cur.filter((x) => x.id !== it.id));
        } catch (e) {
            setError(e instanceof Error ? e.message : "Could not delete");
        }
    }

    // A pasted address: a file we can hold, or a platform page we cannot. A YouTube or Vimeo link
    // has no file to adopt, so it stays a link and the element plays it as an embed.
    async function submitLink(): Promise<void> {
        const url = linkUrl().trim();
        if (!url) return;
        setError("");
        setLoading(true);
        try {
            const res = await api.adoptLink(url);
            const embed = isEmbedVideoUrl(url);
            // the poster rides back as the item's still, which is the field the media control
            // already writes into the element's `poster`
            const item = res.poster
                ? {
                      id: url,
                      source: "link" as const,
                      url: res.url,
                      thumbUrl: res.poster,
                      width: 0,
                      height: 0,
                  }
                : undefined;
            pickMedia(res.url, item, embed ? "video" : kind());
        } catch (e) {
            setError(e instanceof Error ? e.message : "Could not add that link");
        }
        setLoading(false);
    }

    async function pick(it: MediaItem): Promise<void> {
        try {
            await api.useMedia(it);
        } catch {
            // best-effort; never block the pick
        }
        pickMedia(it.url, it, kind());
    }

    onMount(() => {
        const onKey = (e: KeyboardEvent): void => {
            if (e.key === "Escape" && mediaRequest()) closeMediaPicker();
        };
        window.addEventListener("keydown", onKey);
        onCleanup(() => {
            window.removeEventListener("keydown", onKey);
            gridRo?.disconnect();
        });
    });

    // disabled is an accessor: <For>'s map runs untracked, so a plain boolean would freeze the
    // key state at first render, before the providers fetch lands
    const railBtn = (
        id: Source,
        label: string,
        icon: () => JSX.Element,
        disabled?: () => boolean,
    ): JSX.Element => (
        <button
            class={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] ${
                source() === id
                    ? "bg-accent/12 font-semibold text-accent"
                    : "text-soft hover:bg-canvas hover:text-ink"
            }`}
            classList={{ "opacity-45": disabled?.() ?? false }}
            disabled={disabled?.() ?? false}
            title={disabled?.() ? "Needs an API key on the server" : undefined}
            onClick={() => selectSource(id)}
        >
            <span class="grid h-4 w-4 flex-none place-items-center">{icon()}</span>
            <span class="min-w-0 flex-1 truncate">{label}</span>
            <Show when={disabled?.()}>
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

    const mediaTile = (it: MediaItem): JSX.Element => (
        <button
            class="group relative block w-full overflow-hidden rounded-lg border border-line/70 hover:border-accent"
            classList={{ "mp-pop": it.source === "generated" }}
            onClick={() => pick(it)}
        >
            <Show
                when={kind() === "video" && it.source === "generated"}
                fallback={
                    <img
                        src={it.thumbUrl}
                        alt={it.alt ?? ""}
                        loading="lazy"
                        // a provider's thumbnail can be down while its full image is fine
                        // (Openverse's proxy answers 424), so fall back rather than show a hole
                        onError={(e) => {
                            const img = e.currentTarget;
                            if (img.src !== it.url) img.src = it.url;
                        }}
                        class="block w-full bg-canvas object-cover"
                        style={
                            it.width > 0 && it.height > 0
                                ? { "aspect-ratio": `${it.width} / ${it.height}` }
                                : undefined
                        }
                    />
                }
            >
                <video
                    src={it.url}
                    muted
                    loop
                    playsinline
                    // A grid of autoplaying clips downloads every one of them in full. Metadata is
                    // enough to paint the first frame; hovering is what says you want to watch it.
                    preload="metadata"
                    poster={it.thumbUrl !== it.url ? it.thumbUrl : undefined}
                    onMouseEnter={(e) => void e.currentTarget.play().catch(() => {})}
                    onMouseLeave={(e) => {
                        e.currentTarget.pause();
                        e.currentTarget.currentTime = 0;
                    }}
                    style={
                        it.width > 0 && it.height > 0
                            ? { "aspect-ratio": `${it.width} / ${it.height}` }
                            : undefined
                    }
                    class="block w-full bg-black"
                />
            </Show>
            <Show when={kind() === "video" && it.source !== "generated"}>
                <span class="absolute left-1/2 top-1/2 grid size-8 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-black/45 text-[13px] text-white">
                    ▶
                </span>
            </Show>
            <Show
                when={
                    kind() !== "video" &&
                    it.source === "generated" &&
                    (source() === "generate" || source() === "library")
                }
            >
                <span
                    role="button"
                    title="Use this take as the base for the next generation"
                    class="absolute right-1.5 top-1.5 rounded-full px-2 py-0.5 text-[10.5px] font-semibold text-white transition"
                    classList={{
                        "bg-accent opacity-100": refItem()?.id === it.id,
                        "bg-black/55 opacity-0 group-hover:opacity-100 hover:bg-accent":
                            refItem()?.id !== it.id,
                    }}
                    onClick={(e) => {
                        e.stopPropagation();
                        // from the library: jump to generate with this take as the base
                        if (source() === "library") {
                            selectSource("generate");
                            setRefItem(it);
                        } else {
                            setRefItem(refItem()?.id === it.id ? null : it);
                        }
                    }}
                >
                    {refItem()?.id === it.id ? "Refining" : "Refine"}
                </span>
            </Show>
            <Show when={source() === "library"}>
                <span
                    role="button"
                    title="Delete from your library"
                    class="absolute right-1.5 top-1.5 grid size-6 place-items-center rounded-full bg-black/55 text-white opacity-0 transition group-hover:opacity-100 hover:bg-[#C0392B]"
                    onClick={(e) => {
                        e.stopPropagation();
                        void removeAsset(it);
                    }}
                >
                    <TrashIcon size={12} />
                </span>
            </Show>
            <Show when={it.attribution?.author}>
                <span
                    class="absolute inset-x-0 bottom-0 truncate px-2 pb-1 pt-5 text-left text-[10px] text-white opacity-0 transition group-hover:opacity-100"
                    style={{ background: "linear-gradient(transparent,#000000b0)" }}
                >
                    {it.attribution!.author} · {it.attribution!.provider}
                </span>
            </Show>
        </button>
    );

    // sized to the chosen aspect so the real image swaps in without a layout jump
    const shimmerTile = (): JSX.Element => (
        <div
            class="mp-shimmer grid w-full place-items-center overflow-hidden rounded-lg border border-line/70"
            style={{ "aspect-ratio": aspect().replace(":", " / ") }}
        >
            <span class="text-muted opacity-40">
                <SparkleIcon size={18} />
            </span>
        </div>
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
            <div class="flex items-start gap-2">
                <Index each={columns()}>
                    {(col) => (
                        <div class="flex min-w-0 flex-1 flex-col gap-2">
                            <For each={col()}>
                                {(t) => ("shim" in t ? shimmerTile() : mediaTile(t))}
                            </For>
                        </div>
                    )}
                </Index>
            </div>
            <Show when={isStock(source()) || source() === "library"}>
                <div
                    ref={(el) => {
                        sentinelEl = el;
                        armSentinel(el);
                    }}
                    class="h-px"
                />
                <Show when={loading() && items().length > 0}>
                    <div class="py-3 text-center text-[12px] text-muted">Loading…</div>
                </Show>
            </Show>
        </Show>
    );

    const emptyHint = (): JSX.Element => (
        <span class="text-center">
            <Show
                when={isStock(source())}
                fallback="Nothing here yet. Upload or generate something."
            >
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
                                : "Search 200,000+ icons. Try “rocket”, “heart”, or “arrow”."
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
                class="flex h-150 max-h-[86vh] max-w-225 flex-col overflow-hidden"
            >
                <header class="flex flex-none items-center gap-3 border-b border-line px-5 py-3">
                    <h2
                        class="font-display text-[16px] font-semibold text-ink"
                        style={{ "font-weight": "var(--hw)" }}
                    >
                        {KIND_TITLE[kind()]}
                    </h2>
                    <Show when={!mediaRequest()?.onPickIcon}>
                        <div class="flex min-w-0 flex-wrap items-center gap-1">
                            <For each={PICK_KINDS}>
                                {(k) => (
                                    <Chip
                                        variant="soft"
                                        selected={kind() === k}
                                        onClick={() => selectKind(k)}
                                    >
                                        {KIND_NOUN[k]}
                                    </Chip>
                                )}
                            </For>
                        </div>
                    </Show>
                    <Show when={error()}>
                        <span class="truncate text-[12px] text-red-500">{error()}</span>
                    </Show>
                    <div class="ml-auto flex items-center gap-2 max-md:pr-9">
                        <Show when={mediaRequest()?.onRemove}>
                            <Button variant="dangerGhost" size="sm" onClick={removeMedia}>
                                <TrashIcon size={13} />
                                Remove
                            </Button>
                        </Show>
                    </div>
                </header>

                <div class="flex min-h-0 flex-1">
                    <nav class="w-42.5 flex-none overflow-y-auto border-r border-line px-2 py-2">
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
                            {railBtn("library", "Library", RailIcon.library)}
                            {railBtn("upload", "Upload", RailIcon.upload)}
                            {railBtn("link", "Link", RailIcon.link)}
                            {railGroup("Stock")}
                            <For each={stockSources()}>
                                {(p) =>
                                    railBtn(
                                        p,
                                        p.charAt(0).toUpperCase() + p.slice(1),
                                        RailIcon.photo,
                                        () => !providers().stock[p],
                                    )
                                }
                            </For>
                            {/* generate: images via Gemini, video via Veo — GIFs have no generator */}
                            <Show when={kind() !== "gif"}>
                                {railGroup("Create")}
                                {railBtn(
                                    "generate",
                                    "Generate",
                                    () => (
                                        <SparkleIcon size={14} />
                                    ),
                                    () =>
                                        kind() === "video"
                                            ? !providers().generateVideo
                                            : !providers().generate,
                                )}
                            </Show>
                        </Show>
                    </nav>

                    <div class="flex min-w-0 flex-1 flex-col">
                        <Show
                            when={
                                isStock(source()) || source() === "icons" || source() === "library"
                            }
                        >
                            <div class="flex-none px-4 pt-3">
                                <TextField
                                    icon="search"
                                    placeholder={
                                        source() === "icons"
                                            ? "Search icons…"
                                            : source() === "library"
                                              ? "Search your media…"
                                              : `Search ${source()}…`
                                    }
                                    value={query()}
                                    onChange={onQuery}
                                    onKeyDown={(e) => {
                                        if (e.key !== "Enter") return;
                                        if (source() === "icons") runIconSearch();
                                        else if (source() === "library") {
                                            resetSearch();
                                            libraryBefore = null;
                                            void loadLibrary(true);
                                        } else runSearch();
                                    }}
                                />
                            </div>
                        </Show>

                        <Show when={source() === "generate"}>
                            <div class="flex-none px-4 pt-3">
                                <TextArea
                                    rows={2}
                                    rounded="lg"
                                    placeholder={
                                        refItem()
                                            ? "Describe the change. For example: same but warmer light, closer crop"
                                            : "Describe the image. For example: a rooftop solar array at golden hour, wide angle"
                                    }
                                    value={prompt()}
                                    onChange={setPrompt}
                                />
                                <div class="mt-1.5 flex justify-end">
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        loading={polishing()}
                                        disabled={!prompt().trim()}
                                        title="Expand this into a fuller prompt you can edit"
                                        onClick={() => void polishPrompt()}
                                    >
                                        <SparkleIcon size={11} />
                                        {polishing() ? "Improving…" : "Improve prompt"}
                                    </Button>
                                </div>
                                <Show when={refItem()}>
                                    {(r) => (
                                        <div class="mt-2 flex items-center gap-2 rounded-lg border border-accent/40 bg-accent/8 px-2 py-1.5 text-[12px] text-ink">
                                            <img
                                                src={r().thumbUrl}
                                                alt=""
                                                class="h-6 w-6 rounded object-cover"
                                            />
                                            <span class="min-w-0 flex-1 truncate">
                                                Refining this take
                                            </span>
                                            <IconButton
                                                size="xs"
                                                tone="muted"
                                                title="Stop refining"
                                                onClick={() => setRefItem(null)}
                                            >
                                                <CloseIcon size={11} />
                                            </IconButton>
                                        </div>
                                    )}
                                </Show>
                                <Show when={kind() !== "video"}>
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
                                </Show>
                                <div class="mt-2 flex items-center gap-1.5">
                                    <span class="text-[11px] text-muted">Ratio</span>
                                    <For
                                        each={
                                            kind() === "video"
                                                ? MEDIA_ASPECTS.filter(
                                                      (a) =>
                                                          a.value === "16:9" || a.value === "9:16",
                                                  )
                                                : MEDIA_ASPECTS
                                        }
                                    >
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
                                    <span class="ml-auto flex items-center gap-1.5">
                                        <Show
                                            when={
                                                !loading() &&
                                                items().some((it) => it.source === "generated")
                                            }
                                        >
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => {
                                                    setItems([]);
                                                    setRefItem(null);
                                                }}
                                            >
                                                Clear takes
                                            </Button>
                                        </Show>
                                        <Button
                                            variant="primary"
                                            size="sm"
                                            loading={loading()}
                                            disabled={!prompt().trim()}
                                            onClick={() =>
                                                kind() === "video"
                                                    ? setConfirmingVideo(true)
                                                    : void generate()
                                            }
                                        >
                                            <SparkleIcon size={13} />
                                            {loading()
                                                ? refItem()
                                                    ? "Refining…"
                                                    : "Generating…"
                                                : refItem()
                                                  ? "Refine"
                                                  : items().some((it) => it.source === "generated")
                                                    ? "Generate another"
                                                    : "Generate"}
                                            <Show when={!loading()}>
                                                {" · "}
                                                <Credits
                                                    n={kind() === "video" ? VIDEO_COST : IMAGE_COST}
                                                />
                                            </Show>
                                        </Button>
                                    </span>
                                </div>
                                <Show when={kind() === "video"}>
                                    <div class="mt-1.5 text-[11px] text-muted">
                                        8-second clip with audio · 720p · {VIDEO_COST} credits ·
                                        takes about a minute or two
                                    </div>
                                </Show>
                            </div>
                        </Show>

                        <div ref={armScroll} class="min-h-0 flex-1 overflow-y-auto p-4">
                            <Switch fallback={grid()}>
                                <Match when={source() === "icons"}>{iconGrid()}</Match>
                                <Match when={source() === "link"}>
                                    <div class="mx-auto grid h-full max-w-120 place-items-center">
                                        <div class="w-full">
                                            <Eyebrow as="div" size={9} tracking="wide" class="mb-2">
                                                Add by address
                                            </Eyebrow>
                                            <TextField
                                                placeholder={
                                                    kind() === "video"
                                                        ? "https://youtube.com/watch?v=… or a direct file url"
                                                        : `https://example.com/${LINK_EXAMPLE[kind()]}`
                                                }
                                                value={linkUrl()}
                                                onChange={setLinkUrl}
                                                onKeyDown={(e) =>
                                                    e.key === "Enter" && void submitLink()
                                                }
                                            />
                                            <p class="mt-2 text-[12px] leading-relaxed text-muted">
                                                <Show
                                                    when={kind() === "video"}
                                                    fallback="Fetched once and kept in your library. A YouTube or Vimeo link adds a video instead."
                                                >
                                                    A YouTube or Vimeo page becomes a player.
                                                    Anything else is fetched and kept in your
                                                    library.
                                                </Show>
                                            </p>
                                            <div class="mt-3 flex justify-end">
                                                <Button
                                                    variant="primary"
                                                    size="sm"
                                                    loading={loading()}
                                                    disabled={!linkUrl().trim()}
                                                    onClick={() => void submitLink()}
                                                >
                                                    Add
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                </Match>
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
                                            <span class="block text-[12px]">
                                                PNG, JPG, GIF, or MP4
                                            </span>
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
                    accept="image/*,video/mp4,video/webm"
                    class="hidden"
                    onChange={(e) => onFiles(e.currentTarget.files)}
                />
                <Show when={confirmingVideo()}>
                    <ConfirmModal
                        title="Generate a video?"
                        body={`An 8 second clip costs ${VIDEO_COST} credits and takes a minute or two to make.`}
                        confirmLabel={`Generate for ${VIDEO_COST} credits`}
                        onConfirm={() => {
                            setConfirmingVideo(false);
                            void generateVideoClip();
                        }}
                        onCancel={() => setConfirmingVideo(false)}
                    />
                </Show>
            </Modal>
        </Show>
    );
};
