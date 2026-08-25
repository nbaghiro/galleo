import type { Component } from "solid-js";
import { createMemo, For, Show } from "solid-js";
import type { Section, SectionBackground, SectionTone } from "@model/artifact";
import { SECTION_TONES } from "@model/artifact";
import { profileFor } from "@engine/profile";
import { SECTION_LAYOUTS, type SectionLayout } from "@elements/layouts";
import { setSectionBackground, setSectionBleed, setSectionPinned } from "@elements/ops";
import { SECTION_CONTROLS } from "@elements/spec";
import { ScaledSectionCanvas } from "@ui/section";
import { capture } from "@ui/analytics";
import { commit, editor, editorTokens } from "@editor/core/store";
import { SchemaFields, Group } from "./SharedControlFields";

const isTone = (v: string): v is SectionTone => (SECTION_TONES as readonly string[]).includes(v);

export const SectionLayoutPopup: Component<{ section: string }> = (props) => {
    const sec = createMemo(() => editor.artifact.sections.find((s) => s.id === props.section));
    const profile = createMemo(() => profileFor(editor.artifact));
    const frame = (): "slide" | "natural" =>
        profile().kind === "continuous" ? "natural" : "slide";
    const applicable = (s: Section): SectionLayout[] => SECTION_LAYOUTS.filter((l) => l.applies(s));
    // pinning needs a scroll to stick against, which only a continuous format has
    const controls = createMemo(() =>
        profile().kind === "continuous"
            ? SECTION_CONTROLS
            : SECTION_CONTROLS.filter((c) => c.key !== "pinned"),
    );

    const apply = (l: SectionLayout): void => {
        commit({
            ...editor.artifact,
            sections: editor.artifact.sections.map((s) =>
                s.id === props.section ? l.transform(s) : s,
            ),
        });
        capture("section_layout_changed", { preset: l.id });
    };

    const bg = (): SectionBackground => sec()?.background ?? { kind: "none" };
    const grad = (): { from: string; to: string; angle?: number } =>
        bg().gradient ?? { from: "#000000", to: "#ffffff", angle: 135 };
    const setBg = (patch: Partial<SectionBackground>, coalesce?: string): void =>
        commit(
            setSectionBackground(editor.artifact, props.section, { ...bg(), ...patch }),
            coalesce ? { coalesce } : undefined,
        );
    // slider/color drag continuously; coalesce the stream into one undo step
    const ck = (key: string): string | undefined => {
        const control = SECTION_CONTROLS.find((c) => c.key === key)?.control;
        return control === "slider" || control === "color"
            ? `sec:${props.section}:${key}`
            : undefined;
    };
    const setKind = (kind: string): void => {
        if (isTone(kind)) {
            capture("background_set", { kind });
            setBg({ kind: "tone", tone: kind });
            return;
        }
        if (kind === "color" || kind === "gradient" || kind === "image")
            capture("background_set", { kind });
        const t = editorTokens();
        if (kind === "color") setBg({ kind, color: bg().color ?? t.accent });
        else if (kind === "gradient")
            setBg({
                kind,
                gradient: bg().gradient ?? { from: t.accent, to: t.surface, angle: 135 },
            });
        // no image yet: the field below opens the picker, rather than dropping in a stand-in
        else if (kind === "image")
            setBg({ kind, image: bg().image ?? "", scrim: bg().scrim ?? 0.45 });
        else setBg({ kind: "none" });
    };
    const read = (key: string): unknown => {
        switch (key) {
            case "bleed":
                return sec()?.bleed ? "full" : "contained";
            case "pinned":
                return sec()?.pinned ?? false;
            // the segmented is flat: a tone shows as itself, not as the kind that stores it
            case "bgKind":
                return bg().kind === "tone" ? (bg().tone ?? "tint") : bg().kind;
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
            case "pinned":
                commit(setSectionPinned(editor.artifact, props.section, !!v));
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
                    <SchemaFields controls={controls()} read={read} write={write} />
                </div>
            )}
        </Show>
    );
};
