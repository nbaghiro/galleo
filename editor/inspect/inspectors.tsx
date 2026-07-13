import type { ElementAddress } from "@model/target";
import type { Component } from "solid-js";
import { createMemo, Show } from "solid-js";
import { elementRegionId } from "@model/target";
import { deleteElement, getElementAt, updateDataAt } from "@elements/ops";
import { getElement } from "@elements/spec";
import { commit, editor, setSelection } from "../editor";
import { PanelHeader, SchemaFields } from "./fields";
import { dataShapeFor, DATA_KEYS } from "./data-model";
import { openDataEditor } from "./DataEditor";
import { DataGrid } from "./DataGrid";
import { Icon } from "@ui/icons";
import { Button, IconButton } from "@ui/button";

export const ElementInspector: Component<{ address: ElementAddress }> = (props) => {
    const inst = createMemo(() => getElementAt(editor.artifact, props.address));
    const spec = createMemo(() => {
        const i = inst();
        return i ? getElement(i.type) : undefined;
    });
    const data = createMemo(() => (inst()?.data ?? {}) as Record<string, unknown>);
    // Charts/diagrams get the visual data editor; their raw data fields are hidden here (the grid owns them).
    const editorShape = createMemo(() => {
        const s = spec();
        return s ? dataShapeFor(s.category, String(data().type ?? "")) : undefined;
    });
    const panelControls = createMemo(() => {
        const all = spec()?.controls ?? [];
        return editorShape() ? all.filter((c) => !DATA_KEYS.has(c.key)) : all;
    });
    // Re-key the inline grid on the element + its type so it re-parses when either changes.
    const gridKey = createMemo(
        () => `${elementRegionId(props.address)}:${String(data().type ?? "")}`,
    );

    const set = (key: string, value: unknown): void => {
        // Slider/color are dragged continuously — coalesce their stream into one undo step.
        const control = spec()?.controls.find((c) => c.key === key)?.control;
        const coalesce =
            control === "slider" || control === "color"
                ? `panel:${elementRegionId(props.address)}:${key}`
                : undefined;
        commit(updateDataAt(editor.artifact, props.address, { ...data(), [key]: value }), {
            coalesce,
        });
    };
    const del = (): void => {
        commit(deleteElement(editor.artifact, props.address));
        setSelection(null);
    };

    return (
        <div>
            <PanelHeader
                title={spec()?.label ?? "Element"}
                action={
                    <Button variant="link" onClick={del}>
                        Delete
                    </Button>
                }
            />
            <Show
                when={panelControls().length > 0}
                fallback={
                    <Show when={!editorShape()}>
                        <p class="text-[13px] text-muted">No editable properties.</p>
                    </Show>
                }
            >
                <SchemaFields controls={panelControls()} read={(k) => data()[k]} write={set} />
            </Show>
            <Show when={editorShape()}>
                <div class="mb-2 mt-4 flex items-center justify-between">
                    <div class="text-[10px] font-semibold uppercase tracking-wider text-muted">
                        Data
                    </div>
                    <IconButton
                        size="sm"
                        bordered
                        tone="tool"
                        title="Open full data editor"
                        onClick={() => openDataEditor(props.address)}
                    >
                        <Icon name="fullscreen" size={13} />
                    </IconButton>
                </div>
                <Show when={gridKey()} keyed>
                    <div class="overflow-hidden rounded-lg border border-line">
                        <DataGrid address={props.address} compact />
                    </div>
                </Show>
            </Show>
        </div>
    );
};
