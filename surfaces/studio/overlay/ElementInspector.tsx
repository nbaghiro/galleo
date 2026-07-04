import type { ElementAddress } from "@model/target";
import type { Component } from "solid-js";
import { createMemo, Show } from "solid-js";
import { elementRegionId } from "@model/target";
import { getElementAt, removeAt, updateDataAt } from "@elements/ops";
import { getElement } from "@elements/spec";
import { commit, editor, setSelection } from "../editor";
import { PanelHeader, SchemaFields } from "../controls/fields";

// The docked inspector for a selected element: its schema-driven data controls. Spatial properties
// (width/height resize, cross-axis align, container gap/padding) are manipulated directly on the canvas
// via handles + the context bar, so they no longer live here.
export const ElementInspector: Component<{ address: ElementAddress }> = (props) => {
    const inst = createMemo(() => getElementAt(editor.artifact, props.address));
    const spec = createMemo(() => {
        const i = inst();
        return i ? getElement(i.type) : undefined;
    });
    const data = createMemo(() => (inst()?.data ?? {}) as Record<string, unknown>);

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
        commit(removeAt(editor.artifact, props.address));
        setSelection(null);
    };

    return (
        <div>
            <PanelHeader
                title={spec()?.label ?? "Element"}
                action={
                    <button
                        class="text-[12px] font-semibold text-accent hover:underline"
                        onClick={del}
                    >
                        Delete
                    </button>
                }
            />
            <Show
                when={(spec()?.controls.length ?? 0) > 0}
                fallback={<p class="text-[13px] text-muted">No editable properties.</p>}
            >
                <SchemaFields
                    controls={spec()?.controls ?? []}
                    read={(k) => data()[k]}
                    write={set}
                />
            </Show>
        </div>
    );
};
