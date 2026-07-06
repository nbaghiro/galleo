import { createSignal } from "solid-js";
import type { IconPick, MediaKind } from "@model/media";

// The shared media-picker's open state. A picker request carries the callback that receives the chosen
// image url and an optional starting search query (seeded from the surrounding content). Mounted once at
// the app root (like the theme drawer); opened from any image-selection point in the editor via the
// `requestMediaPicker` bridge in @editor/editor.

export interface MediaPickRequest {
    onPick: (url: string) => void;
    onPickIcon?: (icon: IconPick) => void; // icon kind delivers a themed-glyph descriptor, not a url
    query?: string;
    kind?: MediaKind; // which media the picker opens for (photo · gif · illustration · sticker · icon)
}

const [mediaRequest, setMediaRequest] = createSignal<MediaPickRequest | null>(null);
export { mediaRequest };

export function openMediaPicker(req: MediaPickRequest): void {
    setMediaRequest(req);
}

export function closeMediaPicker(): void {
    setMediaRequest(null);
}

// Deliver the chosen url to the opener and close.
export function pickMedia(url: string): void {
    mediaRequest()?.onPick(url);
    setMediaRequest(null);
}

// Deliver a chosen icon (themed-glyph descriptor) to the opener and close.
export function pickMediaIcon(icon: IconPick): void {
    mediaRequest()?.onPickIcon?.(icon);
    setMediaRequest(null);
}
