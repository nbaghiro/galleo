import type { ElementAddress } from "@model/artifact";
import type { Component } from "solid-js";
import { createMemo, For, Show } from "solid-js";
import { elementRegionId } from "@model/artifact";
import { getElementAt, setElementLayout, sharedParent, updateDataAt } from "@elements/ops";
import { getElement, labelOf, resizeOf } from "@elements/spec";
import { gridColumnsOf } from "@elements/composite/container";
import { runCommand } from "@ui/keys";
import { commit, editor, regions, selectedAddresses } from "@editor/core/store";
import { paintedLeafFor } from "@editor/core/leaf";
import {
    FieldRow,
    Group,
    PanelHeader,
    SchemaFields,
    SliderRow,
    writeElementData,
} from "./SharedControlFields";
import { TextField, Toggle } from "@ui/inputs";
import {
    PIN_ANCHORS,
    anchorPoint,
    parentAddress,
    pinnable,
    pinnedLayout,
    togglePin,
    type Pin,
} from "@editor/core/pin";
import { dataShapeFor, DATA_KEYS } from "@editor/core/infographic";
import { openDataEditor } from "./DataEditor";
import { DataGrid } from "./DataEditor";
import { Icon } from "@ui/icons";
import { Button, IconButton } from "@ui/button";

const DEFAULT_RADIUS = 12; // shown before layout.radius is explicitly set

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
    // the panel is the remainder: what the bar shows is not shown again here
    const panelControls = createMemo(() => {
        const s = spec();
        const bar = new Set(s?.bar ?? []);
        const grid = editorShape();
        return (s?.controls ?? []).filter(
            (c) => !bar.has(c.key) && !(grid && DATA_KEYS.has(c.key)),
        );
    });
    // re-key so the grid re-parses when the element or its type changes
    const gridKey = createMemo(
        () => `${elementRegionId(props.address)}:${String(data().type ?? "")}`,
    );

    const set = (key: string, value: unknown): void =>
        writeElementData(props.address, spec(), data(), key, value, "panel");
    // the bottom-edge handle's height, as a row: the phone has no handle, and a number reads better
    // than a drag anyway; a spec that already exposes the key as a control keeps its own
    const heightCfg = createMemo(() => {
        const s = spec();
        const i = inst();
        const h = s && i ? resizeOf(s, i.data)?.height : undefined;
        return h && !s!.controls.some((c) => c.key === h.key) ? h : undefined;
    });
    const setHeight = (n: number): void =>
        writeElementData(props.address, spec(), data(), heightCfg()!.key, n, "panel", "slider");

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

    // a cell under a grid parent may take several of its columns
    const gridParentCols = createMemo((): number | null =>
        props.address.path.length === 0
            ? null
            : gridColumnsOf(getElementAt(editor.artifact, parentAddress(props.address))),
    );
    const setSpan = (n: number): void => {
        const { span: _span, ...rest } = inst()?.layout ?? {};
        commit(
            setElementLayout(editor.artifact, props.address, n > 1 ? { ...rest, span: n } : rest),
            { coalesce: `panel:${elementRegionId(props.address)}:span` },
        );
    };

    const pin = createMemo((): Pin | undefined => inst()?.layout?.pin);
    // section chrome: a direct child of the section root may hang from the band's top edge on a
    // continuous format; offered wherever it is already set so an AI-written dock can be cleared
    const dock = createMemo((): boolean => inst()?.layout?.dock === "top");
    const dockable = createMemo((): boolean => props.address.path.length === 1 || dock());
    const setDock = (on: boolean): void => {
        const { dock: _dock, ...rest } = inst()?.layout ?? {};
        commit(
            setElementLayout(editor.artifact, props.address, on ? { ...rest, dock: "top" } : rest),
        );
    };
    const setPin = (key: "z" | "rotate" | "dx" | "dy", value: number): void => {
        const cur = inst();
        const p = cur?.layout?.pin;
        if (!p) return;
        const merged: Pin = { ...p, [key]: Math.round(value * 10) / 10 };
        for (const k of ["z", "rotate", "dx", "dy"] as const) if (!merged[k]) delete merged[k];
        commit(
            setElementLayout(editor.artifact, props.address, {
                ...(cur?.layout ?? {}),
                pin: merged,
            }),
            { coalesce: `panel:${elementRegionId(props.address)}:${key}` },
        );
    };
    // semantic re-anchor: the element stays where it paints and only its attachment changes
    const reanchor = (ax: Pin["x"], ay: Pin["y"]): void => {
        const p = pin();
        const el = regions().find((r) => r.id === elementRegionId(props.address))?.box;
        const parent = regions().find(
            (r) => r.id === elementRegionId(parentAddress(props.address)),
        )?.box;
        if (!p || !el || !parent) return;
        const [px, py] = anchorPoint(parent, ax, ay);
        const [ex, ey] = anchorPoint(el, ax, ay);
        const next = pinnedLayout(
            editor.artifact,
            props.address,
            { x: ax, y: ay },
            { x: ex - px, y: ey - py },
            p,
        );
        if (next) commit(setElementLayout(editor.artifact, props.address, next));
    };

    return (
        <div>
            <PanelHeader title={(spec() && labelOf(spec()!, data())) ?? "Element"} />
            <Show
                when={panelControls().length > 0}
                fallback={
                    <Show when={!editorShape() && !spec()?.frame && !heightCfg()}>
                        <p class="text-[13px] text-muted">No editable properties.</p>
                    </Show>
                }
            >
                <SchemaFields
                    controls={panelControls()}
                    read={(k) => data()[k]}
                    write={set}
                    data={data}
                    replace={(next) => commit(updateDataAt(editor.artifact, props.address, next))}
                    // an unset color override inherits the painted leaf's tone; show it as Auto
                    effective={(k) =>
                        k === "color" && spec()?.richText
                            ? paintedLeafFor(props.address)?.color
                            : undefined
                    }
                />
            </Show>
            <Show when={heightCfg()}>
                {(h) => (
                    <FieldRow label="Height">
                        <SliderRow
                            value={Number(data()[h().key] ?? h().min)}
                            min={h().min}
                            max={h().max}
                            step={h().step ?? 1}
                            unit="px"
                            onChange={setHeight}
                        />
                    </FieldRow>
                )}
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
            <Show when={gridParentCols()}>
                {(cols) => (
                    <FieldRow label="Column span">
                        <SliderRow
                            value={inst()?.layout?.span ?? 1}
                            min={1}
                            max={cols()}
                            step={1}
                            onChange={setSpan}
                        />
                    </FieldRow>
                )}
            </Show>
            <Show when={pin() || dockable()}>
                <Group label="Position" divider>
                    <Show when={dockable()}>
                        <FieldRow label="Dock to the section's top edge">
                            <Toggle value={dock()} onChange={setDock} />
                        </FieldRow>
                    </Show>
                    <Show when={!pin() && pinnable(editor.artifact, props.address)}>
                        <FieldRow label="Pin in place">
                            <Toggle value={false} onChange={() => togglePin(props.address)} />
                        </FieldRow>
                        {/* the controls exist behind Pin; a hunt for "rotate" has to land here */}
                        <button
                            class="w-full text-left text-[11px] text-muted transition-colors hover:text-accent"
                            onClick={() => togglePin(props.address)}
                        >
                            Rotate, layer and offset unlock when the element is pinned. Pin it now.
                        </button>
                    </Show>
                    <Show when={pin()}>
                        {(p) => (
                            <>
                                <FieldRow label="Anchor">
                                    <div class="grid w-fit grid-cols-3 gap-1">
                                        <For
                                            each={PIN_ANCHORS.flatMap((ay) =>
                                                PIN_ANCHORS.map((ax) => [ax, ay] as const),
                                            )}
                                        >
                                            {([ax, ay]) => (
                                                <button
                                                    title={`${
                                                        {
                                                            start: "Top",
                                                            center: "Middle",
                                                            end: "Bottom",
                                                        }[ay]
                                                    } ${{ start: "left", center: "center", end: "right" }[ax]}`}
                                                    onClick={() => reanchor(ax, ay)}
                                                    class={`size-4 rounded-sm border transition-colors ${
                                                        p().x === ax && p().y === ay
                                                            ? "border-accent bg-accent"
                                                            : "border-line bg-panel hover:border-accent"
                                                    }`}
                                                />
                                            )}
                                        </For>
                                    </div>
                                </FieldRow>
                                <FieldRow label="Offset">
                                    <div class="flex gap-1.5">
                                        <TextField
                                            type="number"
                                            value={String(p().dx ?? 0)}
                                            onChange={(v) => setPin("dx", Number(v) || 0)}
                                        />
                                        <TextField
                                            type="number"
                                            value={String(p().dy ?? 0)}
                                            onChange={(v) => setPin("dy", Number(v) || 0)}
                                        />
                                    </div>
                                </FieldRow>
                                <FieldRow label="Layer">
                                    <SliderRow
                                        value={p().z ?? 0}
                                        min={-3}
                                        max={3}
                                        step={1}
                                        onChange={(n) => setPin("z", n)}
                                    />
                                </FieldRow>
                                <FieldRow label="Rotation">
                                    <SliderRow
                                        value={p().rotate ?? 0}
                                        min={-180}
                                        max={180}
                                        step={1}
                                        unit="°"
                                        onChange={(n) => setPin("rotate", n)}
                                    />
                                </FieldRow>
                            </>
                        )}
                    </Show>
                </Group>
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
