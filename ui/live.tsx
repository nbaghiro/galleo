import type { Component } from "solid-js";
import { createEffect, createMemo, createSignal, For, Show } from "solid-js";
import type { Rect, Region } from "@engine/node";
import type { ArtifactContent, ElementAddress } from "@model/artifact";
import type { FormatDescriptor } from "@model/geometry";
import type { PlayerOpts } from "@model/media";
import type { Tokens } from "@themes";
import { elementRegionId, parseHitRegion, parseTarget, sectionLinkId } from "@model/artifact";
import { embedFor } from "@model/media";
import { liveElements, type LiveElement } from "@elements/ops";
import { sectionContentTokens } from "@elements/compose";
import { panelHugWidth, panelNode, panelWidth, popupData } from "@elements/composite/popup";
import { ctxFor, layoutNode, measureText } from "@canvas/render/commands";
import { paint } from "@canvas/render/backends";
import { Popover } from "./overlay";

// Real DOM anchored over a painted region: the one thing the engine structurally cannot host, since
// a player is a live element and the engine emits flat draw commands. The layer walks the content
// for element types that registered here, finds each one's painted box, and mounts the component
// absolutely over it. Every surface uses the same layer, which is what makes a published video play.

export type LiveSurface = "editor" | "present" | "publish";

export interface LiveProps {
    data: Record<string, unknown>;
    // the element's own address, for a component that composes addressed children (the popup panel)
    address: ElementAddress;
    box: Rect;
    radius?: number;
    surface: LiveSurface;
    selected?: boolean;
    // resolved for the element's own section, so a component that composes engine nodes of its own
    // (the popup's panel) paints what the canvas beneath it would have
    theme: Tokens;
    format: FormatDescriptor;
    // a component that paints anchors of its own into a portal is outside the host's click
    // delegation, so an internal `#section` link is handed back here instead of navigating
    onSectionLink?: (sectionId: string) => void;
}

const registry = new Map<string, Component<LiveProps>>();

export function registerLive(type: string, component: Component<LiveProps>): void {
    registry.set(type, component);
}

export const liveComponentFor = (type: string): Component<LiveProps> | undefined =>
    registry.get(type);

const bool = (v: unknown): boolean | undefined => (typeof v === "boolean" ? v : undefined);
const str = (v: unknown): string => (typeof v === "string" ? v : "");

const playerOpts = (d: Record<string, unknown>): Partial<PlayerOpts> => ({
    controls: bool(d.controls),
    autoplay: bool(d.autoplay),
    loop: bool(d.loop),
    muted: bool(d.muted),
});

// In the editor a player is inert until its element is selected, so a click on an idle one selects
// it rather than starting playback. In playback it is always live.
const live = (props: LiveProps): "auto" | "none" =>
    props.surface !== "editor" || props.selected ? "auto" : "none";

const Player: Component<LiveProps & { url: string }> = (props) => {
    const embed = createMemo(() => embedFor(props.url, playerOpts(props.data)));
    return (
        <Show when={embed()}>
            {(e) => (
                <Show
                    when={e().kind === "iframe"}
                    fallback={
                        <video
                            src={e().src}
                            controls={e().opts.controls}
                            autoplay={e().opts.autoplay}
                            loop={e().opts.loop}
                            muted={e().opts.muted}
                            playsinline
                            class="h-full w-full bg-black object-cover"
                            style={{ "pointer-events": live(props) }}
                        />
                    }
                >
                    <iframe
                        src={e().src}
                        title="Embedded video"
                        class="h-full w-full border-0 bg-black"
                        style={{ "pointer-events": live(props) }}
                        allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                        allowfullscreen
                    />
                </Show>
            )}
        </Show>
    );
};

registerLive("video", (props) => <Player {...props} url={str(props.data.src)} />);

// An embed only ever becomes an iframe for a provider `embedFor` whitelists; anything else keeps
// the painted link card, which is the whole static fallback.
registerLive("embed", (props) => {
    const url = (): string => str(props.data.url);
    return (
        <Show when={embedFor(url())?.kind === "iframe"}>
            <Player {...props} url={url()} />
        </Show>
    );
});

const PANEL_MARGIN = 12; // viewport slack the floating panel keeps on either side

// The trigger paints in flow like any other element; this covers it and floats the authored panel
// subtree, laid out again and painted into a portal where nothing can clip it.
const Popup: Component<LiveProps> = (props) => {
    const [open, setOpen] = createSignal(false);
    const [host, setHost] = createSignal<HTMLDivElement | null>(null);
    let anchor: HTMLDivElement | undefined;
    const laid = createMemo(() => {
        if (!open()) return null;
        const data = popupData(props.data);
        const max = panelWidth(window.innerWidth - PANEL_MARGIN * 2);
        const node = panelNode(data, ctxFor(max, props.theme, props.format), props.address);
        const w = panelHugWidth(data, node, measureText, window.innerWidth - PANEL_MARGIN * 2);
        return { w, ...layoutNode(node, w, measureText) };
    });
    createEffect(() => {
        const l = laid();
        const el = host();
        if (l && el) paint(l.commands, el);
    });
    const toggle = (): void => {
        setOpen((v) => !v);
    };
    // The panel is painted into a portal, so the surface's own delegate never sees these anchors.
    // Following one is leaving the menu either way: an external link still opens its own tab, an
    // internal one moves the page instead of navigating.
    const onPanelClick = (e: MouseEvent): void => {
        const a = (e.target as Element | null)?.closest?.("a");
        if (!a) return;
        setOpen(false);
        const id = sectionLinkId(a.getAttribute("href"));
        if (!id) return;
        e.preventDefault();
        props.onSectionLink?.(id);
    };
    return (
        <>
            <div
                ref={anchor}
                role="button"
                tabindex="0"
                aria-expanded={open()}
                class="h-full w-full cursor-pointer"
                style={{ "pointer-events": "auto" }}
                onClick={toggle}
                onKeyDown={(e) => {
                    if (e.key !== "Enter" && e.key !== " ") return;
                    e.preventDefault();
                    toggle();
                }}
            />
            <Popover
                bare
                open={open()}
                onClose={() => setOpen(false)}
                anchor={() => anchor}
                fixedWidth={laid()?.w}
                estHeight={laid()?.height}
            >
                <div
                    ref={setHost}
                    onClick={onPanelClick}
                    style={{
                        width: `${laid()?.w ?? 0}px`,
                        height: `${laid()?.height ?? 0}px`,
                    }}
                />
            </Popover>
        </>
    );
};

registerLive("popup", (props) => (
    // in the editor the click is the affordance that sets the stored default, so nothing overlays it
    <Show when={props.surface !== "editor"}>
        <Popup {...props} />
    </Show>
));

const LiveItem: Component<{
    item: LiveElement;
    regions: () => Region[];
    surface: LiveSurface;
    theme: Tokens;
    format: FormatDescriptor;
    selectedId?: () => string | null;
    offsetY?: (regionId: string) => number;
    onSectionLink?: (sectionId: string) => void;
}> = (props) => {
    // A paged surface recovers its regions from painted commands, and a popup's own wrapper paints
    // nothing — its trigger carries the `hit:` id, and that box is the one to anchor to anyway.
    const region = createMemo(() => {
        const rs = props.regions();
        return (
            rs.find((r) => r.id === props.item.id) ??
            rs.find((r) => {
                const hit = parseHitRegion(r.id);
                return !!hit && elementRegionId(hit.address) === props.item.id;
            }) ??
            null
        );
    });
    const Live = liveComponentFor(props.item.type);
    if (!Live) return null;
    const shift = (): number => props.offsetY?.(props.item.id) ?? 0;
    return (
        <Show when={region()}>
            {(r) => (
                <div
                    data-live={props.item.type}
                    class="absolute overflow-hidden"
                    style={{
                        left: `${r().box.x}px`,
                        top: `${r().box.y}px`,
                        width: `${r().box.w}px`,
                        height: `${r().box.h}px`,
                        "border-radius": `${r().radius ?? 8}px`,
                        "pointer-events": "none",
                        ...(shift() ? { transform: `translateY(${shift()}px)` } : {}),
                    }}
                >
                    <Live
                        data={props.item.data}
                        address={props.item.address}
                        box={r().box}
                        radius={r().radius}
                        surface={props.surface}
                        theme={props.theme}
                        format={props.format}
                        selected={props.selectedId?.() === props.item.id}
                        onSectionLink={props.onSectionLink}
                    />
                </div>
            )}
        </Show>
    );
};

export const LiveLayer: Component<{
    content: ArtifactContent;
    regions: () => Region[];
    surface: LiveSurface;
    theme: Tokens;
    format: FormatDescriptor;
    selectedId?: () => string | null;
    // playback only: how far the layer an element sits on has been carried by a pin
    offsetY?: (regionId: string) => number;
    onSectionLink?: (sectionId: string) => void;
}> = (props) => {
    // Identity-cached per element: a repaint hands back an equal-but-new descriptor, and a fresh
    // one through <For> would remount the player and restart playback.
    let cache = new Map<string, LiveElement>();
    const items = createMemo((): LiveElement[] => {
        const next = new Map<string, LiveElement>();
        const out: LiveElement[] = [];
        for (const el of liveElements(props.content)) {
            if (!registry.has(el.type)) continue;
            const prev = cache.get(el.id);
            const item = prev && prev.type === el.type && prev.data === el.data ? prev : el;
            next.set(el.id, item);
            out.push(item);
        }
        cache = next;
        return out;
    });
    // the section's contrast swap, so a panel opened from a dark band paints in that band's tokens
    const themeFor = (id: string): Tokens => {
        const t = parseTarget(id);
        const section =
            t?.kind === "element"
                ? props.content.sections.find((s) => s.id === t.address.section)
                : undefined;
        return section ? sectionContentTokens(section, props.theme) : props.theme;
    };
    return (
        <For each={items()}>
            {(item) => (
                <LiveItem
                    item={item}
                    regions={props.regions}
                    surface={props.surface}
                    theme={themeFor(item.id)}
                    format={props.format}
                    selectedId={props.selectedId}
                    offsetY={props.offsetY}
                    onSectionLink={props.onSectionLink}
                />
            )}
        </For>
    );
};
