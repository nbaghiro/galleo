import type { Component } from "solid-js";
import { createEffect, createMemo, createSignal, For, onCleanup, Show } from "solid-js";
import type { Rect } from "@engine/node";
import type { ElementAddress } from "@model/artifact";
import { elementRegionId, sectionRegionId } from "@model/artifact";
import type { CommentDto, CommentThread } from "@model/comments";
import { anchorElementId, anchorStateOf, isDegraded, isResolved } from "@model/comments";
import { elementIdMap } from "@elements/ops";
import { profileFor } from "@engine/profile";
import { sectionLayoutWidth } from "@canvas/render/backends";
import type { RunLayout } from "@canvas/render/commands";
import { layoutRuns, measureContext } from "@canvas/render/commands";
import { Avatar } from "@ui/avatar";
import { Badge, Button, Eyebrow, IconButton } from "@ui/button";
import { Icon } from "@ui/icons";
import { TextArea } from "@ui/inputs";
import { Menu, MenuItem } from "@ui/menu";
import { FloatingPanel, Sheet } from "@ui/overlay";
import { relativeTime } from "@ui/time";
import { dismissalFor } from "@ui/gesture";
import { isPhone } from "@ui/viewport";
import {
    canvasContentWidth,
    editing,
    editor,
    editorAccent,
    regions,
    selection,
    stageEl,
} from "@editor/core/store";
import { drag } from "@editor/core/dnd";
import { liveEdit } from "./Selection";
import { paintedLeafFor } from "@editor/core/leaf";
import { textSelection } from "@editor/core/text";
import {
    activeThreadId,
    applyCommentMark,
    cancelCommentDraft,
    captureAnchor,
    commentDraft,
    commentMarkRanges,
    commentableAt,
    commentsAvailable,
    createComment,
    deleteComment,
    dropCommentMark,
    editComment,
    expandThread,
    replyToThread,
    resolveThread,
    setActiveThreadId,
    setHeldSection,
    setHoveredSection,
    heldSection,
    hoveredSection,
    markersRevealed,
    sectionAtY,
    chipAt,
    lineOfOffset,
    lineTop,
    markerX,
    panelAt,
    placeMarkers,
    rangeRects,
    startCommentDraft,
    threadAddress,
    threads,
    type MarkerRequest,
} from "@editor/core/comments";

const PANEL_W = 320;
const PANEL_MAX_H = 400; // matches max-h-100 on the panel itself
const MARKER_INSET = 8; // a marker with no painted element sits just below its section's top edge

const authorName = (c: CommentDto): string => c.author?.name ?? "Someone";

// Where a thread's marker and tint can be drawn: the element's painted box when the section is
// materialized, otherwise just the section's own geometry so the marker still has a home. The run
// layout is resolved once per paint here, since both the marker's y and the tint rects need it.
interface ThreadSpot {
    thread: CommentThread;
    sectionRight: number;
    y: number;
    box?: Rect;
    address: ElementAddress;
    layout?: RunLayout;
    ranges: { from: number; to: number }[];
}

export const CommentLayer: Component = () => {
    const regionMap = createMemo(() => new Map(regions().map((r) => [r.id, r])));
    const ids = createMemo(() => elementIdMap(editor.artifact));
    const stageW = (): number => canvasContentWidth();

    // section right edges without a region, so an unpainted section still places its markers
    const sectionRight = (sectionId: string): number => {
        const painted = regionMap().get(sectionRegionId(sectionId))?.box;
        if (painted) return painted.x + painted.w;
        const art = editor.artifact;
        const i = art.sections.findIndex((s) => s.id === sectionId);
        const section = art.sections[i];
        if (!section) return stageW();
        const layoutW = sectionLayoutWidth(section, profileFor(art), stageW());
        return Math.round((stageW() - layoutW) / 2) + layoutW;
    };

    const sectionTop = (sectionId: string): number => {
        const i = editor.artifact.sections.findIndex((s) => s.id === sectionId);
        return (editor.sectionTops[i] ?? 0) + MARKER_INSET;
    };

    // Every thread has a marker now, resolved ones included: the markers only appear on hover, so a
    // resolved thread costs nothing on screen and there is no rail left to reach it from.
    const shown = createMemo(() => threads());

    // Threads whose element is gone, by the section they were written in. They have no anchor to sit
    // beside, so the section's border carries one stacked marker for the lot: the data stays reachable.
    const orphans = createMemo((): Map<string, CommentThread[]> => {
        const out = new Map<string, CommentThread[]>();
        for (const thread of shown()) {
            if (ids().has(anchorElementId(thread.root.anchor))) continue;
            const list = out.get(thread.root.sectionId);
            if (list) list.push(thread);
            else out.set(thread.root.sectionId, [thread]);
        }
        return out;
    });

    const spots = createMemo((): ThreadSpot[] => {
        const out: ThreadSpot[] = [];
        for (const thread of shown()) {
            const address = ids().get(anchorElementId(thread.root.anchor));
            if (!address) continue; // orphaned: the section's stack is its home
            const section = address.section;
            const box = regionMap().get(elementRegionId(address))?.box;
            const ranges = commentMarkRanges(thread);
            const layout = box && ranges.length ? runLayoutFor(address, box.w) : null;
            const line = layout && ranges[0] ? lineOfOffset(layout, ranges[0].from) : 0;
            out.push({
                thread,
                sectionRight: sectionRight(section),
                y: box ? box.y + (layout ? lineTop(layout, line) : 0) : sectionTop(section),
                ...(box ? { box } : {}),
                address,
                ...(layout ? { layout } : {}),
                ranges,
            });
        }
        return out;
    });

    // The pointer against the section bands, read off the stage rather than off the painted boxes:
    // the markers sit in the margin beside a section, and a reveal that stopped at the box edge
    // would close before the pointer got there.
    createEffect(() => {
        const stage = stageEl();
        if (!stage) return;
        const move = (e: PointerEvent): void => {
            const r = stage.getBoundingClientRect();
            setHoveredSection(
                sectionAtY(
                    editor.sectionTops,
                    editor.artifact.sections.map((s) => s.id),
                    e.clientY - r.top,
                    r.height,
                ),
            );
        };
        const leave = (): void => {
            setHoveredSection(null);
        };
        stage.addEventListener("pointermove", move);
        stage.addEventListener("pointerleave", leave);
        onCleanup(() => {
            stage.removeEventListener("pointermove", move);
            stage.removeEventListener("pointerleave", leave);
        });
    });

    // an open thread holds its own section open, so the panel never sits beside a vanished marker
    const activeSection = createMemo((): string | null => {
        const id = activeThreadId();
        const thread = id ? shown().find((t) => t.root.id === id) : null;
        if (!thread) return null;
        return ids().get(anchorElementId(thread.root.anchor))?.section ?? thread.root.sectionId;
    });

    const revealed = (sectionId: string): boolean =>
        markersRevealed(sectionId, {
            hovered: hoveredSection(),
            held: [heldSection(), activeSection()],
            hoverless: isPhone(),
        });

    const placed = createMemo(() => {
        const requests: MarkerRequest[] = spots()
            .filter((s) => revealed(s.address.section))
            .map((s) => ({
                id: s.thread.root.id,
                y: s.y,
                sectionRight: s.sectionRight,
            }));
        return placeMarkers(requests, stageW());
    });

    const byThread = createMemo(() => new Map(placed().map((m) => [m.id, m])));
    const spotOf = (id: string): ThreadSpot | undefined =>
        spots().find((s) => s.thread.root.id === id);

    const active = createMemo(() => {
        const id = activeThreadId();
        if (!id) return null;
        const at = byThread().get(id);
        const spot = spotOf(id);
        return at && spot ? { spot, at } : null;
    });

    // An orphaned thread has no element to sit beside, so its panel opens at the stack that holds
    // it. Without this, opening one from the stack would set the active thread and show nothing.
    const orphanActive = createMemo(() => {
        const id = activeThreadId();
        if (!id) return null;
        for (const [sectionId, list] of orphans()) {
            const thread = list.find((t) => t.root.id === id);
            if (thread)
                return {
                    thread,
                    x: markerX(sectionRight(sectionId), stageW()),
                    y: sectionTop(sectionId),
                };
        }
        return null;
    });

    // The composer opens beside the chip that started it, which sits on the element's own top-right
    // corner. Anchoring it to the section's border instead put it across the canvas from the thing
    // being commented on, and on top of the docked inspector.
    const draftAt = createMemo(() => {
        const d = commentDraft();
        if (!d) return null;
        const address = ids().get(d.anchor.elementId);
        const box = address ? regionMap().get(elementRegionId(address))?.box : undefined;
        if (box) return chipAt(box, stageW());
        // nothing painted to sit beside (an unmaterialized section), so the margin is the anchor
        const section = address?.section ?? d.sectionId;
        return { x: markerX(sectionRight(section), stageW()), y: sectionTop(section) };
    });

    return (
        <Show when={commentsAvailable() && !drag()}>
            <CommentTints spots={spots()} />
            <For each={placed()}>
                {(m) => (
                    <Show when={spotOf(m.id)}>
                        {(spot) => (
                            <Marker
                                x={m.x}
                                y={m.y}
                                thread={spot().thread}
                                active={activeThreadId() === m.id}
                                section={spot().address.section}
                            />
                        )}
                    </Show>
                )}
            </For>
            <For each={[...orphans()]}>
                {([sectionId, list]) => (
                    <Show when={revealed(sectionId)}>
                        <OrphanStack
                            list={list}
                            x={markerX(sectionRight(sectionId), stageW())}
                            y={sectionTop(sectionId)}
                            sectionId={sectionId}
                        />
                    </Show>
                )}
            </For>
            <SelectionChip />
            {/* phone puts the thread and the composer in sheets instead (see CommentSheets) */}
            <Show when={!isPhone() && active()}>
                {(a) => (
                    <ThreadPanel
                        thread={a().spot.thread}
                        x={a().at.x}
                        y={a().at.y}
                        degraded={degradedOf(a().spot)}
                    />
                )}
            </Show>
            <Show when={!isPhone() && orphanActive()}>
                {(o) => <ThreadPanel thread={o().thread} x={o().x} y={o().y} degraded />}
            </Show>
            <Show when={!isPhone() && draftAt()}>{(d) => <DraftPanel x={d().x} y={d().y} />}</Show>
        </Show>
    );
};

// The painted leaf plus the box the engine gave it: laying the same runs out again is how chrome
// finds a character offset on screen without reading the DOM.
function runLayoutFor(address: ElementAddress, width: number): RunLayout | null {
    const leaf = paintedLeafFor(address);
    if (!leaf?.runs?.length) return null;
    return layoutRuns(measureContext(), leaf, width);
}

const degradedOf = (spot: ThreadSpot): boolean => {
    const state = anchorStateOf(spot.thread.root.anchor, {
        element: true,
        mark: spot.ranges.length > 0,
    });
    return isDegraded(state, spot.thread.root.anchor);
};

/** Commented text keeps a faint wash; the open thread's range gets the strong one. */
const CommentTints: Component<{ spots: ThreadSpot[] }> = (props) => {
    const rects = createMemo(() => {
        const out: { key: string; box: Rect; active: boolean }[] = [];
        for (const spot of props.spots) {
            const { box, layout } = spot;
            if (!box || !layout) continue;
            const active = activeThreadId() === spot.thread.root.id;
            for (const [i, range] of spot.ranges.entries())
                for (const [j, r] of rangeRects(layout, range.from, range.to).entries())
                    out.push({
                        key: `${spot.thread.root.id}:${i}:${j}`,
                        box: { x: box.x + r.x, y: box.y + r.y, w: r.w, h: r.h },
                        active,
                    });
        }
        return out;
    });
    return (
        <For each={rects()}>
            {(r) => (
                <div
                    class="pointer-events-none absolute rounded-sm"
                    style={{
                        left: `${r.box.x}px`,
                        top: `${r.box.y}px`,
                        width: `${r.box.w}px`,
                        height: `${r.box.h}px`,
                        background: editorAccent(),
                        opacity: r.active ? 0.28 : 0.12,
                    }}
                />
            )}
        </For>
    );
};

// Threads whose element is gone, as one marker at the top of the section they were written in. The
// canvas has nothing left to point at, so the popover carries what they were written against.
const OrphanStack: Component<{
    list: CommentThread[];
    x: number;
    y: number;
    sectionId: string;
}> = (props) => {
    const [open, setOpen] = createSignal(false);
    let popover: HTMLDivElement | undefined;
    dismissOnOutside(
        () => popover,
        () => setOpen(false),
        `[data-galleo-orphans="${props.sectionId}"]`,
    );
    // an open popover holds the section revealed, the same way a hovered marker does
    createEffect(() => {
        if (open()) setHeldSection(props.sectionId);
    });
    onCleanup(() => setHeldSection((s) => (s === props.sectionId ? null : s)));
    return (
        <>
            <button
                data-galleo-comment="true"
                data-galleo-orphans={props.sectionId}
                data-testid="orphan-stack"
                class="absolute z-panel grid place-items-center rounded-full border border-dashed border-line bg-panel/95 text-muted shadow-sm backdrop-blur-md transition-colors hover:border-accent hover:text-accent"
                classList={{ "size-11": isPhone(), "size-7": !isPhone() }}
                style={{ left: `${props.x}px`, top: `${props.y}px` }}
                title={`${props.list.length} on removed content`}
                onPointerDown={(e) => e.stopPropagation()}
                onPointerMove={(e) => e.stopPropagation()}
                onPointerEnter={() => setHeldSection(props.sectionId)}
                onPointerLeave={() =>
                    !open() && setHeldSection((s) => (s === props.sectionId ? null : s))
                }
                onClick={() => setOpen(!open())}
            >
                <Icon name="comment" size={14} />
                <Badge tone="muted" size="xs" class="absolute -right-1.5 -top-1.5 tabular-nums">
                    {props.list.length}
                </Badge>
            </button>
            <Show when={open()}>
                <FloatingPanel
                    ref={popover}
                    pad="md"
                    shadow="panel"
                    class="absolute z-panel flex w-70 flex-col gap-1.5"
                    style={panelStyle({ x: props.x, y: props.y })}
                    onPointerDown={(e: PointerEvent) => e.stopPropagation()}
                >
                    <Eyebrow as="div" mono={false}>
                        On removed content
                    </Eyebrow>
                    <For each={props.list}>
                        {(t) => (
                            <button
                                class="rounded-lg border border-line px-2.5 py-2 text-left transition-colors hover:border-accent"
                                classList={{ "border-accent": activeThreadId() === t.root.id }}
                                onClick={() => expandThread(t)}
                            >
                                <span class="flex items-baseline gap-1.5">
                                    <span class="truncate text-[12px] font-semibold text-ink">
                                        {authorName(t.root)}
                                    </span>
                                    <span class="text-[10.5px] text-muted">
                                        {relativeTime(t.root.createdAt)}
                                    </span>
                                </span>
                                <Show when={t.root.quote}>
                                    {(quote) => (
                                        <span class="mt-0.5 block truncate text-[11px] italic text-muted">
                                            “{quote()}”
                                        </span>
                                    )}
                                </Show>
                                <span class="mt-0.5 line-clamp-2 block text-[12.5px] leading-snug text-soft">
                                    {t.root.body}
                                </span>
                            </button>
                        )}
                    </For>
                </FloatingPanel>
            </Show>
        </>
    );
};

// The creation surface: a chip on the selected element's top-right corner. The press keeps the
// canvas out of it (preventDefault holds the contenteditable's focus and its selection,
// stopPropagation stops the canvas clearing the selection), which is what lets the anchor be read
// from whatever was in context.
const SelectionChip: Component = () => {
    const address = createMemo((): ElementAddress | null => {
        if (drag() || liveEdit()) return null;
        const sel = selection();
        const at = editing() ?? (sel?.kind === "element" ? sel.address : null);
        // a part of a composite gets no chip, inline editing included: that is the case where it
        // floats over a cell too small to hold it and covers the very content it points at
        return at && commentableAt(editor.artifact, at) ? at : null;
    });
    const box = createMemo((): Rect | null => {
        const a = address();
        if (!a) return null;
        return regions().find((r) => r.id === elementRegionId(a))?.box ?? null;
    });
    const at = createMemo(() => {
        const b = box();
        return b ? chipAt(b, canvasContentWidth()) : null;
    });

    const open = (e: PointerEvent): void => {
        e.preventDefault();
        e.stopPropagation();
        const a = address();
        if (!a) return;
        // read before anything can blur the field: the selection nulls the moment focus moves
        const range = textSelection();
        const draft = captureAnchor(a, range);
        if (draft) startCommentDraft(draft);
    };

    return (
        <Show when={at()}>
            {(spot) => (
                <button
                    data-galleo-toolbar="true"
                    data-galleo-comment="true"
                    data-galleo-comment-chip="true"
                    class="absolute z-panel grid size-7 place-items-center rounded-full border border-line bg-panel text-muted shadow-md transition-colors hover:border-accent hover:text-accent"
                    style={{ left: `${spot().x}px`, top: `${spot().y}px` }}
                    title="Comment on this"
                    onPointerMove={(e) => e.stopPropagation()}
                    onPointerDown={open}
                >
                    <Icon name="comment" size={14} />
                </button>
            )}
        </Show>
    );
};

const Marker: Component<{
    x: number;
    y: number;
    thread: CommentThread;
    active: boolean;
    section: string;
}> = (props) => (
    <button
        data-galleo-comment="true"
        data-galleo-thread={props.thread.root.id}
        class="absolute z-panel grid place-items-center rounded-full border border-line bg-panel/95 text-muted shadow-sm backdrop-blur-md transition-colors hover:border-accent hover:text-accent"
        classList={{
            "size-11": isPhone(), // a tap target, not hover chrome
            "size-7": !isPhone(),
            "border-accent bg-accent text-onaccent hover:text-onaccent": props.active,
            "opacity-60": isResolved(props.thread),
        }}
        style={{ left: `${props.x}px`, top: `${props.y}px` }}
        title={`${authorName(props.thread.root)}: ${props.thread.root.body}`}
        onPointerDown={(e) => e.stopPropagation()}
        onPointerMove={(e) => e.stopPropagation()}
        // the pointer is off the section band once it is on the marker, so the marker holds its own
        // section open rather than disappearing under the click already on its way
        onPointerEnter={() => setHeldSection(props.section)}
        onPointerLeave={() => setHeldSection((s) => (s === props.section ? null : s))}
        onClick={() => (props.active ? setActiveThreadId(null) : expandThread(props.thread))}
    >
        <Icon name="comment" size={14} />
        <Show when={props.thread.replies.length}>
            {(n) => (
                <Badge
                    tone="accentSolid"
                    size="xs"
                    class="absolute -right-1.5 -top-1.5 tabular-nums"
                >
                    {n()}
                </Badge>
            )}
        </Show>
    </button>
);

/**
 * Esc, or a pointerdown anywhere but the panel and the control that opened it. The press is never
 * swallowed: no backdrop, nothing stopped, so the same click still selects an element or presses a
 * button. `opener` is a selector rather than a ref because the marker is rendered elsewhere.
 *
 * composedPath, not `contains`: a menu inside the panel portals out of it, and a press there is
 * still a press inside as far as dismissal is concerned.
 */
function dismissOnOutside(
    panel: () => HTMLElement | undefined,
    close: () => void,
    opener: string,
): void {
    createEffect(() => {
        const onKey = (e: KeyboardEvent): void => {
            if (e.key !== "Escape") return;
            e.stopPropagation();
            close();
        };
        const onDown = (e: PointerEvent): void => {
            const el = panel();
            const inside = e
                .composedPath()
                .some(
                    (n) =>
                        n === el ||
                        (n instanceof Element && (n.matches(opener) || !!n.closest(opener))),
                );
            if (
                dismissalFor(
                    { inside, onCanvas: false },
                    { dragging: !!drag(), deferOnCanvas: false },
                ) === "close"
            )
                close();
        };
        window.addEventListener("keydown", onKey, true);
        window.addEventListener("pointerdown", onDown, true);
        onCleanup(() => {
            window.removeEventListener("keydown", onKey, true);
            window.removeEventListener("pointerdown", onDown, true);
        });
    });
}

// The stage is what a panel is placed against; its width is the laid-out content width and its
// height is the whole scrolled stack, so a panel opened low down still lands on screen.
const stageBox = (): { w: number; h: number } => ({
    w: stageEl()?.clientWidth ?? canvasContentWidth(),
    h: stageEl()?.clientHeight ?? PANEL_MAX_H,
});

const panelStyle = (anchor: {
    x: number;
    y: number;
    w?: number;
}): {
    left: string;
    top: string;
} => {
    const at = panelAt(anchor, { w: PANEL_W, h: PANEL_MAX_H }, stageBox());
    return { left: `${at.x}px`, top: `${at.y}px` };
};

const Composer: Component<{
    placeholder: string;
    submitLabel: string;
    busyLabel?: string;
    autofocus?: boolean;
    onSubmit: (body: string) => Promise<void>;
    onCancel?: () => void;
}> = (props) => {
    const [text, setText] = createSignal("");
    const [busy, setBusy] = createSignal(false);
    let field: HTMLTextAreaElement | undefined;

    createEffect(() => {
        if (props.autofocus) queueMicrotask(() => field?.focus());
    });

    const submit = async (): Promise<void> => {
        const body = text().trim();
        if (!body || busy()) return;
        setBusy(true);
        try {
            await props.onSubmit(body);
            setText("");
        } finally {
            setBusy(false);
        }
    };

    return (
        <div class="mt-2">
            <TextArea
                ref={field}
                rounded="lg"
                rows={2}
                value={text()}
                placeholder={props.placeholder}
                class="resize-none px-2.5 py-2 text-[13px] placeholder:text-muted"
                onChange={setText}
                onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        void submit();
                    }
                }}
            />
            <div class="mt-2 flex items-center justify-end gap-2">
                <Show when={props.onCancel}>
                    <Button variant="ghost" size="sm" onClick={() => props.onCancel?.()}>
                        Cancel
                    </Button>
                </Show>
                <Button
                    variant="primary"
                    size="sm"
                    disabled={!text().trim()}
                    loading={busy()}
                    onClick={() => void submit()}
                >
                    {busy() && props.busyLabel ? props.busyLabel : props.submitLabel}
                </Button>
            </div>
        </div>
    );
};

const Entry: Component<{ comment: CommentDto }> = (props) => {
    const [editingBody, setEditingBody] = createSignal(false);
    return (
        <div class="flex gap-2 py-1.5">
            <Avatar
                size="sm"
                src={props.comment.author?.avatarUrl}
                name={props.comment.author?.name}
            />
            <div class="min-w-0 flex-1">
                <div class="flex items-baseline gap-1.5">
                    <span class="truncate text-[12.5px] font-semibold text-ink">
                        {authorName(props.comment)}
                    </span>
                    <span class="text-[11px] text-muted">
                        {relativeTime(props.comment.createdAt)}
                    </span>
                    <span class="flex-1" />
                    {/* the server allows only the author, so nobody else is offered the affordance */}
                    <Show when={props.comment.mine && !editingBody()}>
                        <button
                            class="text-[11px] text-muted hover:text-accent"
                            onClick={() => setEditingBody(true)}
                        >
                            Edit
                        </button>
                    </Show>
                </div>
                <Show
                    when={editingBody()}
                    fallback={
                        <p class="whitespace-pre-wrap text-[13px] leading-snug text-soft">
                            {props.comment.body}
                        </p>
                    }
                >
                    <EditForm comment={props.comment} onDone={() => setEditingBody(false)} />
                </Show>
            </div>
        </div>
    );
};

const EditForm: Component<{ comment: CommentDto; onDone: () => void }> = (props) => {
    const [text, setText] = createSignal(props.comment.body);
    const [busy, setBusy] = createSignal(false);
    const save = async (): Promise<void> => {
        const body = text().trim();
        if (!body || busy()) return;
        setBusy(true);
        try {
            await editComment(props.comment.id, body);
            props.onDone();
        } finally {
            setBusy(false);
        }
    };
    return (
        <div class="mt-1">
            <TextArea
                rounded="lg"
                rows={2}
                value={text()}
                class="resize-none px-2.5 py-2 text-[13px]"
                onChange={setText}
                onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        void save();
                    }
                }}
            />
            <div class="mt-1.5 flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => props.onDone()}>
                    Cancel
                </Button>
                <Button
                    variant="primary"
                    size="sm"
                    loading={busy()}
                    disabled={!text().trim()}
                    onClick={() => void save()}
                >
                    Save
                </Button>
            </div>
        </div>
    );
};

const ThreadBody: Component<{ thread: CommentThread; degraded: boolean }> = (props) => (
    <>
        <Show when={props.degraded && props.thread.root.quote}>
            {(quote) => (
                <div class="mb-2 rounded-lg border border-line bg-canvas px-2.5 py-1.5">
                    <p class="text-[11.5px] italic leading-snug text-muted">“{quote()}”</p>
                    <p class="mt-1 text-[11px] text-muted">The content this was on has changed.</p>
                </div>
            )}
        </Show>
        <Entry comment={props.thread.root} />
        <For each={props.thread.replies}>
            {(reply) => (
                <div class="border-t border-line pl-2">
                    <Entry comment={reply} />
                </div>
            )}
        </For>
        <Composer
            placeholder="Reply…"
            submitLabel="Reply"
            onSubmit={(body) => replyToThread(props.thread.root, body)}
        />
    </>
);

const ThreadHeader: Component<{ thread: CommentThread }> = (props) => {
    const resolved = (): boolean => isResolved(props.thread);
    return (
        <div class="mb-1 flex items-center gap-1">
            <Eyebrow tone="soft" mono={false}>
                {resolved() ? "Resolved" : "Comment"}
            </Eyebrow>
            <span class="flex-1" />
            <IconButton
                size="sm"
                rounded="md"
                tone="muted"
                active={resolved()}
                title={resolved() ? "Reopen this thread" : "Resolve this thread"}
                onClick={() => void resolveThread(props.thread.root.id, !resolved())}
            >
                <Icon name="check" size={14} />
            </IconButton>
            <Show when={props.thread.root.canDelete}>
                <Menu
                    align="end"
                    minWidth={160}
                    estHeight={80}
                    toolbar
                    trigger={(o) => (
                        <IconButton
                            ref={o.ref}
                            size="sm"
                            rounded="md"
                            tone="muted"
                            title="More"
                            onClick={o.toggle}
                        >
                            <Icon name="more" size={14} />
                        </IconButton>
                    )}
                >
                    <MenuItem
                        tone="danger"
                        onClick={() => {
                            setActiveThreadId(null);
                            dropCommentMark(props.thread);
                            void deleteComment(props.thread.root.id);
                        }}
                    >
                        Delete thread
                    </MenuItem>
                </Menu>
            </Show>
            <IconButton
                size="sm"
                rounded="md"
                tone="muted"
                title="Close"
                onClick={() => setActiveThreadId(null)}
            >
                <Icon name="close" size={14} />
            </IconButton>
        </div>
    );
};

const ThreadPanel: Component<{
    thread: CommentThread;
    x: number;
    y: number;
    degraded: boolean;
    anchorW?: number;
}> = (props) => {
    let panel: HTMLDivElement | undefined;
    dismissOnOutside(
        () => panel,
        () => setActiveThreadId(null),
        `[data-galleo-thread="${props.thread.root.id}"]`,
    );

    return (
        <FloatingPanel
            ref={panel}
            rounded="2xl"
            pad="md"
            data-galleo-toolbar="true"
            class="absolute z-menu flex max-h-100 w-80 flex-col overflow-y-auto"
            style={panelStyle({ x: props.x, y: props.y, w: props.anchorW })}
            onPointerDown={(e) => e.stopPropagation()}
            onPointerMove={(e) => e.stopPropagation()}
        >
            <ThreadHeader thread={props.thread} />
            <ThreadBody thread={props.thread} degraded={props.degraded} />
        </FloatingPanel>
    );
};

async function submitDraft(body: string): Promise<void> {
    const draft = commentDraft();
    if (!draft) return;
    const made = await createComment({
        body,
        sectionId: draft.sectionId,
        anchor: draft.anchor,
        ...(draft.quote ? { quote: draft.quote } : {}),
    });
    cancelCommentDraft();
    if (!made) return;
    applyCommentMark(draft, made.id); // the thread id is what the mark carries
    setActiveThreadId(made.id);
}

const DraftPanel: Component<{ x: number; y: number; anchorW?: number }> = (props) => {
    let panel: HTMLDivElement | undefined;
    dismissOnOutside(
        () => panel,
        () => cancelCommentDraft(),
        "[data-galleo-comment-chip]",
    );
    return (
        <FloatingPanel
            ref={panel}
            rounded="2xl"
            pad="md"
            data-galleo-toolbar="true"
            class="absolute z-menu w-80"
            style={panelStyle({ x: props.x, y: props.y, w: props.anchorW })}
            onPointerDown={(e) => e.stopPropagation()}
            onPointerMove={(e) => e.stopPropagation()}
        >
            <Eyebrow tone="soft" mono={false}>
                New comment
            </Eyebrow>
            <Show when={commentDraft()?.quote}>
                {(quote) => (
                    <p class="mt-1.5 truncate text-[11.5px] italic text-muted">“{quote()}”</p>
                )}
            </Show>
            <Composer
                autofocus
                placeholder="Leave a comment…"
                submitLabel="Comment"
                busyLabel="Posting…"
                onSubmit={submitDraft}
                onCancel={() => cancelCommentDraft()}
            />
        </FloatingPanel>
    );
};

export const CommentSheets: Component = () => {
    const thread = createMemo(() => threads().find((t) => t.root.id === activeThreadId()) ?? null);
    return (
        <>
            <Sheet open={!!thread()} title="Comment" onClose={() => setActiveThreadId(null)}>
                <Show when={thread()}>
                    {(t) => (
                        <>
                            <ThreadHeader thread={t()} />
                            <ThreadBody thread={t()} degraded={!threadAddress(t())} />
                        </>
                    )}
                </Show>
            </Sheet>
            <Sheet open={!!commentDraft()} title="New comment" onClose={() => cancelCommentDraft()}>
                <Show when={commentDraft()?.quote}>
                    {(quote) => (
                        <p class="mb-1.5 truncate text-[11.5px] italic text-muted">“{quote()}”</p>
                    )}
                </Show>
                <Composer
                    autofocus
                    placeholder="Leave a comment…"
                    submitLabel="Comment"
                    busyLabel="Posting…"
                    onSubmit={submitDraft}
                    onCancel={() => cancelCommentDraft()}
                />
            </Sheet>
        </>
    );
};
