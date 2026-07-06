// Media picker wire shapes — shared by the backend router (services/api/media.ts) and the app client.
// A "media item" is the normalized result the picker renders, whether it came from a stock provider, an
// AI generation, an upload, or the workspace's recent library.

// Openverse is keyless (free CC-image search, works out of the box); the rest light up once their key is
// in .env. Adding a key only unlocks a provider behind the scenes — the picker UI is unchanged.
export type MediaProvider = "openverse" | "unsplash" | "pexels" | "pixabay";
export type MediaSource = "stock" | "generated" | "upload";

// The "image-like" media kinds the picker + palette share one renderer for. Drives the search filters
// (Openverse extension/category), which sources the rail offers, and the AI-generation style. "photo" is
// the default (section backgrounds + the Image element); gif/illustration/sticker are the new tiles.
export type MediaKind = "photo" | "gif" | "illustration" | "sticker" | "icon";

// Where a picked image came from + how to credit it. Stored alongside the image so export/compliance
// survive: Unsplash and Pexels require visible attribution, and Unsplash requires a download trigger.
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
    thumbUrl: string; // grid thumbnail url
    width: number;
    height: number;
    alt?: string;
    prompt?: string; // the prompt, for generated images
    attribution?: MediaAttribution;
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
    style?: MediaGenStyle; // shapes the prompt (photo · illustration · 3d · line · watercolor)
}

// AI-generation styles offered in the Generate studio; each maps to a prompt prefix on the backend.
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

// --- icons (Iconify) ---
// Icons are monochrome vectors that adopt a theme color, so they don't flow through the MediaItem/url
// path. Search returns ids; picking one fetches its `currentColor`-based SVG body, which the Icon element
// re-tints per theme. Keyless (api.iconify.design); a premium icon provider could slot in behind this.
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

// The aspect ratios the Generate studio offers (label + the value the model understands).
export const MEDIA_ASPECTS: { label: string; value: string }[] = [
    { label: "16:9", value: "16:9" },
    { label: "4:3", value: "4:3" },
    { label: "1:1", value: "1:1" },
    { label: "3:4", value: "3:4" },
    { label: "9:16", value: "9:16" },
];
