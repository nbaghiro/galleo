import type { Component, JSX } from "solid-js";
import { Show } from "solid-js";
import type { Rect } from "@engine/node";
import { Z } from "./z";

// Keyframes live in ui/styles.css (gen-lightsweep/gen-frameglow); speed via the --gen-speed var.

const DANGER = "#e5484d";

export const GenOverlay: Component<{
    box: Rect;
    accent: string;
    state: "busy" | "done" | "error";
    radius?: number; // px (default 8)
    speed?: number; // seconds (default 2.4)
    sweepHeight?: string; // default "50%"
    accentMix?: number; // accent-mix % (default 20)
    ringWidth?: string; // default "2px"
    wash?: boolean; // faint accent wash; the old element shows through
    z?: number; // default Z.panel
    blockPointer?: boolean; // stop canvas pointer events (else pointer-transparent)
    base?: JSX.Element; // painted under the light
    children?: JSX.Element; // painted over the light
}> = (props) => (
    <div
        class={`absolute overflow-hidden ${props.blockPointer ? "" : "pointer-events-none"}`}
        style={{
            left: `${props.box.x}px`,
            top: `${props.box.y}px`,
            width: `${props.box.w}px`,
            height: `${props.box.h}px`,
            "border-radius": `${props.radius ?? 8}px`,
            "z-index": props.z ?? Z.panel,
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
