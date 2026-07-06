import type { ControlField } from "@elements/spec";
import type { MediaKind } from "@model/media";
import type { Component, JSX } from "solid-js";
import { createMemo, createSignal, For, Match, Show, Switch } from "solid-js";
import { editorTokens, requestMediaPicker } from "../editor";
import { Icon } from "../icons";
import { ColorPopover, Dropdown, type ColorSwatch } from "./widgets";

// The shared studio control kit. One home for every inspector/toolbar input so the element inspector,
// section inspector, and (future) cell/page inspectors + contextual toolbars all look and behave the
// same. Primitives are label-less; compose them with `Group`/`FieldRow`, or use the schema-driven
// `Field` (which adds its own label) for `ControlField`-declared controls.

export const inputCls =
    "w-full rounded-md border border-line bg-canvas px-2 py-1.5 text-[13px] text-ink outline-none focus:border-accent";

// ── layout scaffolding ──────────────────────────────────────────────────────

export const PanelHeader: Component<{ title: string; action?: JSX.Element }> = (props) => (
    <div class="mb-4 flex items-center justify-between">
        <span class="font-mono text-[11px] font-semibold uppercase tracking-wider text-muted">
            {props.title}
        </span>
        {props.action}
    </div>
);

// Section heading inside a panel. `divider` draws the top rule that separates it from the group above.
export const Group: Component<{ label: string; divider?: boolean; children: JSX.Element }> = (
    props,
) => (
    <div class="mb-4">
        <div
            class={`mb-2.5 text-[10px] font-semibold uppercase tracking-wider text-muted ${
                props.divider ? "border-t border-line pt-3" : ""
            }`}
        >
            {props.label}
        </div>
        {props.children}
    </div>
);

export const FieldRow: Component<{ label?: string; children: JSX.Element }> = (props) => (
    <div class="mb-3.5">
        <Show when={props.label}>
            <label class="mb-1.5 block text-[11px] font-semibold text-muted">{props.label}</label>
        </Show>
        {props.children}
    </div>
);

// ── primitives ───────────────────────────────────────────────────────────────

export const Segmented: Component<{
    value: string;
    options: { label: string; value: string; icon?: string }[];
    onChange: (v: string) => void;
}> = (props) => (
    <div class="flex gap-1 rounded-lg border border-line bg-canvas p-0.5">
        <For each={props.options}>
            {(o) => (
                <button
                    title={o.label}
                    class={`flex flex-1 items-center justify-center truncate rounded-md px-2 py-1 text-[12px] transition-colors ${
                        props.value === o.value
                            ? "bg-panel font-semibold text-ink shadow-sm"
                            : "text-soft hover:text-ink"
                    }`}
                    onClick={() => props.onChange(o.value)}
                >
                    <Show when={o.icon} fallback={o.label}>
                        <Icon name={o.icon!} size={15} />
                    </Show>
                </button>
            )}
        </For>
    </div>
);

const ALIGN_OPTS = [
    { value: "start", icon: "alignLeft", title: "Align left" },
    { value: "center", icon: "alignCenter", title: "Align center" },
    { value: "end", icon: "alignRight", title: "Align right" },
];

// Left/center/right alignment as an icon segmented group (used in both panel and the format bar).
export const AlignField: Component<{ value: string; onChange: (v: string) => void }> = (props) => {
    // Alignment defaults to "start" wherever it's used, so highlight that when the value is unset —
    // otherwise a never-touched element shows no active segment. Idle icons use `soft` (not `muted`,
    // which is too low-contrast to read on the format bar in several themes).
    const val = (): string => props.value || "start";
    return (
        <div class="flex gap-1 rounded-lg border border-line bg-canvas p-0.5">
            <For each={ALIGN_OPTS}>
                {(o) => (
                    <button
                        title={o.title}
                        class={`flex min-w-8 flex-1 items-center justify-center rounded-md py-1 transition-colors ${
                            val() === o.value
                                ? "bg-panel text-ink shadow-sm"
                                : "text-soft hover:text-ink"
                        }`}
                        onClick={() => props.onChange(o.value)}
                    >
                        <Icon name={o.icon} size={15} />
                    </button>
                )}
            </For>
        </div>
    );
};

export const SliderRow: Component<{
    value: number;
    min: number;
    max: number;
    step?: number;
    unit?: string;
    onChange: (n: number) => void;
}> = (props) => (
    <div class="flex items-center gap-2.5">
        <input
            type="range"
            min={props.min}
            max={props.max}
            step={props.step ?? 1}
            class="h-1.5 flex-1 accent-accent"
            value={props.value}
            onInput={(e) => props.onChange(Number(e.currentTarget.value))}
        />
        <span class="w-11 text-right text-[11px] tabular-nums text-muted">
            {props.value}
            {props.unit ?? ""}
        </span>
    </div>
);

export const ToggleSwitch: Component<{ value: boolean; onChange: (b: boolean) => void }> = (
    props,
) => (
    <button
        onClick={() => props.onChange(!props.value)}
        class={`relative h-5 w-9 rounded-full transition-colors ${props.value ? "bg-accent" : "bg-line"}`}
    >
        <span
            class={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${
                props.value ? "left-[18px]" : "left-0.5"
            }`}
        />
    </button>
);

export const SelectField: Component<{
    value: string;
    options: { label: string; value: string }[];
    onChange: (v: string) => void;
    compact?: boolean;
}> = (props) => (
    <Dropdown
        value={props.value}
        options={props.options}
        onChange={props.onChange}
        compact={props.compact}
    />
);

export const TextField: Component<{
    value: string;
    placeholder?: string;
    onChange: (v: string) => void;
}> = (props) => (
    <input
        class={inputCls}
        placeholder={props.placeholder}
        value={props.value}
        onInput={(e) => props.onChange(e.currentTarget.value)}
    />
);

export const TextArea: Component<{
    value: string;
    placeholder?: string;
    rows?: number;
    onChange: (v: string) => void;
}> = (props) => (
    <textarea
        rows={props.rows ?? 3}
        class={`${inputCls} resize-y leading-snug`}
        placeholder={props.placeholder}
        value={props.value}
        onInput={(e) => props.onChange(e.currentTarget.value)}
    />
);

// Theme-aware color control: quick swatches drawn from the active artifact theme (so overrides stay
// on-palette), a native well for anything custom, a hex readout, and an optional reset-to-default. The
// swatch + custom internals are the shared `ColorPicker` (also used by the inline mark pickers).
export const ColorField: Component<{
    value?: string;
    onChange: (v: string | undefined) => void;
    allowClear?: boolean;
}> = (props) => {
    const swatches = createMemo((): ColorSwatch[] => {
        const t = editorTokens();
        return [
            { label: "Accent", color: t.accent },
            { label: "Ink", color: t.ink },
            { label: "Soft", color: t.soft },
            { label: "Muted", color: t.muted },
            { label: "Surface", color: t.surface },
            { label: "Line", color: t.line },
        ];
    });
    return (
        <ColorPopover
            value={props.value}
            swatches={swatches()}
            onChange={props.onChange}
            clearLabel={props.allowClear ? "Reset" : undefined}
        />
    );
};

// Image chooser: opens the shared media picker (stock search · AI generate · upload · recent). Full mode
// shows the current image + a Change button + a paste-a-URL escape hatch; compact (format bar) is a lone
// Replace button. Wired from the image element's `src` and the section-background image.
export const MediaField: Component<{
    value: string;
    placeholder?: string;
    compact?: boolean;
    kind?: string;
    onChange: (v: string) => void;
}> = (props) => {
    const [pasting, setPasting] = createSignal(false);
    const open = (): void =>
        requestMediaPicker({
            onPick: (url) => props.onChange(url),
            kind: props.kind as MediaKind | undefined,
        });
    return (
        <Show
            when={!props.compact}
            fallback={
                <button
                    title="Replace image"
                    class="flex h-7 items-center gap-1.5 rounded-md px-2 text-[12px] font-medium text-ink hover:bg-canvas"
                    onClick={open}
                >
                    <Icon name="media" size={14} /> Replace
                </button>
            }
        >
            <div class="flex flex-col gap-2">
                <div class="flex items-center gap-2.5">
                    <button
                        class="grid h-12 w-16 flex-none place-items-center overflow-hidden rounded-md border border-line bg-canvas bg-cover bg-center text-muted"
                        style={
                            props.value
                                ? { "background-image": `url("${props.value}")` }
                                : undefined
                        }
                        title="Change image"
                        onClick={open}
                    >
                        <Show when={!props.value}>
                            <Icon name="media" size={16} />
                        </Show>
                    </button>
                    <div class="flex min-w-0 flex-1 flex-col items-start gap-1">
                        <button
                            class="rounded-md border border-line bg-canvas px-3 py-1.5 text-[12.5px] font-semibold text-ink hover:border-accent"
                            onClick={open}
                        >
                            Change image
                        </button>
                        <button
                            class="text-[11.5px] text-muted hover:text-ink"
                            onClick={() => setPasting((p) => !p)}
                        >
                            or paste a URL
                        </button>
                    </div>
                </div>
                <Show when={pasting()}>
                    <TextField
                        value={props.value}
                        placeholder={props.placeholder ?? "https://…"}
                        onChange={props.onChange}
                    />
                </Show>
            </div>
        </Show>
    );
};

// Icon chooser: opens the media picker in "icon" mode (Iconify search). The value is a nested glyph
// { id, body, vb }; the preview renders it as a CSS mask so it takes the field's text color. Full mode
// shows a swatch + Change button; compact (format bar) is a lone Change button.
export const IconField: Component<{
    glyph?: { id: string; body: string; vb: string };
    compact?: boolean;
    onChange: (g: { id: string; body: string; vb: string }) => void;
}> = (props) => {
    const open = (): void =>
        requestMediaPicker({
            kind: "icon",
            onPick: () => {},
            onPickIcon: (icon) =>
                props.onChange({
                    id: icon.id,
                    body: icon.body,
                    vb: `0 0 ${icon.width} ${icon.height}`,
                }),
        });
    const maskStyle = (): JSX.CSSProperties | undefined => {
        const g = props.glyph;
        if (!g) return undefined;
        const uri = `url("data:image/svg+xml,${encodeURIComponent(
            `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${g.vb}">${g.body}</svg>`,
        )}")`;
        return {
            "mask-image": uri,
            "-webkit-mask-image": uri,
            "mask-size": "contain",
            "-webkit-mask-size": "contain",
            "mask-repeat": "no-repeat",
            "-webkit-mask-repeat": "no-repeat",
            "mask-position": "center",
            "-webkit-mask-position": "center",
            "background-color": "currentColor",
        };
    };
    return (
        <Show
            when={!props.compact}
            fallback={
                <button
                    title="Change icon"
                    class="flex h-7 items-center gap-1.5 rounded-md px-2 text-[12px] font-medium text-ink hover:bg-canvas"
                    onClick={open}
                >
                    <span class="h-4 w-4" style={maskStyle()} /> Icon
                </button>
            }
        >
            <div class="flex items-center gap-2.5">
                <button
                    class="grid h-12 w-12 flex-none place-items-center rounded-md border border-line bg-canvas text-ink"
                    title="Change icon"
                    onClick={open}
                >
                    <span class="h-6 w-6" style={maskStyle()} />
                </button>
                <button
                    class="rounded-md border border-line bg-canvas px-3 py-1.5 text-[12.5px] font-semibold text-ink hover:border-accent"
                    onClick={open}
                >
                    Change icon
                </button>
            </div>
        </Show>
    );
};

// Icon color: theme-role swatches (accent · ink · soft · muted) that store the role name (so the icon
// re-tints when the theme changes), plus a custom-hex well.
const ICON_ROLES: { role: string; label: string }[] = [
    { role: "accent", label: "Accent" },
    { role: "ink", label: "Ink" },
    { role: "soft", label: "Soft" },
    { role: "muted", label: "Muted" },
];
export const IconColorField: Component<{ value?: string; onChange: (v: string) => void }> = (
    props,
) => {
    const tok = (r: string): string =>
        (editorTokens() as unknown as Record<string, string>)[r] ?? "#888888";
    const active = (): string => props.value ?? "accent";
    const isHex = (): boolean => active().startsWith("#");
    return (
        <div class="flex items-center gap-1.5">
            <For each={ICON_ROLES}>
                {(r) => (
                    <button
                        title={r.label}
                        class={`h-6 w-6 rounded-full border-2 ${
                            active() === r.role
                                ? "border-ink"
                                : "border-transparent hover:opacity-80"
                        }`}
                        style={{ background: tok(r.role) }}
                        onClick={() => props.onChange(r.role)}
                    />
                )}
            </For>
            <label
                class={`relative h-6 w-6 cursor-pointer overflow-hidden rounded-full border-2 ${
                    isHex() ? "border-ink" : "border-line"
                }`}
                title="Custom color"
            >
                <span
                    class="absolute inset-0"
                    style={{
                        background: isHex()
                            ? active()
                            : "conic-gradient(from 90deg,#ef4444,#eab308,#22c55e,#06b6d4,#6366f1,#ec4899,#ef4444)",
                    }}
                />
                <input
                    type="color"
                    value={isHex() ? active() : "#888888"}
                    onInput={(e) => props.onChange(e.currentTarget.value)}
                    class="absolute inset-0 cursor-pointer opacity-0"
                />
            </label>
        </div>
    );
};

// ── schema-driven dispatcher ────────────────────────────────────────────────

// Renders one `ControlField` (the matching primitive). Panel mode wraps it in a labelled row; `compact`
// mode (the format bar) drops the label + tightens widths. Drives both the inspector and the bar.
export const Field: Component<{
    field: ControlField;
    value: unknown;
    onChange: (v: unknown) => void;
    compact?: boolean;
}> = (props) => {
    const f = (): ControlField => props.field;
    const num = (): number => Number(props.value ?? f().min ?? 0);
    const str = (): string => String(props.value ?? "");
    // A thunk, not a shared element: each call mints its own node, so using it in multiple branches
    // (compact/non-compact, Show fallback + children) never reuses one DOM node — reusing one silently
    // drops the reactive inner content (e.g. AlignField's icons) from whichever branch actually mounts.
    const control = (): JSX.Element => (
        <Switch
            fallback={
                <TextField value={str()} placeholder={f().placeholder} onChange={props.onChange} />
            }
        >
            <Match when={f().control === "text" && f().multiline}>
                <TextArea value={str()} placeholder={f().placeholder} onChange={props.onChange} />
            </Match>
            <Match when={f().control === "select"}>
                <SelectField
                    value={str()}
                    options={f().options ?? []}
                    onChange={props.onChange}
                    compact={props.compact}
                />
            </Match>
            <Match when={f().control === "segmented"}>
                <Segmented value={str()} options={f().options ?? []} onChange={props.onChange} />
            </Match>
            <Match when={f().control === "align"}>
                <AlignField value={str()} onChange={props.onChange} />
            </Match>
            <Match when={f().control === "slider"}>
                <SliderRow
                    value={num()}
                    min={f().min ?? 0}
                    max={f().max ?? 100}
                    step={f().step}
                    unit={f().unit}
                    onChange={props.onChange}
                />
            </Match>
            <Match when={f().control === "number"}>
                <input
                    type="number"
                    min={f().min}
                    max={f().max}
                    step={f().step}
                    class={inputCls}
                    value={num()}
                    onInput={(e) => props.onChange(Number(e.currentTarget.value))}
                />
            </Match>
            <Match when={f().control === "color"}>
                <ColorField value={props.value as string | undefined} onChange={props.onChange} />
            </Match>
            <Match when={f().control === "toggle"}>
                <ToggleSwitch value={!!props.value} onChange={props.onChange} />
            </Match>
            <Match when={f().control === "media"}>
                <MediaField
                    value={str()}
                    placeholder={f().placeholder}
                    compact={props.compact}
                    kind={f().mediaKind}
                    onChange={(v) => props.onChange(v)}
                />
            </Match>
            <Match when={f().control === "icon"}>
                <IconField
                    glyph={props.value as { id: string; body: string; vb: string } | undefined}
                    compact={props.compact}
                    onChange={(g) => props.onChange(g)}
                />
            </Match>
            <Match when={f().control === "iconColor"}>
                <IconColorField
                    value={props.value as string | undefined}
                    onChange={props.onChange}
                />
            </Match>
        </Switch>
    );
    if (!props.compact) return <FieldRow label={f().label}>{control()}</FieldRow>;
    // Compact (format bar) drops labels — a leading glyph names the control (e.g. columns) when set.
    return (
        <Show when={f().icon} fallback={control()}>
            <span class="flex items-center gap-1 text-soft">
                <Icon name={f().icon!} size={14} />
                {control()}
            </span>
        </Show>
    );
};

// Renders a `ControlField[]` schema against a get/set adapter — grouping by `group`, honoring
// `visibleWhen`. The one generic panel body: elements pass their data as the store; sections pass a
// flat adapter over their structured shape. Grouping depends only on the (stable) control list, so
// editing a value never re-renders the panel and steals input focus; only `visibleWhen` toggles remount.
export const SchemaFields: Component<{
    controls: ControlField[];
    read: (key: string) => unknown;
    write: (key: string, value: unknown) => void;
}> = (props) => {
    const groups = createMemo(() => {
        const order: string[] = [];
        const byGroup = new Map<string, ControlField[]>();
        for (const c of props.controls) {
            const g = c.group ?? "";
            if (!byGroup.has(g)) {
                byGroup.set(g, []);
                order.push(g);
            }
            byGroup.get(g)!.push(c);
        }
        return order.map((g) => ({ name: g, fields: byGroup.get(g)! }));
    });
    const snapshot = createMemo(() =>
        Object.fromEntries(props.controls.map((c) => [c.key, props.read(c.key)])),
    );
    const fieldFor = (c: ControlField): JSX.Element => (
        <Show when={!c.visibleWhen || c.visibleWhen(snapshot())}>
            <Field field={c} value={props.read(c.key)} onChange={(v) => props.write(c.key, v)} />
        </Show>
    );
    return (
        <For each={groups()}>
            {(grp) => (
                <Show
                    when={grp.name}
                    fallback={
                        <div class="mb-4">
                            <For each={grp.fields}>{fieldFor}</For>
                        </div>
                    }
                >
                    <Group label={grp.name} divider>
                        <For each={grp.fields}>{fieldFor}</For>
                    </Group>
                </Show>
            )}
        </For>
    );
};
