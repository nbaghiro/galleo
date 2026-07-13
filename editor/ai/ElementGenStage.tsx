import type { Component } from "solid-js";
import { createMemo, Show } from "solid-js";
import type { Rect } from "@engine/node";
import { elementRegionId } from "@model/target";
import { GenOverlay } from "@ui/gen-overlay";
import { editorAccent, regions } from "../editor";
import { elementGen } from "./element-gen";

export const ElementGenStage: Component = () => {
    const region = createMemo(() => {
        const a = elementGen.addr;
        if (!a || !elementGen.status) return null;
        return regions().find((r) => r.id === elementRegionId(a)) ?? null;
    });
    const box = createMemo<Rect | null>(() => region()?.box ?? null);

    return (
        <Show when={box()}>
            {(b) => (
                <GenOverlay
                    box={b()}
                    radius={region()?.radius ?? 8}
                    accent={editorAccent()}
                    state={elementGen.status === "error" ? "error" : "busy"}
                    z={30}
                    speed={1.9}
                    sweepHeight="55%"
                    accentMix={22}
                    ringWidth="1.5px"
                    wash
                />
            )}
        </Show>
    );
};
