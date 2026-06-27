import type { ControlField } from "@elements/element-spec";
import type { ElementAddress } from "@model/address";
import type { ElementLayout } from "@model/content";
import type { Component, JSX } from "solid-js";
import { createMemo, For, Match, Show, Switch } from "solid-js";
import { getElementAt, removeAt, setElementLayout, updateDataAt } from "@elements/ops";
import { getElement } from "@elements/registry";
import { commit, editor, setSelection } from "./editor";

const inputCls =
    "w-full rounded-md border border-line bg-canvas px-2 py-1.5 text-[13px] text-ink outline-none focus:border-accent";

// Universal per-element layout controls (independent of the element's data controls).
const WIDTH_FIELD: ControlField = {
    key: "width",
    label: "Width",
    control: "segmented",
    options: [
        { label: "Fit", value: "fit" },
        { label: "Fill", value: "fill" },
        { label: "%", value: "pct" },
    ],
};
const PCT_FIELD: ControlField = { key: "pct", label: "Width %", control: "slider", min: 10, max: 100, step: 5, unit: "%" };
const ALIGN_FIELD: ControlField = {
    key: "align",
    label: "Align",
    control: "segmented",
    options: [
        { label: "Start", value: "start" },
        { label: "Center", value: "center" },
        { label: "End", value: "end" },
    ],
};

function Field(props: {
    field: ControlField;
    value: unknown;
    onChange: (v: unknown) => void;
}): JSX.Element {
    const f = props.field;
    const num = (): number => Number(props.value ?? f.min ?? 0);
    return (
        <div class="mb-3.5">
            <label class="mb-1.5 block text-[11px] font-semibold text-muted">{f.label}</label>
            <Switch
                fallback={
                    <input
                        class={inputCls}
                        placeholder={f.placeholder}
                        value={String(props.value ?? "")}
                        onInput={(e) => props.onChange(e.currentTarget.value)}
                    />
                }
            >
                <Match when={f.control === "text" && f.multiline}>
                    <textarea
                        rows={3}
                        class={`${inputCls} resize-y leading-snug`}
                        placeholder={f.placeholder}
                        value={String(props.value ?? "")}
                        onInput={(e) => props.onChange(e.currentTarget.value)}
                    />
                </Match>
                <Match when={f.control === "select"}>
                    <select
                        class={inputCls}
                        value={String(props.value ?? "")}
                        onChange={(e) => props.onChange(e.currentTarget.value)}
                    >
                        <For each={f.options ?? []}>
                            {(o) => <option value={o.value}>{o.label}</option>}
                        </For>
                    </select>
                </Match>
                <Match when={f.control === "segmented"}>
                    <div class="flex gap-1 rounded-lg border border-line bg-canvas p-0.5">
                        <For each={f.options ?? []}>
                            {(o) => (
                                <button
                                    class={`flex-1 truncate rounded-md px-2 py-1 text-[12px] ${String(props.value) === o.value ? "bg-panel font-semibold text-ink shadow-sm" : "text-muted hover:text-ink"}`}
                                    onClick={() => props.onChange(o.value)}
                                >
                                    {o.label}
                                </button>
                            )}
                        </For>
                    </div>
                </Match>
                <Match when={f.control === "slider"}>
                    <div class="flex items-center gap-2.5">
                        <input
                            type="range"
                            min={f.min ?? 0}
                            max={f.max ?? 100}
                            step={f.step ?? 1}
                            class="h-1.5 flex-1 accent-accent"
                            value={num()}
                            onInput={(e) => props.onChange(Number(e.currentTarget.value))}
                        />
                        <span class="w-11 text-right text-[11px] tabular-nums text-muted">
                            {num()}
                            {f.unit ?? ""}
                        </span>
                    </div>
                </Match>
                <Match when={f.control === "number"}>
                    <input
                        type="number"
                        min={f.min}
                        max={f.max}
                        step={f.step}
                        class={inputCls}
                        value={num()}
                        onInput={(e) => props.onChange(Number(e.currentTarget.value))}
                    />
                </Match>
                <Match when={f.control === "color"}>
                    <div class="flex items-center gap-2">
                        <input
                            type="color"
                            class="h-7 w-9 cursor-pointer rounded border border-line bg-canvas p-0.5"
                            value={String(props.value ?? "#000000")}
                            onInput={(e) => props.onChange(e.currentTarget.value)}
                        />
                        <span class="font-mono text-[12px] text-muted">
                            {String(props.value ?? "—")}
                        </span>
                    </div>
                </Match>
                <Match when={f.control === "toggle"}>
                    <button
                        onClick={() => props.onChange(!props.value)}
                        class={`relative h-5 w-9 rounded-full transition-colors ${props.value ? "bg-accent" : "bg-line"}`}
                    >
                        <span
                            class={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${props.value ? "left-[18px]" : "left-0.5"}`}
                        />
                    </button>
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

    const groups = createMemo(() => {
        const order: string[] = [];
        const byGroup = new Map<string, ControlField[]>();
        for (const c of spec()?.controls ?? []) {
            const g = c.group ?? "";
            if (!byGroup.has(g)) {
                byGroup.set(g, []);
                order.push(g);
            }
            byGroup.get(g)!.push(c);
        }
        return order.map((g) => ({ name: g, fields: byGroup.get(g)! }));
    });

    const set = (key: string, value: unknown): void =>
        commit(updateDataAt(editor.artifact, props.address, { ...data(), [key]: value }));
    const del = (): void => {
        commit(removeAt(editor.artifact, props.address));
        setSelection(null);
    };

    // Per-instance layout (width + cross-axis align), shown for every element.
    const layout = createMemo((): ElementLayout => inst()?.layout ?? {});
    const widthMode = (): string => {
        const w = layout().width;
        if (w === "fit") return "fit";
        if (typeof w === "object") return "pct";
        return "fill"; // "fill" or unset → fills (the natural default for most elements)
    };
    const pct = (): number => {
        const w = layout().width;
        return typeof w === "object" ? w.pct : 50;
    };
    const setLayout = (patch: Partial<ElementLayout>): void =>
        commit(setElementLayout(editor.artifact, props.address, { ...layout(), ...patch }));
    const setWidth = (mode: unknown): void => {
        if (mode === "fit") setLayout({ width: "fit" });
        else if (mode === "pct") setLayout({ width: { pct: pct() } });
        else setLayout({ width: "fill" });
    };

    return (
        <div>
            <div class="mb-4 flex items-center justify-between">
                <span class="font-mono text-[11px] font-semibold uppercase tracking-wider text-muted">
                    {spec()?.label ?? "Element"}
                </span>
                <button class="text-[12px] font-semibold text-accent hover:underline" onClick={del}>
                    Delete
                </button>
            </div>
            <div class="mb-4">
                <div class="mb-2.5 text-[10px] font-semibold uppercase tracking-wider text-muted">Layout</div>
                <Field field={WIDTH_FIELD} value={widthMode()} onChange={setWidth} />
                <Show when={widthMode() === "pct"}>
                    <Field field={PCT_FIELD} value={pct()} onChange={(v) => setLayout({ width: { pct: Number(v) } })} />
                </Show>
                <Field field={ALIGN_FIELD} value={layout().align ?? "start"} onChange={(v) => setLayout({ align: v as "start" | "center" | "end" })} />
            </div>
            <Show
                when={(spec()?.controls.length ?? 0) > 0}
                fallback={<p class="text-[13px] text-muted">No editable properties.</p>}
            >
                <For each={groups()}>
                    {(grp) => (
                        <div class="mb-4">
                            <Show when={grp.name}>
                                <div class="mb-2.5 border-t border-line pt-3 text-[10px] font-semibold uppercase tracking-wider text-muted">
                                    {grp.name}
                                </div>
                            </Show>
                            <For each={grp.fields}>
                                {(c) => (
                                    <Field
                                        field={c}
                                        value={data()[c.key]}
                                        onChange={(v) => set(c.key, v)}
                                    />
                                )}
                            </For>
                        </div>
                    )}
                </For>
            </Show>
        </div>
    );
};
