import type { Component, JSX } from "solid-js";
import { Show } from "solid-js";
import type { Rect } from "@engine/node";

// The in-place "generating" treatment painted over a region's box while it forms — an accent light sweeping
// down through it with the frame glowing (busy), a brief danger ring (error), or nothing extra (done). Used
// by both the section-gen and element-gen stages (their only real differences are speed/height/mix/ring —
// all props). `base` renders under the light; `children` render over it (a status chip). Keyframes live in
// theme/styles.css (`gen-lightsweep`/`gen-frameglow`); speed is set per-instance via the `--gen-speed` var.

const DANGER = "#e5484d";

export const GenOverlay: Component<{
    box: Rect;
    accent: string;
    state: "busy" | "done" | "error";
    radius?: number; // box corner radius, px (default 8)
    speed?: number; // sweep/glow animation seconds (default 2.4)
    sweepHeight?: string; // the light's height as a % of the box (default "50%")
    accentMix?: number; // sweep gradient accent-mix % (default 20)
    ringWidth?: string; // frame-glow inset ring width (default "2px")
    wash?: boolean; // a faint accent wash over the whole box (the old element shows through)
    z?: number; // z-index (default 20)
    blockPointer?: boolean; // stop canvas pointer events (else pointer-transparent)
    base?: JSX.Element; // content painted UNDER the light (e.g. an opaque cover + skeleton)
    children?: JSX.Element; // content painted OVER the light (e.g. a centre status chip)
}> = (props) => (
    <div
        class={`absolute overflow-hidden ${props.blockPointer ? "" : "pointer-events-none"}`}
        style={{
            left: `${props.box.x}px`,
            top: `${props.box.y}px`,
            width: `${props.box.w}px`,
            height: `${props.box.h}px`,
            "border-radius": `${props.radius ?? 8}px`,
            "z-index": props.z ?? 20,
            "--gen-speed": `${props.speed ?? 2.4}s`,
        }}
        onPointerDown={props.blockPointer ? (e) => e.stopPropagation() : undefined}
        onPointerMove={props.blockPointer ? (e) => e.stopPropagation() : undefined}
    >
        {props.base}
        <Show
            when={props.state !== "error"}
            fallback={
                <div
                    class="absolute inset-0"
                    style={{
                        "border-radius": "inherit",
                        "box-shadow": `inset 0 0 0 2px ${DANGER}`,
                    }}
                />
            }
        >
            <Show when={props.wash}>
                <div
                    class="absolute inset-0"
                    style={{ background: `color-mix(in srgb, ${props.accent} 8%, transparent)` }}
                />
            </Show>
            <Show when={props.state === "busy"}>
                <div
                    class="gen-lightsweep pointer-events-none absolute inset-x-0 top-0"
                    style={{
                        height: props.sweepHeight ?? "50%",
                        background: `linear-gradient(180deg, transparent, color-mix(in srgb, ${props.accent} ${props.accentMix ?? 20}%, transparent), transparent)`,
                    }}
                />
            </Show>
            <div
                class="gen-frameglow pointer-events-none absolute inset-0"
                style={{
                    "border-radius": "inherit",
                    "box-shadow": `inset 0 0 0 ${props.ringWidth ?? "2px"} ${props.accent}`,
                }}
            />
        </Show>
        {props.children}
    </div>
);
