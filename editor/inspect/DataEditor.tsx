// The full-screen data editor modal: a live preview + config on the left, the reusable spreadsheet grid
// (see DataGrid) on the right. Opened from the inspector's expand button; the same grid also renders
// inline in the inspector. The Body is keyed on the element's type so a type switch re-parses the grid.

import type { Component } from "solid-js";
import { createEffect, createSignal, Show, onMount, onCleanup } from "solid-js";
import type { ElementAddress } from "@model/target";
import { getElementAt, updateDataAt } from "@elements/ops";
import { getElement } from "@elements/spec";
import { canvasDrawContext } from "@canvas/render/backends";
import { renderChart } from "@elements/chart/render";
import { renderDiagram } from "@elements/diagram/render";
import type { ChartData } from "@elements/chart/utils";
import type { DiagramData } from "@elements/diagram/utils";
import { commit, editor, editorTokens } from "../editor";
import { Badge, Button, IconButton } from "@ui/button";
import { Modal } from "@ui/overlay";
import { SchemaFields } from "./fields";
import { DataGrid } from "./DataGrid";
import { DATA_KEYS, type Kind } from "./data-model";

const [target, setTarget] = createSignal<ElementAddress | null>(null);
export function openDataEditor(address: ElementAddress): void {
    setTarget(address);
}
function close(): void {
    setTarget(null);
}

const Body: Component<{ address: ElementAddress }> = (props) => {
    const addr = props.address;
    const inst0 = getElementAt(editor.artifact, addr);
    const spec = inst0 ? getElement(inst0.type) : undefined;
    const kind: Kind = spec?.category === "diagram" ? "diagram" : "chart";

    let cv: HTMLCanvasElement | undefined;
    const currentData = (): Record<string, unknown> =>
        (getElementAt(editor.artifact, addr)?.data ?? {}) as Record<string, unknown>;

    // Preview renders the element's committed data — the grid commits on every keystroke, so tracking
    // `currentData()` in an effect keeps it live.
    function drawPreview(): void {
        if (!cv) return;
        const W = cv.clientWidth || 280;
        const H = 168;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        cv.width = Math.round(W * dpr);
        cv.height = Math.round(H * dpr);
        cv.style.height = `${H}px`;
        const cx = cv.getContext("2d");
        if (!cx) return;
        cx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const tk = editorTokens();
        cx.fillStyle = tk.surface;
        cx.fillRect(0, 0, W, H);
        const d = currentData();
        const box = { x: 0, y: 0, w: W, h: H };
        try {
            if (kind === "chart")
                renderChart(canvasDrawContext(cx), box, d as unknown as ChartData, tk);
            else renderDiagram(canvasDrawContext(cx), box, d as unknown as DiagramData, tk);
        } catch {
            /* malformed intermediate value — skip this frame */
        }
    }
    createEffect(() => {
        currentData();
        drawPreview();
    });

    onMount(() => {
        const onKey = (e: KeyboardEvent): void => {
            if (e.key === "Escape") close();
        };
        window.addEventListener("keydown", onKey);
        onCleanup(() => window.removeEventListener("keydown", onKey));
    });

    // Config = the element's non-data controls (incl. the Type switcher); `type` stays so SchemaFields'
    // visibleWhen snapshot can gate the per-type toggles.
    const configControls = (spec?.controls ?? []).filter((c) => !DATA_KEYS.has(c.key));
    const cfgRead = (k: string): unknown => currentData()[k];
    const cfgWrite = (k: string, v: unknown): void => {
        const ctrl = configControls.find((c) => c.key === k)?.control;
        const coalesce = ctrl === "slider" || ctrl === "color" ? `cfg:${k}` : undefined;
        commit(updateDataAt(editor.artifact, addr, { ...currentData(), [k]: v }), { coalesce });
    };

    return (
        <Modal
            scrim="blur"
            size="full"
            class="flex h-[760px] max-h-[90vh] w-[min(1140px,96vw)] flex-col overflow-hidden"
            onClose={close}
        >
            <div class="flex items-center gap-3 border-b border-line px-5 py-3">
                <div class="text-[15px] font-semibold">Edit data</div>
                <Badge tone="outline" size="md" weight="medium">
                    {spec?.label ?? "Element"}
                </Badge>
                <div class="flex-1" />
                <IconButton size="lg" rounded="lg" bordered tone="soft" onClick={close}>
                    ✕
                </IconButton>
            </div>

            <div class="flex min-h-0 flex-1">
                <aside class="flex w-[320px] flex-none flex-col gap-4 overflow-y-auto border-r border-line p-4">
                    <div class="rounded-xl border border-line bg-canvas p-2.5">
                        <canvas ref={cv} class="block w-full rounded-md" />
                        <div class="mt-2 px-1 text-[10px] font-medium uppercase tracking-wider text-muted">
                            Live preview
                        </div>
                    </div>
                    <Show when={configControls.length > 0}>
                        <SchemaFields controls={configControls} read={cfgRead} write={cfgWrite} />
                    </Show>
                </aside>

                <DataGrid address={addr} />
            </div>

            <div class="flex items-center gap-2 border-t border-line px-5 py-3">
                <span class="text-[12px] text-muted">
                    Edits save to the element and update the canvas live.
                </span>
                <div class="flex-1" />
                <Button variant="primary" size="md" onClick={close}>
                    Done
                </Button>
            </div>
        </Modal>
    );
};

export const DataEditor: Component = () => (
    <Show when={target()} keyed>
        {(addr) => (
            // Re-mount the body (re-parsing the grid) when the type is switched in the config, since a
            // different type may have a different data shape (e.g. bar → pie, or process → flowchart).
            <Show
                when={
                    String(
                        (getElementAt(editor.artifact, addr)?.data as Record<string, unknown>)
                            ?.type ?? "",
                    ) || "?"
                }
                keyed
            >
                <Body address={addr} />
            </Show>
        )}
    </Show>
);
