import { createSignal } from "solid-js";
import { capture } from "@ui/analytics";
import type { IconPick, MediaItem, MediaKind } from "@model/media";

export interface MediaPickRequest {
    onPick: (url: string, item?: MediaItem, kind?: MediaKind) => void; // item present when picked from the browser (carries the poster/thumb)
    onPickIcon?: (icon: IconPick) => void; // icon kind delivers a themed-glyph descriptor, not a url
    onRemove?: () => void; // present when a value is already set → picker offers a "Remove" action
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

export function pickMedia(url: string, item?: MediaItem, kind?: MediaKind): void {
    // `source` is what the picker resolved it from, which is the question: does anyone use stock,
    // or is everything generated. Generation cost itself rides ai_action_*.
    capture("media_inserted", {
        source: item?.source ?? "link",
        kind: kind ?? mediaRequest()?.kind ?? "photo",
    });
    mediaRequest()?.onPick(url, item, kind);
    setMediaRequest(null);
}

export function pickMediaIcon(icon: IconPick): void {
    capture("media_inserted", { source: "icon", kind: "icon" });
    mediaRequest()?.onPickIcon?.(icon);
    setMediaRequest(null);
}

export function removeMedia(): void {
    mediaRequest()?.onRemove?.();
    setMediaRequest(null);
}
