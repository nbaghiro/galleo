import type { SectionBackground } from "@model/content";
import type { Component } from "solid-js";
import { createMemo, For } from "solid-js";
import { setSectionBackground, setSectionBleed, setSectionGrid } from "@elements/ops";
import { SECTION_CONTROLS } from "@elements/section-spec";
import { TEMPLATE_LABELS, TEMPLATES } from "@elements/templates";
import { commit, editor, editorTokens } from "../editor";
import { Group, PanelHeader, SchemaFields } from "../controls/fields";

const ids = Object.keys(TEMPLATES);

// The grid-template picker is bespoke (live thumbnails); everything else (width + background) is rendered
// generically from SECTION_CONTROLS via SchemaFields, with a flat adapter onto the structured section.
export const SectionInspector: Component<{ section: string }> = (props) => {
    const sec = createMemo(() => editor.artifact.sections.find((s) => s.id === props.section));
    const grid = (): string | undefined => sec()?.grid;
    const bg = (): SectionBackground => sec()?.background ?? { kind: "none" };
    const grad = (): { from: string; to: string; angle?: number } =>
        bg().gradient ?? { from: "#000000", to: "#ffffff", angle: 135 };

    const setGrid = (id: string): void =>
        commit(setSectionGrid(editor.artifact, props.section, id));
    const setBg = (patch: Partial<SectionBackground>, coalesce?: string): void =>
        commit(
            setSectionBackground(editor.artifact, props.section, { ...bg(), ...patch }),
            coalesce ? { coalesce } : undefined,
        );
    // Color/gradient/scrim are scrubbed continuously — fold each drag into a single undo step.
    const ck = (key: string): string | undefined =>
        ["bgColor", "bgFrom", "bgTo", "bgAngle", "bgScrim"].includes(key)
            ? `sec:${props.section}:${key}`
            : undefined;
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

    // Flat adapter over the structured section for the generic schema renderer.
    const read = (key: string): unknown => {
        switch (key) {
            case "bleed":
                return sec()?.bleed ? "full" : "contained";
            case "bgKind":
                return bg().kind;
            case "bgColor":
                return bg().color;
            case "bgFrom":
                return grad().from;
            case "bgTo":
                return grad().to;
            case "bgAngle":
                return grad().angle ?? 135;
            case "bgImage":
                return bg().image ?? "";
            case "bgScrim":
                return bg().scrim ?? 0.45;
            default:
                return undefined;
        }
    };
    const write = (key: string, v: unknown): void => {
        switch (key) {
            case "bleed":
                commit(setSectionBleed(editor.artifact, props.section, v === "full"));
                break;
            case "bgKind":
                setKind(String(v));
                break;
            case "bgColor":
                setBg({ color: v as string }, ck(key));
                break;
            case "bgFrom":
                setBg({ gradient: { ...grad(), from: String(v) } }, ck(key));
                break;
            case "bgTo":
                setBg({ gradient: { ...grad(), to: String(v) } }, ck(key));
                break;
            case "bgAngle":
                setBg({ gradient: { ...grad(), angle: Number(v) } }, ck(key));
                break;
            case "bgImage":
                setBg({ image: String(v) });
                break;
            case "bgScrim":
                setBg({ scrim: Number(v) }, ck(key));
                break;
        }
    };

    return (
        <div>
            <PanelHeader title="Section" />
            <Group label="Layout" divider>
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
                                                        w.mode === "percent"
                                                            ? String(w.value)
                                                            : "1",
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
            </Group>
            <SchemaFields controls={SECTION_CONTROLS} read={read} write={write} />
        </div>
    );
};
