import type { Component } from "solid-js";
import { createEffect, createMemo, For, on, onCleanup, Show } from "solid-js";
import type { CursorBox, Lease, Peer } from "@model/collab";
import { drag } from "@editor/core/dnd";
import {
    boxOfElement,
    clearNotice,
    collabActive,
    followedPeer,
    leases,
    notice,
    otherPeers,
    peerFocus,
    remoteCursors,
    scrollFollowing,
    selfConnId,
    unfollow,
} from "@editor/core/collab";
import { canvasEl } from "@editor/core/store";

// Overlay chrome, never render commands. Everything here is an absolutely-positioned sibling in the
// canvas stage, placed from THIS client's engine output, so Present, publish, thumbnails, and export
// are structurally unable to show a cursor or an outline.

const OUTLINE_PAD = 3;

interface Outlined {
    key: string;
    box: CursorBox;
    color: string;
    name: string;
    solid: boolean; // an edit lease reads stronger than a selection
}

const nameOf = (peer: { user: { name: string | null } }): string => peer.user.name || "Someone";

export const CollabLayer: Component = () => {
    const held = createMemo((): Outlined[] => {
        const me = selfConnId();
        const out: Outlined[] = [];
        for (const lease of leases().values()) {
            if (lease.connId === me) continue;
            const box = boxOfElement(lease.element);
            if (box)
                out.push({
                    key: keyOf(lease),
                    box,
                    color: lease.color,
                    name: nameOf(lease),
                    solid: true,
                });
        }
        return out;
    });

    const selected = createMemo((): Outlined[] => {
        const out: Outlined[] = [];
        for (const peer of otherPeers()) {
            const ref = peer.state.selection;
            if (!ref || sameAsEditing(peer)) continue;
            const box = boxOfElement(ref);
            if (box)
                out.push({
                    key: `sel:${peer.connId}`,
                    box,
                    color: peer.color,
                    name: nameOf(peer),
                    solid: false,
                });
        }
        return out;
    });

    // Follow mode: the viewport is tied to where one peer is working until the reader takes it back.
    // `on` the peer rather than the whole memo so a scroll is a reaction to THEM moving; reading
    // peerFocus inside would also re-run this every time the reader's own paint shifts a box.
    createEffect(
        on(followedPeer, (peer) => {
            if (!peer) return;
            const focus = peerFocus(peer);
            if (focus) scrollFollowing(focus);
        }),
    );

    // Anything that reads as the reader taking the viewport back ends the follow. Listening for the
    // intent (a wheel, a drag of the bar, a key) rather than for `scroll` is what lets following do
    // its own scrolling without immediately cancelling itself.
    createEffect(() => {
        if (!followedPeer()) return;
        const el = canvasEl();
        const stop = (): void => unfollow();
        const onKey = (e: KeyboardEvent): void => {
            if (e.key === "Escape" || e.key.startsWith("Arrow") || e.key.startsWith("Page")) stop();
        };
        el?.addEventListener("wheel", stop, { passive: true });
        el?.addEventListener("touchmove", stop, { passive: true });
        window.addEventListener("keydown", onKey);
        onCleanup(() => {
            el?.removeEventListener("wheel", stop);
            el?.removeEventListener("touchmove", stop);
            window.removeEventListener("keydown", onKey);
        });
    });

    // peer chrome is hidden during a drag, like every other overlay: the stack is frozen and the
    // boxes are stale.
    return (
        <>
            <Show when={collabActive() && !drag()}>
                <For each={[...held(), ...selected()]}>{(o) => <PeerOutline outline={o} />}</For>
                <For each={remoteCursors()}>
                    {(c) => (
                        <div
                            data-testid="peer-cursor"
                            class="pointer-events-none absolute z-overlay"
                            style={{
                                left: `${c.x}px`,
                                top: `${c.y}px`,
                                transform: "translate(-1px, -1px)",
                            }}
                        >
                            <PointerGlyph color={c.color} />
                            <span
                                class="ml-3 inline-block -translate-y-1 whitespace-nowrap rounded px-1.5 py-0.5 text-[10.5px] font-medium leading-tight text-white"
                                style={{ background: c.color }}
                            >
                                {c.name}
                            </span>
                        </div>
                    )}
                </For>
            </Show>
        </>
    );
};

/**
 * The two pieces of collaboration chrome placed against the viewport rather than the stack, which
 * is why they render outside the canvas stage: the stage carries the zoom transform, and a
 * transformed ancestor is a containing block, so `fixed` inside it would scale and drift with it.
 * Neither is peer chrome, and neither is gated on a drag: a solo session says things too ("this
 * edits in place", "thread resolved").
 */
export const CollabViewportChrome: Component = () => (
    <>
        <EditorNotice />
        <FollowBanner />
    </>
);

// Following says so at the edge of the viewport rather than over the content, the way a mode should:
// a frame in the followed person's colour, and one line naming them with the way out. Fixed to the
// viewport, not the stack, because what is being followed is the viewport itself. The pill sits just
// below the topbar so the controls there (the avatar that toggles follow among them) stay reachable.
const FollowBanner: Component = () => (
    <Show when={followedPeer()}>
        {(peer) => (
            <>
                <div
                    data-testid="following-frame"
                    class="pointer-events-none fixed inset-0 z-overlay border-2"
                    style={{ "border-color": peer().color }}
                />
                <div class="fixed left-1/2 top-14 z-overlay -translate-x-1/2">
                    <span class="flex items-center gap-2.5 rounded-full bg-panel px-3 py-1.5 text-[12.5px] text-ink shadow-lg">
                        <span
                            class="size-2 rounded-full"
                            style={{ background: peer().color }}
                            aria-hidden="true"
                        />
                        Following {peer().user.name || "Someone"}
                        <button
                            class="font-semibold text-accent hover:underline"
                            onClick={unfollow}
                        >
                            Stop
                        </button>
                    </span>
                </div>
            </>
        )}
    </Show>
);

// The editor's one transient line. Fixed to the viewport rather than the stack, so it reads the
// same whatever is scrolled into view, and it only takes the pointer when it carries a way back.
const EditorNotice: Component = () => (
    <Show when={notice()}>
        {(n) => (
            <div
                data-testid="collab-notice"
                class="fixed bottom-6 left-1/2 z-overlay -translate-x-1/2"
                classList={{ "pointer-events-none": !n().action }}
            >
                <span class="flex items-center gap-2.5 rounded-full bg-panel px-3 py-1.5 text-[12.5px] text-ink shadow-lg">
                    {n().text}
                    <Show when={n().action}>
                        {(action) => (
                            <button
                                class="font-semibold text-accent hover:underline"
                                onClick={() => {
                                    // read first: clearing unmounts what this is read from
                                    const run = action().run;
                                    clearNotice();
                                    run();
                                }}
                            >
                                {action().label}
                            </button>
                        )}
                    </Show>
                </span>
            </div>
        )}
    </Show>
);

const keyOf = (lease: Lease): string =>
    `hold:${lease.element.sectionId}:${lease.element.elementId}:${lease.connId}`;

// a peer's selection is redundant while they are typing in the same element
const sameAsEditing = (peer: Peer): boolean =>
    !!peer.state.editing &&
    !!peer.state.selection &&
    peer.state.editing.sectionId === peer.state.selection.sectionId &&
    peer.state.editing.elementId === peer.state.selection.elementId;

const PeerOutline: Component<{ outline: Outlined }> = (props) => (
    <div
        data-testid={props.outline.solid ? "peer-editing" : "peer-selection"}
        class="pointer-events-none absolute rounded-md"
        style={{
            left: `${props.outline.box.x - OUTLINE_PAD}px`,
            top: `${props.outline.box.y - OUTLINE_PAD}px`,
            width: `${props.outline.box.w + OUTLINE_PAD * 2}px`,
            height: `${props.outline.box.h + OUTLINE_PAD * 2}px`,
            border: `${props.outline.solid ? 2 : 1}px solid ${props.outline.color}`,
            opacity: props.outline.solid ? 1 : 0.55,
        }}
    >
        <Show when={props.outline.solid}>
            <span
                class="absolute -top-4.5 left-0 whitespace-nowrap rounded px-1.5 py-0.5 text-[10.5px] font-medium leading-tight text-white"
                style={{ background: props.outline.color }}
            >
                {props.outline.name}
            </span>
        </Show>
    </div>
);

const PointerGlyph: Component<{ color: string }> = (props) => (
    <svg width="14" height="18" viewBox="0 0 14 18" fill="none" aria-hidden="true">
        <path
            d="M1 1L12.5 9.2L7.3 10.1L10.1 15.6L7.7 16.8L4.9 11.3L1 14.7V1Z"
            fill={props.color}
            stroke="white"
            stroke-width="1.2"
            stroke-linejoin="round"
        />
    </svg>
);
