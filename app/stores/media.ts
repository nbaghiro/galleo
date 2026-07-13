import { createSignal } from "solid-js";
import type { IconPick, MediaKind } from "@model/media";

export interface MediaPickRequest {
    onPick: (url: string) => void;
    onPickIcon?: (icon: IconPick) => void; // icon kind delivers a themed-glyph descriptor, not a url
    query?: string;
    kind?: MediaKind;
}

const [mediaRequest, setMediaRequest] = createSignal<MediaPickRequest | null>(null);
export { mediaRequest };

export function openMediaPicker(req: MediaPickRequest): void {
    setMediaRequest(req);
}

export function closeMediaPicker(): void {
    setMediaRequest(null);
}

export function pickMedia(url: string): void {
    mediaRequest()?.onPick(url);
    setMediaRequest(null);
}

export function pickMediaIcon(icon: IconPick): void {
    mediaRequest()?.onPickIcon?.(icon);
    setMediaRequest(null);
}
