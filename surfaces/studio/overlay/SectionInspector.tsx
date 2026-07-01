import type { SectionBackground } from "@model/content";
import type { Component } from "solid-js";
import { createMemo, For, Match, Switch } from "solid-js";
import { setSectionBackground, setSectionBleed, setSectionGrid } from "@elements/ops";
import { TEMPLATE_LABELS, TEMPLATES } from "@elements/templates";
import { commit, editor, editorTokens } from "../editor";

const ids = Object.keys(TEMPLATES);
const heading =
    "mb-2.5 mt-4 border-t border-line pt-3 text-[10px] font-semibold uppercase tracking-wider text-muted";
const inputCls =
    "w-full rounded-md border border-line bg-canvas px-2 py-1.5 text-[13px] text-ink outline-none focus:border-accent";

const Seg: Component<{
    value: string;
    options: { label: string; value: string }[];
    onChange: (v: string) => void;
}> = (props) => (
    <div class="flex gap-1 rounded-lg border border-line bg-canvas p-0.5">
        <For each={props.options}>
            {(o) => (
                <button
                    class={`flex-1 truncate rounded-md px-2 py-1 text-[12px] ${props.value === o.value ? "bg-panel font-semibold text-ink shadow-sm" : "text-muted hover:text-ink"}`}
                    onClick={() => props.onChange(o.value)}
                >
                    {o.label}
                </button>
            )}
        </For>
    </div>
);

// Section layout picker + width (contained/full-bleed) + background (none/color/gradient/image).
export const SectionInspector: Component<{ section: string }> = (props) => {
    const sec = createMemo(() => editor.artifact.sections.find((s) => s.id === props.section));
    const grid = (): string | undefined => sec()?.grid;
    const bleed = (): boolean => sec()?.bleed ?? false;
    const bg = (): SectionBackground => sec()?.background ?? { kind: "none" };
    const grad = (): { from: string; to: string; angle?: number } =>
        bg().gradient ?? { from: "#000000", to: "#ffffff", angle: 135 };

    const setGrid = (id: string): void =>
        commit(setSectionGrid(editor.artifact, props.section, id));
    const setBleed = (v: boolean): void =>
        commit(setSectionBleed(editor.artifact, props.section, v));
    const setBg = (patch: Partial<SectionBackground>): void =>
        commit(setSectionBackground(editor.artifact, props.section, { ...bg(), ...patch }));
    const setKind = (kind: string): void => {
        const t = editorTokens();
        if (kind === "color") setBg({ kind, color: bg().color ?? t.accent });
        else if (kind === "gradient")
            setBg({
                kind,
                gradient: bg().gradient ?? { from: t.accent, to: t.surface, angle: 135 },
            });
        else if (kind === "image")
            setBg({
                kind,
                image: bg().image ?? "https://picsum.photos/seed/galleo-bg/1600/1000",
                scrim: bg().scrim ?? 0.45,
            });
        else setBg({ kind: "none" });
    };

    return (
        <div>
            <div class="font-mono text-[11px] font-semibold uppercase tracking-wider text-muted">
                Section
            </div>

            <div class={heading}>Layout</div>
            <div class="grid grid-cols-2 gap-2">
                <For each={ids}>
                    {(id) => (
                        <button
                            onClick={() => setGrid(id)}
                            class={`flex flex-col items-stretch gap-1.5 rounded-lg border p-2 ${grid() === id ? "border-accent bg-panel" : "border-line bg-canvas"}`}
                        >
                            <div class="flex h-7 gap-1">
                                <For each={TEMPLATES[id]!.widths}>
                                    {(w) => (
                                        <div
                                            class="rounded-sm bg-muted opacity-40"
                                            style={{
                                                "flex-grow":
                                                    w.mode === "percent" ? String(w.value) : "1",
                                            }}
                                        />
                                    )}
                                </For>
                            </div>
                            <span class="text-[11px] font-semibold text-ink">
                                {TEMPLATE_LABELS[id] ?? id}
                            </span>
                        </button>
                    )}
                </For>
            </div>

            <div class={heading}>Width</div>
            <Seg
                value={bleed() ? "full" : "contained"}
                options={[
                    { label: "Contained", value: "contained" },
                    { label: "Full-bleed", value: "full" },
                ]}
                onChange={(v) => setBleed(v === "full")}
            />

            <div class={heading}>Background</div>
            <Seg
                value={bg().kind}
                options={[
                    { label: "None", value: "none" },
                    { label: "Color", value: "color" },
                    { label: "Gradient", value: "gradient" },
                    { label: "Image", value: "image" },
                ]}
                onChange={setKind}
            />
            <div class="mt-3 flex flex-col gap-2">
                <Switch>
                    <Match when={bg().kind === "color"}>
                        <input
                            type="color"
                            class="h-8 w-full cursor-pointer rounded border border-line bg-canvas"
                            value={bg().color ?? "#000000"}
                            onInput={(e) => setBg({ color: e.currentTarget.value })}
                        />
                    </Match>
                    <Match when={bg().kind === "gradient"}>
                        <div class="flex gap-2">
                            <input
                                type="color"
                                class="h-8 flex-1 cursor-pointer rounded border border-line"
                                value={grad().from}
                                onInput={(e) =>
                                    setBg({ gradient: { ...grad(), from: e.currentTarget.value } })
                                }
                            />
                            <input
                                type="color"
                                class="h-8 flex-1 cursor-pointer rounded border border-line"
                                value={grad().to}
                                onInput={(e) =>
                                    setBg({ gradient: { ...grad(), to: e.currentTarget.value } })
                                }
                            />
                        </div>
                        <label class="text-[11px] text-muted">Angle</label>
                        <input
                            type="range"
                            min={0}
                            max={360}
                            step={5}
                            class="accent-accent"
                            value={grad().angle ?? 135}
                            onInput={(e) =>
                                setBg({
                                    gradient: { ...grad(), angle: Number(e.currentTarget.value) },
                                })
                            }
                        />
                    </Match>
                    <Match when={bg().kind === "image"}>
                        <input
                            class={inputCls}
                            placeholder="https://… image url"
                            value={bg().image ?? ""}
                            onInput={(e) => setBg({ image: e.currentTarget.value })}
                        />
                        <label class="text-[11px] text-muted">Darken (scrim)</label>
                        <input
                            type="range"
                            min={0}
                            max={0.8}
                            step={0.05}
                            class="accent-accent"
                            value={bg().scrim ?? 0.45}
                            onInput={(e) => setBg({ scrim: Number(e.currentTarget.value) })}
                        />
                    </Match>
                </Switch>
            </div>
        </div>
    );
};
