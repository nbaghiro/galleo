import type { ControlField } from "@elements/element-spec";
import type { ElementAddress } from "@model/address";
import type { Component, JSX } from "solid-js";
import { createMemo, For, Match, Show, Switch } from "solid-js";
import { getElementAt, removeAt, updateDataAt } from "@elements/ops";
import { getElement } from "@elements/registry";
import { commit, editor, setSelection } from "./editor";

const labelCls = "mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted";
const inputCls = "w-full rounded-md border border-line bg-white px-2 py-1.5 text-[13px] text-ink";

function Control(props: { field: ControlField; value: unknown; onChange: (v: unknown) => void }): JSX.Element {
    const f = props.field;
    return (
        <div class="mb-3">
            <label class={labelCls}>{f.label}</label>
            <Switch
                fallback={
                    <input class={inputCls} value={String(props.value ?? "")} onInput={(e) => props.onChange(e.currentTarget.value)} />
                }
            >
                <Match when={f.control === "select"}>
                    <select class={inputCls} value={String(props.value ?? "")} onChange={(e) => props.onChange(e.currentTarget.value)}>
                        <For each={f.options ?? []}>{(o) => <option value={o.value}>{o.label}</option>}</For>
                    </select>
                </Match>
                <Match when={f.control === "slider"}>
                    <input
                        type="range"
                        min={0}
                        max={64}
                        step={2}
                        class="w-full accent-accent"
                        value={Number(props.value ?? 0)}
                        onInput={(e) => props.onChange(Number(e.currentTarget.value))}
                    />
                </Match>
                <Match when={f.control === "number"}>
                    <input type="number" class={inputCls} value={Number(props.value ?? 0)} onInput={(e) => props.onChange(Number(e.currentTarget.value))} />
                </Match>
                <Match when={f.control === "color"}>
                    <input type="color" class="h-8 w-full rounded-md border border-line" value={String(props.value ?? "#000000")} onInput={(e) => props.onChange(e.currentTarget.value)} />
                </Match>
                <Match when={f.control === "toggle"}>
                    <input type="checkbox" class="accent-accent" checked={Boolean(props.value)} onChange={(e) => props.onChange(e.currentTarget.checked)} />
                </Match>
            </Switch>
        </div>
    );
}

export const ElementInspector: Component<{ address: ElementAddress }> = (props) => {
    const inst = createMemo(() => getElementAt(editor.artifact, props.address));
    const spec = createMemo(() => {
        const i = inst();
        return i ? getElement(i.type) : undefined;
    });
    const data = createMemo(() => (inst()?.data ?? {}) as Record<string, unknown>);
    const set = (key: string, value: unknown): void =>
        commit(updateDataAt(editor.artifact, props.address, { ...data(), [key]: value }));
    const del = (): void => {
        commit(removeAt(editor.artifact, props.address));
        setSelection(null);
    };

    return (
        <div>
            <div class="mb-4 flex items-center justify-between">
                <span class="font-mono text-[11px] font-semibold uppercase tracking-wider text-muted">{spec()?.label ?? "Element"}</span>
                <button class="text-[12px] font-semibold text-accent hover:underline" onClick={del}>
                    Delete
                </button>
            </div>
            <Show
                when={(spec()?.controls.length ?? 0) > 0}
                fallback={<p class="text-[13px] text-muted">No editable properties yet.</p>}
            >
                <For each={spec()?.controls}>{(c) => <Control field={c} value={data()[c.key]} onChange={(v) => set(c.key, v)} />}</For>
            </Show>
        </div>
    );
};
