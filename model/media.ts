// Openverse is keyless; the rest need a key in .env
export type MediaProvider = "openverse" | "unsplash" | "pexels" | "pixabay";
// "link" is an external url we did not source ourselves (pasted, or authored into a template)
export type MediaSource = "stock" | "generated" | "upload" | "link";

// "photo" is the default (backgrounds + the Image element)
export type MediaKind = "photo" | "gif" | "illustration" | "sticker" | "icon" | "video";

// enforced server-side in searchStock; icons search Iconify, not stock
export const KIND_PROVIDERS: Record<MediaKind, MediaProvider[]> = {
    photo: ["openverse", "unsplash", "pexels", "pixabay"],
    gif: ["openverse"],
    illustration: ["openverse", "pixabay"],
    sticker: ["openverse", "pixabay"],
    icon: [],
    video: ["pexels", "pixabay"],
};

// how to credit an image (Unsplash/Pexels require visible attribution)
export interface MediaAttribution {
    provider?: string; // "Unsplash" | "Pexels" | "Pixabay"
    author?: string;
    authorUrl?: string;
    sourceUrl?: string; // the photo's page, for the credit link
    downloadLocation?: string; // Unsplash download-trigger endpoint (fired on use)
}

export interface MediaItem {
    id: string; // provider photo id (stock) or asset uuid (stored)
    source: MediaSource;
    url: string; // full-size / display url
    thumbUrl: string;
    width: number;
    height: number;
    alt?: string;
    prompt?: string; // for generated images
    attribution?: MediaAttribution;
}

// What an asset row carries beyond its columns. Source-specific: attribution and thumbUrl are
// stock, prompt/style/model/refId are generated, name is an upload's original filename.
export interface AssetMeta {
    attribution?: MediaAttribution;
    thumbUrl?: string;
    prompt?: string;
    style?: MediaGenStyle;
    model?: string;
    refId?: string; // the take this one was refined from
    name?: string;
}

// The visible credit a sourced picture carries. Resolved per artifact at read time from the assets
// it references, so a published page or an export can show it without the tree carrying provenance.
export interface MediaCredit {
    provider?: string;
    author?: string;
    authorUrl?: string;
    sourceUrl?: string;
}

// Every media reference stored in artifact content is one of these: the asset row is the only
// place provenance lives, so the tree carries an id and nothing else.
export const ASSET_PATH = "/api/media/asset/";
export const assetUrl = (id: string): string => `${ASSET_PATH}${id}`;

const ASSET_URL = /(?:^|\/)api\/media\/asset\/([0-9a-f-]{36})(?:[?#]|$)/i;

/** The asset id a canonical url points at, or null when the url is external. */
export function assetIdFromUrl(url: string | undefined): string | null {
    return (url && ASSET_URL.exec(url)?.[1]) || null;
}

// A video element may hold a platform page url rather than a media file. Those stay links: there is
// no file to adopt, and the players resolve them to an iframe at paint time. One definition, so the
// editor's player, the poster derivation, and the server-side adopter cannot drift apart.
const YOUTUBE_ID =
    /(?:youtube(?:-nocookie)?\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/;
const VIMEO_ID = /vimeo\.com\/(?:video\/)?(\d+)/;

export const youtubeId = (url: string | undefined): string | null =>
    (url && YOUTUBE_ID.exec(url)?.[1]) || null;

export const vimeoId = (url: string | undefined): string | null =>
    (url && VIMEO_ID.exec(url)?.[1]) || null;

export const isEmbedVideoUrl = (url: string): boolean => !!youtubeId(url) || !!vimeoId(url);

export interface PlayerOpts {
    controls: boolean;
    autoplay: boolean;
    loop: boolean;
    muted: boolean;
}

export interface Embed {
    id: string;
    kind: "iframe" | "file";
    src: string; // iframe: player opts baked into the URL; file: applied as <video> attributes
    opts: PlayerOpts;
}

/**
 * How a url plays: a provider iframe with the options baked into it, a file the <video> element can
 * take, or null when nothing here can play it (the surface then paints the poster). Lives at this
 * layer because the live player is in the browser and the whitelist is a security boundary both the
 * editor and the published viewer answer to.
 */
export function embedFor(
    url: string,
    opts?: Partial<PlayerOpts>,
): Pick<Embed, "kind" | "src" | "opts"> | null {
    const o: PlayerOpts = {
        controls: opts?.controls ?? true,
        autoplay: !!opts?.autoplay,
        loop: !!opts?.loop,
        muted: !!opts?.muted || !!opts?.autoplay, // browsers only allow muted autoplay
    };
    const u = url.trim();
    if (!u) return null;
    const yt = youtubeId(u);
    if (yt) {
        const p = new URLSearchParams();
        if (!o.controls) p.set("controls", "0");
        if (o.autoplay) {
            p.set("autoplay", "1");
            p.set("playsinline", "1");
        }
        if (o.muted) p.set("mute", "1");
        if (o.loop) {
            p.set("loop", "1");
            p.set("playlist", yt); // yt loops only with a playlist of the same id
        }
        const qs = p.toString();
        return {
            kind: "iframe",
            src: `https://www.youtube-nocookie.com/embed/${yt}${qs ? `?${qs}` : ""}`,
            opts: o,
        };
    }
    const vm = vimeoId(u);
    if (vm) {
        const p = new URLSearchParams();
        if (!o.controls) p.set("controls", "0");
        if (o.autoplay) p.set("autoplay", "1");
        if (o.muted) p.set("muted", "1");
        if (o.loop) p.set("loop", "1");
        const qs = p.toString();
        return {
            kind: "iframe",
            src: `https://player.vimeo.com/video/${vm}${qs ? `?${qs}` : ""}`,
            opts: o,
        };
    }
    if (/\.(mp4|webm|ogg|mov)(\?|#|$)/i.test(u)) return { kind: "file", src: u, opts: o };
    // stored clips live behind extension-less asset urls; on a video element that's a file source
    if (assetIdFromUrl(u)) return { kind: "file", src: u, opts: o };
    return null;
}

export interface MediaSearchResponse {
    items: MediaItem[];
    page: number;
    hasMore: boolean;
    providers: Record<MediaProvider, boolean>; // which providers are configured (have a key)
}

export interface MediaGenerateRequest {
    prompt: string;
    aspect?: string; // "16:9" | "4:3" | "1:1" | "3:4" | "9:16"
    n?: number; // number of variations (1–4)
    style?: MediaGenStyle; // shapes the prompt (ignored when refining)
    refId?: string; // asset id of a previous take → image-conditioned refinement
}

// each maps to a prompt prefix on the backend
export type MediaGenStyle = "photo" | "illustration" | "3d" | "line" | "watercolor";
export const MEDIA_GEN_STYLES: { label: string; value: MediaGenStyle }[] = [
    { label: "Photo", value: "photo" },
    { label: "Illustration", value: "illustration" },
    { label: "3D", value: "3d" },
    { label: "Line art", value: "line" },
    { label: "Watercolor", value: "watercolor" },
];

export interface MediaUploadRequest {
    data: string; // base64 (no data: prefix)
    mime: string;
    name?: string;
    width?: number;
    height?: number;
}

// icons are monochrome vectors re-tinted per theme; separate from the MediaItem/url path
export interface IconItem {
    id: string; // iconify id, e.g. "lucide:rocket"
}
export interface IconSearchResponse {
    icons: IconItem[];
    total: number;
}
export interface IconPick {
    id: string;
    body: string; // inner SVG markup (uses currentColor → recolorable)
    width: number;
    height: number;
}

export const MEDIA_ASPECTS: { label: string; value: string }[] = [
    { label: "16:9", value: "16:9" },
    { label: "4:3", value: "4:3" },
    { label: "1:1", value: "1:1" },
    { label: "3:4", value: "3:4" },
    { label: "9:16", value: "9:16" },
];
