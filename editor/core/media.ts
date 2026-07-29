import type { IconPick, MediaKind } from "@model/media";
import { requestMediaPicker } from "./store";

// Match a URL to an embeddable player source — used by the canvas video overlay.
export interface Embed {
    id: string;
    kind: "iframe" | "file";
    src: string;
}

export function embedFor(url: string): Pick<Embed, "kind" | "src"> | null {
    const u = url.trim();
    if (!u) return null;
    const yt = u.match(
        /(?:youtube(?:-nocookie)?\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/,
    );
    if (yt) return { kind: "iframe", src: `https://www.youtube-nocookie.com/embed/${yt[1]}` };
    const vm = u.match(/vimeo\.com\/(?:video\/)?(\d+)/);
    if (vm) return { kind: "iframe", src: `https://player.vimeo.com/video/${vm[1]}` };
    if (/\.(mp4|webm|ogg|mov)(\?|#|$)/i.test(u)) return { kind: "file", src: u };
    return null;
}

// Open the host media picker for a URL-delivering asset (image/video/…).
export function pickMedia(onPick: (url: string) => void, kind?: MediaKind): void {
    requestMediaPicker({ onPick, kind });
}

// Open the host media picker for an icon glyph.
export function pickIcon(onPickIcon: (icon: IconPick) => void): void {
    requestMediaPicker({ kind: "icon", onPick: () => {}, onPickIcon });
}
