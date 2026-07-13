import type { Component } from "solid-js";
import { createMemo, For, Show } from "solid-js";
import type { ElementInstance, Section } from "@model/artifact";
import type { ElementAddress } from "@model/target";
import { elementRegionId } from "@model/target";
import { editor, regions, selection } from "../editor";

interface Embed {
    id: string;
    kind: "iframe" | "file";
    src: string;
}

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

// Visit each element with its address — must mirror how compose tags region ids so elementRegionId matches.
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
    // Reuse the Embed object when id + src are unchanged, so an unrelated edit doesn't hand <For> new refs and reload every player.
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
                            // Interactive only when selected, so a click on an idle player selects it instead of starting playback.
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
