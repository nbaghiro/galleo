import type { ControlField } from "@elements/spec";
import type { MediaKind } from "@model/media";
import type { Component, JSX } from "solid-js";
import { createMemo, createSignal, For, Match, Show, Switch } from "solid-js";
import { editorTokens, requestMediaPicker } from "../editor";
import { Icon } from "@ui/icons";
import { Button } from "@ui/button";
import { ColorPopover, type ColorSwatch } from "@ui/color";
import { SelectField } from "@ui/select";
import {
    inputCls,
    FieldRow,
    Group,
    PanelHeader,
    Segmented,
    AlignField,
    TextField,
    TextArea,
    Toggle as ToggleSwitch,
    Slider as SliderRow,
} from "@ui/inputs";

export {
    inputCls,
    FieldRow,
    Group,
    PanelHeader,
    Segmented,
    AlignField,
    TextField,
    TextArea,
    ToggleSwitch,
    SliderRow,
    SelectField,
};

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
            toolbar
        />
    );
};

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
                        <Button variant="tool" size="sm" onClick={open}>
                            Change image
                        </Button>
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
                <Button variant="tool" size="sm" onClick={open}>
                    Change icon
                </Button>
            </div>
        </Show>
    );
};

// Stores the theme-role name (not a hex) so the icon re-tints when the theme changes.
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

export const Field: Component<{
    field: ControlField;
    value: unknown;
    onChange: (v: unknown) => void;
    compact?: boolean;
}> = (props) => {
    const f = (): ControlField => props.field;
    const num = (): number => Number(props.value ?? f().min ?? 0);
    const str = (): string => String(props.value ?? "");
    // A thunk, not a shared element — reusing one node across branches silently drops the reactive inner content.
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
                    toolbar
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
                <TextField
                    type="number"
                    min={f().min}
                    max={f().max}
                    step={f().step}
                    value={String(num())}
                    onChange={(v) => props.onChange(Number(v))}
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
    return (
        <Show when={f().icon} fallback={control()}>
            <span class="flex items-center gap-1 text-soft">
                <Icon name={f().icon!} size={14} />
                {control()}
            </span>
        </Show>
    );
};

// Grouping keys off the stable control list, so editing a value never re-renders the panel and steals focus (only visibleWhen remounts).
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
