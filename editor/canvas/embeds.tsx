import type { Component } from "solid-js";
import { createMemo, For, Show } from "solid-js";
import type { ElementInstance, Section } from "@model/artifact";
import type { ElementAddress } from "@model/target";
import { elementRegionId } from "@model/target";
import { editor, regions, selection } from "../editor";

// Live media players overlaid on the engine-painted placeholders in the editing canvas. The engine is
// DOM-free — it paints a static poster (reused for present + PDF/PNG export); here in the DOM editor we
// mount a real <iframe>/<video> at each video element's region so the video actually plays. The overlay
// is click-through until the element is selected, so selection + drag still work; once selected the
// player becomes interactive. Anything we can't embed falls back to the painted placeholder.

interface Embed {
    id: string;
    kind: "iframe" | "file";
    src: string;
}

// Parse a video URL into an embeddable source, or null if we don't recognize it.
function embedFor(url: string): Pick<Embed, "kind" | "src"> | null {
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

// Visit each element in a section paired with its address — mirrors how compose tags region ids, so
// `elementRegionId(addr)` here matches the region the engine emitted.
function walkAddressed(
    section: Section,
    visit: (el: ElementInstance, addr: ElementAddress) => void,
): void {
    const recurse = (el: ElementInstance | undefined, addr: ElementAddress): void => {
        if (!el) return;
        visit(el, addr);
        const kids = (el.data as { children?: ElementInstance[] }).children;
        if (Array.isArray(kids))
            kids.forEach((k, i) => recurse(k, { ...addr, path: [...addr.path, i] }));
    };
    recurse(section.root, { section: section.id, path: [] });
}

export const VideoEmbeds: Component = () => {
    // Reuse the same Embed object across runs when a video's id + src are unchanged, so an edit
    // elsewhere in the artifact doesn't hand <For> new references and remount (reload) every player.
    let cache = new Map<string, Embed>();
    const embeds = createMemo((): Embed[] => {
        const next = new Map<string, Embed>();
        const out: Embed[] = [];
        for (const section of editor.artifact.sections)
            walkAddressed(section, (el, addr) => {
                if (el.type !== "video") return;
                const e = embedFor((el.data as { url?: string }).url ?? "");
                if (!e) return;
                const id = elementRegionId(addr);
                const prev = cache.get(id);
                const item = prev && prev.src === e.src ? prev : { id, ...e };
                next.set(id, item);
                out.push(item);
            });
        cache = next;
        return out;
    });
    const selected = (id: string): boolean => {
        const s = selection();
        return s?.kind === "element" && elementRegionId(s.address) === id;
    };
    return (
        <For each={embeds()}>
            {(embed) => {
                const region = createMemo(() => regions().find((r) => r.id === embed.id) ?? null);
                return (
                    <Show when={region()}>
                        {(r) => {
                            // Interactive only when selected, so a click on an idle player passes
                            // through to the canvas and selects it (rather than starting playback).
                            const pe = (): "auto" | "none" =>
                                selected(embed.id) ? "auto" : "none";
                            return (
                                <div
                                    class="absolute overflow-hidden"
                                    style={{
                                        left: `${r().box.x}px`,
                                        top: `${r().box.y}px`,
                                        width: `${r().box.w}px`,
                                        height: `${r().box.h}px`,
                                        "border-radius": `${r().radius ?? 8}px`,
                                        "pointer-events": "none",
                                    }}
                                >
                                    <Show
                                        when={embed.kind === "iframe"}
                                        fallback={
                                            <video
                                                src={embed.src}
                                                controls
                                                class="h-full w-full bg-black"
                                                style={{ "pointer-events": pe() }}
                                            />
                                        }
                                    >
                                        <iframe
                                            src={embed.src}
                                            title="Embedded video"
                                            class="h-full w-full border-0 bg-black"
                                            style={{ "pointer-events": pe() }}
                                            allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                                            allowfullscreen
                                        />
                                    </Show>
                                </div>
                            );
                        }}
                    </Show>
                );
            }}
        </For>
    );
};
