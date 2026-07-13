// media picker wire shapes, shared by services + the app client

// Openverse is keyless; the rest need a key in .env
export type MediaProvider = "openverse" | "unsplash" | "pexels" | "pixabay";
export type MediaSource = "stock" | "generated" | "upload";

// "photo" is the default (backgrounds + the Image element)
export type MediaKind = "photo" | "gif" | "illustration" | "sticker" | "icon";

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
    style?: MediaGenStyle; // shapes the prompt
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
