import type { Component, JSX } from "solid-js";
import { createEffect, createMemo, createSignal, For, Show } from "solid-js";
import type { Rect, Region } from "@engine/node";
import type { ArtifactContent, ElementAddress } from "@model/artifact";
import type { FormatDescriptor } from "@model/geometry";
import type { PlayerOpts } from "@model/media";
import type { Tokens } from "@themes";
import {
    elementRegionId,
    parseHitRegion,
    parseInputRegion,
    parseTarget,
    sectionLinkId,
} from "@model/artifact";
import { embedFor } from "@model/media";
import { fontStack } from "@themes";
import { liveElements, type LiveElement } from "@elements/ops";
import { composeElement, sectionContentTokens } from "@elements/compose";
import { panelHugWidth, panelNode, panelWidth, popupData } from "@elements/composite/popup";
import { FORM_TYPES, coerceField, splitOptions } from "@elements/form/element";
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
    // wired -> a form's inputs go live and its submit posts here; absent -> the paint stands alone,
    // which is what keeps forms static in the editor, in Present, and in every export
    submit?: (values: Record<string, string>) => Promise<boolean>;
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
                            // a clip nobody has pressed play on costs its metadata, not its bytes
                            preload={e().opts.autoplay ? "auto" : "metadata"}
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

// media covers every kind, but only a clip plays; `liveElements` filters the rest out already
registerLive("media", (props) => <Player {...props} url={str(props.data.src)} />);

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

// Real inputs over the painted form: the element's own compose run gives every `input:` region and
// the 18px marks, so one layout source places both the paint and the controls. Active only when a
// host wired `submit`, which only publish does.
const FormLive: Component<LiveProps & { type: string }> = (props) => {
    const [state, setState] = createSignal<"idle" | "busy" | "done" | "failed">("idle");
    const [values, setValues] = createSignal<Record<string, string>>({});
    const [missing, setMissing] = createSignal<ReadonlySet<string>>(new Set());
    const formId = (): string => elementRegionId(props.address);
    const laid = createMemo(() => {
        const node = composeElement(
            { type: props.type, data: props.data },
            ctxFor(props.box.w, props.theme, props.format),
            props.address,
        );
        return layoutNode(node, props.box.w, measureText);
    });
    const children = (): { type: string; data: unknown }[] =>
        Array.isArray(props.data.children)
            ? (props.data.children as { type: string; data: unknown }[])
            : [];
    interface Slot {
        key: string;
        box: Rect;
        field: ReturnType<typeof coerceField> | null; // null = the submit button
        marks: Rect[]; // checkbox/choice: the painted 18px squares inside the block
    }
    const slots = createMemo((): Slot[] => {
        const fid = formId();
        const out: Slot[] = [];
        for (const r of laid().regions) {
            const inner = parseInputRegion(r.id);
            if (!inner) continue;
            if (inner === fid) {
                out.push({ key: inner, box: r.box, field: null, marks: [] });
                continue;
            }
            const idx = Number(inner.slice(fid.length + 1));
            const child = children()[idx];
            if (!child || child.type !== "field") continue;
            const field = coerceField(child.data);
            const marks =
                field.kind === "checkbox" || field.kind === "choice"
                    ? laid()
                          .commands.filter(
                              (c) =>
                                  c.kind === "rect" &&
                                  c.box.w === 18 &&
                                  c.box.h === 18 &&
                                  c.box.y >= r.box.y &&
                                  c.box.y <= r.box.y + r.box.h,
                          )
                          .map((c) => c.box)
                    : [];
            out.push({ key: inner, box: r.box, field, marks });
        }
        return out;
    });
    const write = (key: string, v: string): void => {
        setValues((cur) => ({ ...cur, [key]: v }));
    };
    const doSubmit = async (): Promise<void> => {
        if (!props.submit || state() === "busy" || state() === "done") return;
        const holes = new Set<string>();
        const payload: Record<string, string> = {};
        for (const s of slots()) {
            if (!s.field) continue;
            const v = (values()[s.key] ?? "").trim();
            if (s.field.required && !v) holes.add(s.key);
            if (v) payload[s.field.label || s.field.kind] = v;
        }
        setMissing(holes);
        if (holes.size) return;
        const hp = values()._hp;
        if (hp) payload._hp = hp;
        setState("busy");
        const ok = await props.submit(payload).catch(() => false);
        setState(ok ? "done" : "failed");
    };
    const font = (): string => fontStack("ui", props.theme);
    const boxStyle = (s: Slot): JSX.CSSProperties => ({
        position: "absolute",
        left: `${s.box.x}px`,
        top: `${s.box.y}px`,
        width: `${s.box.w}px`,
        height: `${s.box.h}px`,
        "pointer-events": "auto",
        "font-family": font(),
        "font-size": "14px",
        color: props.theme.ink,
        background: props.theme.surface,
        border: `1px solid ${missing().has(s.key) ? props.theme.accent : props.theme.line}`,
        "border-radius": `${Math.max(4, Math.min(10, Math.round(props.theme.radius)))}px`,
        padding: "0 12px",
        outline: "none",
    });
    const control = (s: Slot): JSX.Element => {
        const f = s.field!;
        if (f.kind === "textarea")
            return (
                <textarea
                    style={{ ...boxStyle(s), padding: "10px 12px", resize: "none" }}
                    placeholder={f.placeholder ?? ""}
                    aria-label={f.label}
                    onInput={(e) => write(s.key, e.currentTarget.value)}
                />
            );
        if (f.kind === "select")
            return (
                <select
                    style={boxStyle(s)}
                    aria-label={f.label}
                    onChange={(e) => write(s.key, e.currentTarget.value)}
                >
                    <option value="">{f.placeholder ?? ""}</option>
                    <For each={splitOptions(f.options)}>
                        {(o) => <option value={o}>{o}</option>}
                    </For>
                </select>
            );
        if (f.kind === "checkbox" || f.kind === "choice") {
            const opts = f.kind === "checkbox" ? [f.label] : splitOptions(f.options);
            return (
                <For each={s.marks}>
                    {(m, i) => (
                        <input
                            type={f.kind === "checkbox" ? "checkbox" : "radio"}
                            name={s.key}
                            aria-label={opts[i()] ?? f.label}
                            style={{
                                position: "absolute",
                                left: `${m.x}px`,
                                top: `${m.y}px`,
                                width: `${m.w}px`,
                                height: `${m.h}px`,
                                margin: "0",
                                "pointer-events": "auto",
                                "accent-color": props.theme.accent,
                            }}
                            onChange={(e) => {
                                if (f.kind === "checkbox")
                                    write(s.key, e.currentTarget.checked ? "Yes" : "");
                                else write(s.key, opts[i()] ?? "");
                            }}
                        />
                    )}
                </For>
            );
        }
        const type = f.kind === "email" ? "email" : f.kind === "phone" ? "tel" : "text";
        return (
            <input
                type={type}
                style={boxStyle(s)}
                placeholder={f.placeholder ?? ""}
                aria-label={f.label}
                onInput={(e) => write(s.key, e.currentTarget.value)}
            />
        );
    };
    return (
        <Show when={props.submit}>
            <Show
                when={state() !== "done"}
                fallback={
                    <div
                        style={{
                            position: "absolute",
                            inset: "0",
                            display: "flex",
                            "align-items": "center",
                            "justify-content": "center",
                            "font-family": font(),
                            "font-size": "15px",
                            color: props.theme.ink,
                            background: props.theme.surface,
                            border: `1px solid ${props.theme.line}`,
                            "border-radius": `${Math.max(4, Math.min(10, Math.round(props.theme.radius)))}px`,
                            "pointer-events": "auto",
                        }}
                    >
                        {str(props.data.success) || "Thanks, your response is in."}
                    </div>
                }
            >
                <For each={slots()}>
                    {(s) =>
                        s.field ? (
                            control(s)
                        ) : (
                            <button
                                style={{
                                    position: "absolute",
                                    left: `${s.box.x}px`,
                                    top: `${s.box.y}px`,
                                    width: `${s.box.w}px`,
                                    height: `${s.box.h}px`,
                                    "pointer-events": "auto",
                                    "font-family": font(),
                                    "font-size": "14px",
                                    "font-weight": "600",
                                    color: props.theme.onAccent,
                                    background: props.theme.accent,
                                    border: "none",
                                    "border-radius": `${Math.max(4, Math.min(10, Math.round(props.theme.radius)))}px`,
                                    cursor: "pointer",
                                    opacity: state() === "busy" ? 0.7 : 1,
                                }}
                                onClick={() => void doSubmit()}
                            >
                                {state() === "failed"
                                    ? "Try again"
                                    : str(props.data.submitLabel) || "Submit"}
                            </button>
                        )
                    }
                </For>
                <input
                    type="text"
                    name="website"
                    tabindex="-1"
                    aria-hidden="true"
                    autocomplete="off"
                    style={{ position: "absolute", left: "-9999px", width: "1px", height: "1px" }}
                    onInput={(e) => write("_hp", e.currentTarget.value)}
                />
            </Show>
        </Show>
    );
};

for (const t of FORM_TYPES) registerLive(t, (props) => <FormLive {...props} type={t} />);

const LiveItem: Component<{
    item: LiveElement;
    regions: () => Region[];
    surface: LiveSurface;
    theme: Tokens;
    format: FormatDescriptor;
    selectedId?: () => string | null;
    offsetY?: (regionId: string) => number;
    onSectionLink?: (sectionId: string) => void;
    onFormSubmit?: (elementId: string, values: Record<string, string>) => Promise<boolean>;
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
                        submit={
                            props.onFormSubmit &&
                            ((values) => props.onFormSubmit!(props.item.id, values))
                        }
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
    onFormSubmit?: (elementId: string, values: Record<string, string>) => Promise<boolean>;
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
                    onFormSubmit={props.onFormSubmit}
                />
            )}
        </For>
    );
};
