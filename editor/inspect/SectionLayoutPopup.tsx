import type { Component } from "solid-js";
import { createMemo, For, Show } from "solid-js";
import type { Section, SectionBackground } from "@model/artifact";
import { resolveProfile } from "@engine/profile";
import { SECTION_LAYOUTS, type SectionLayout } from "@elements/layouts";
import { setSectionBackground, setSectionBleed } from "@elements/ops";
import { SECTION_CONTROLS } from "@elements/spec";
import { ScaledSectionCanvas } from "@ui/section";
import { commit, editor, editorTokens } from "../editor";
import { SchemaFields, Group } from "./fields";

export const SectionLayoutPopup: Component<{ section: string }> = (props) => {
    const sec = createMemo(() => editor.artifact.sections.find((s) => s.id === props.section));
    const profile = createMemo(() => resolveProfile(editor.artifact.format));
    const frame = (): "slide" | "natural" =>
        profile().kind === "continuous" ? "natural" : "slide";
    const applicable = (s: Section): SectionLayout[] => SECTION_LAYOUTS.filter((l) => l.applies(s));

    const apply = (l: SectionLayout): void =>
        commit({
            ...editor.artifact,
            sections: editor.artifact.sections.map((s) =>
                s.id === props.section ? l.transform(s) : s,
            ),
        });

    const bg = (): SectionBackground => sec()?.background ?? { kind: "none" };
    const grad = (): { from: string; to: string; angle?: number } =>
        bg().gradient ?? { from: "#000000", to: "#ffffff", angle: 135 };
    const setBg = (patch: Partial<SectionBackground>, coalesce?: string): void =>
        commit(
            setSectionBackground(editor.artifact, props.section, { ...bg(), ...patch }),
            coalesce ? { coalesce } : undefined,
        );
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
        <Show when={sec()}>
            {(s) => (
                <div>
                    <Group label="Layout" divider>
                        <div class="grid grid-cols-3 gap-2.5">
                            <For each={applicable(s())}>
                                {(l) => (
                                    <div class="flex flex-col items-center gap-1">
                                        <ScaledSectionCanvas
                                            section={l.transform(s())}
                                            theme={editorTokens()}
                                            profile={profile()}
                                            frame={frame()}
                                            width={150}
                                            bordered
                                            selected={l.matches(s())}
                                            as="button"
                                            title={l.label}
                                            onOpen={() => apply(l)}
                                        />
                                        <span class="text-center text-[11px] font-medium text-muted">
                                            {l.label}
                                        </span>
                                    </div>
                                )}
                            </For>
                        </div>
                    </Group>
                    <SchemaFields controls={SECTION_CONTROLS} read={read} write={write} />
                </div>
            )}
        </Show>
    );
};
