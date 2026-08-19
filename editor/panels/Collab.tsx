import type { Component } from "solid-js";
import { createMemo, For, Show } from "solid-js";
import type { CursorBox, Lease, Peer } from "@model/collab";
import { drag } from "@editor/core/dnd";
import {
    boxOfElement,
    collabActive,
    leases,
    notice,
    otherPeers,
    remoteCursors,
    selfConnId,
} from "@editor/core/collab";

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

    // hidden during a drag, like every other overlay: the stack is frozen and the boxes are stale
    return (
        <Show when={collabActive() && !drag()}>
            <Show when={notice()}>
                {(text) => (
                    <div
                        data-testid="collab-notice"
                        class="pointer-events-none fixed bottom-6 left-1/2 z-overlay -translate-x-1/2"
                    >
                        <span class="rounded-full bg-panel px-3 py-1.5 text-[12.5px] text-ink shadow-lg">
                            {text()}
                        </span>
                    </div>
                )}
            </Show>
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
    );
};

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
