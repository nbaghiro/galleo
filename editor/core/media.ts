import type { IconPick, MediaKind } from "@model/media";
import { clearBackgroundImage } from "@elements/ops";
import { commit, editor, requestMediaPicker } from "./store";

// Match a URL to an embeddable player source — used by the canvas video overlay.
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
    const yt = u.match(
        /(?:youtube(?:-nocookie)?\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/,
    );
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
            p.set("playlist", yt[1]!); // yt loops only with a playlist of the same id
        }
        const qs = p.toString();
        return {
            kind: "iframe",
            src: `https://www.youtube-nocookie.com/embed/${yt[1]}${qs ? `?${qs}` : ""}`,
            opts: o,
        };
    }
    const vm = u.match(/vimeo\.com\/(?:video\/)?(\d+)/);
    if (vm) {
        const p = new URLSearchParams();
        if (!o.controls) p.set("controls", "0");
        if (o.autoplay) p.set("autoplay", "1");
        if (o.muted) p.set("muted", "1");
        if (o.loop) p.set("loop", "1");
        const qs = p.toString();
        return {
            kind: "iframe",
            src: `https://player.vimeo.com/video/${vm[1]}${qs ? `?${qs}` : ""}`,
            opts: o,
        };
    }
    if (/\.(mp4|webm|ogg|mov)(\?|#|$)/i.test(u)) return { kind: "file", src: u, opts: o };
    // generated clips live behind extension-less asset urls; on a video element that's a file source
    if (/\/api\/media\/asset\//.test(u)) return { kind: "file", src: u, opts: o };
    return null;
}

// Open the host media picker for a URL-delivering asset (image/video/…). Pass onRemove when a value is
// already set so the picker offers a "Remove" action.
export function pickMedia(
    onPick: (url: string) => void,
    kind?: MediaKind,
    onRemove?: () => void,
): void {
    requestMediaPicker({ onPick, kind, onRemove });
}

// Open the host media picker for an icon glyph.
export function pickIcon(onPickIcon: (icon: IconPick) => void): void {
    requestMediaPicker({ kind: "icon", onPick: () => {}, onPickIcon });
}

// Pick + set (or remove) the document-level backdrop image (behind all sections).
export function pickArtifactBackground(): void {
    const bg = editor.artifact.background;
    pickMedia(
        (url) =>
            commit({
                ...editor.artifact,
                background: { ...bg, kind: "image", image: url },
            }),
        "photo",
        bg?.image
            ? () => commit({ ...editor.artifact, background: clearBackgroundImage(bg) })
            : undefined,
    );
}
