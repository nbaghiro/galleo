import type { ElementAddress } from "@model/artifact";
import type { Component } from "solid-js";
import { createMemo, Show } from "solid-js";
import { elementRegionId } from "@model/artifact";
import { capture } from "@ui/analytics";
import { getElementAt, setElementLayout, sharedParent, updateDataAt } from "@elements/ops";
import { getElement } from "@elements/spec";
import { runCommand } from "@ui/keys";
import { commit, editor, regions, selectedAddresses } from "@editor/core/store";
import { deleteSelectedElements } from "@editor/core/commands";
import { paintedLeafFor } from "@editor/core/leaf";
import { FieldRow, PanelHeader, SchemaFields, SliderRow } from "./SharedControlFields";
import { dataShapeFor, DATA_KEYS } from "@editor/core/infographic";
import { openDataEditor } from "./DataEditor";
import { DataGrid } from "./DataEditor";
import { Icon } from "@ui/icons";
import { Button, IconButton } from "@ui/button";

// Shared property editing across a set is v2; the count plus the shared actions is all this is.
export const MultiSelectPanel: Component = () => {
    const set = createMemo(() => selectedAddresses());
    return (
        <div>
            <PanelHeader title={`${set().length} selected`} />
            <div class="flex flex-wrap gap-1.5">
                <Show when={sharedParent(set())}>
                    <Button variant="tool" onClick={() => runCommand("edit.group")}>
                        Group
                    </Button>
                </Show>
                <Button variant="tool" onClick={() => runCommand("edit.duplicate")}>
                    Duplicate
                </Button>
                <Button variant="tool" onClick={() => runCommand("edit.delete")}>
                    Delete
                </Button>
            </div>
        </div>
    );
};

export const ElementInspector: Component<{ address: ElementAddress }> = (props) => {
    const inst = createMemo(() => getElementAt(editor.artifact, props.address));
    const spec = createMemo(() => {
        const i = inst();
        return i ? getElement(i.type) : undefined;
    });
    const data = createMemo(() => (inst()?.data ?? {}) as Record<string, unknown>);
    // charts/diagrams get the visual data editor; the grid owns their raw data fields
    const editorShape = createMemo(() => {
        const s = spec();
        return s ? dataShapeFor(s.category, String(data().type ?? "")) : undefined;
    });
    const panelControls = createMemo(() => {
        const all = spec()?.controls ?? [];
        return editorShape() ? all.filter((c) => !DATA_KEYS.has(c.key)) : all;
    });
    // re-key so the grid re-parses when the element or its type changes
    const gridKey = createMemo(
        () => `${elementRegionId(props.address)}:${String(data().type ?? "")}`,
    );

    const set = (key: string, value: unknown): void => {
        // slider/color drag continuously; coalesce the stream into one undo step
        const control = spec()?.controls.find((c) => c.key === key)?.control;
        const coalesce =
            control === "slider" || control === "color"
                ? `panel:${elementRegionId(props.address)}:${key}`
                : undefined;
        commit(updateDataAt(editor.artifact, props.address, { ...data(), [key]: value }), {
            coalesce,
        });
        // the one inspector writer: every clamp control funnels through here
        if ((key === "maxLines" || key === "clamp") && typeof value === "number" && value > 0)
            capture("text_clamped", { element_type: inst()?.type ?? "text", max_lines: value });
    };
    const del = (): void => deleteSelectedElements();

    const DEFAULT_RADIUS = 12; // shown before layout.radius is explicitly set
    const radius = createMemo((): number => {
        const set = inst()?.layout?.radius;
        if (set !== undefined) return set;
        // unset: show the painted theme radius, so the slider doesn't jump on first drag
        const painted = regions().find((r) => r.id === elementRegionId(props.address))?.radius;
        return painted ?? DEFAULT_RADIUS;
    });
    const setRadius = (n: number): void => {
        commit(
            setElementLayout(editor.artifact, props.address, {
                ...(inst()?.layout ?? {}),
                radius: n,
            }),
            { coalesce: `panel:${elementRegionId(props.address)}:radius` },
        );
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
                    <Show when={!editorShape() && !spec()?.frame}>
                        <p class="text-[13px] text-muted">No editable properties.</p>
                    </Show>
                }
            >
                <SchemaFields
                    controls={panelControls()}
                    read={(k) => data()[k]}
                    write={set}
                    // an unset color override inherits the painted leaf's tone; show it as Auto
                    effective={(k) =>
                        k === "color" && spec()?.richText
                            ? paintedLeafFor(props.address)?.color
                            : undefined
                    }
                />
            </Show>
            <Show when={spec()?.frame}>
                <FieldRow label="Corner radius">
                    <SliderRow
                        value={radius()}
                        min={0}
                        max={40}
                        step={1}
                        unit="px"
                        onChange={setRadius}
                    />
                </FieldRow>
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
