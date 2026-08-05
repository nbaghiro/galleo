import type { Component } from "solid-js";
import { createSignal, For, Show } from "solid-js";
import type { Beat } from "@model/ai";
import type { Rect } from "@engine/node";
import type { OutlineField } from "@elements/blueprint";
import { Button, IconButton } from "@ui/button";
import { Icon } from "@ui/icons";
import {
    barAction,
    barDangerAction,
    barIconAction,
    barPrimaryAction,
    barStepAction,
    FloatingBar,
    Popover,
} from "@ui/overlay";
import { Separator } from "@ui/inputs";
import { Dropdown } from "@ui/select";
import { isCoarsePointer } from "@ui/viewport";
import { Credits } from "../../components/credits";
import { blocksForLayout, LAYOUT_IDS } from "../../stores/generate-plan";
import {
    addBeatAfter,
    buildSectionNow,
    gen,
    moveBeatDir,
    patchBeat,
    removeBeatById,
    sectionCost,
} from "../../stores/generate";
import { BEAT_ROLES, LAYOUT_LABELS } from "./shared";
import { Field, Inline, Tag } from "./inline";

export type OutlineEdit = { field: OutlineField; box: Rect };

// Anchored over the region the engine painted, so the words are edited where they sit.
export const OutlineEditor: Component<{
    beat: Beat;
    edit: OutlineEdit;
    onClose: () => void;
}> = (props) => {
    const points = (): string[] => props.beat.points ?? [];
    const isPoint = (): boolean => props.edit.field.kind === "point";

    const valueOf = (f: OutlineField): string =>
        f.kind === "heading"
            ? props.beat.label
            : f.kind === "lead"
              ? (props.beat.takeaway ?? "")
              : (points()[f.index] ?? "");

    const commit = (f: OutlineField, v: string): void => {
        if (f.kind === "heading") patchBeat(props.beat.id, { label: v });
        else if (f.kind === "lead") patchBeat(props.beat.id, { takeaway: v });
        else {
            const next = [...points()];
            next[f.index] = v;
            patchBeat(props.beat.id, { points: next });
        }
    };

    const label = (f: OutlineField): string =>
        f.kind === "heading" ? "Section title" : f.kind === "lead" ? "Takeaway" : "Point";

    return (
        <div
            class="absolute z-raised flex items-start gap-1 rounded-md bg-panel p-1 ring-2 ring-accent"
            style={{
                left: `${Math.max(0, props.edit.box.x - 4)}px`,
                top: `${Math.max(0, props.edit.box.y - 4)}px`,
                // the remove control sits in the row, so widen to keep the text column intact
                width: `${Math.max(120, props.edit.box.w + 8) + (isPoint() ? 28 : 0)}px`,
            }}
        >
            <textarea
                aria-label={label(props.edit.field)}
                class="block max-h-48 min-w-0 flex-1 resize-none bg-transparent text-[13px] leading-relaxed text-ink outline-none"
                rows={Math.max(1, Math.round(props.edit.box.h / 20))}
                value={valueOf(props.edit.field)}
                ref={(el) =>
                    queueMicrotask(() => {
                        el.focus();
                        el.select();
                    })
                }
                onBlur={(ev) => {
                    commit(props.edit.field, ev.currentTarget.value);
                    props.onClose();
                }}
                onKeyDown={(ev) => {
                    if (ev.key === "Escape") {
                        ev.preventDefault();
                        props.onClose();
                    } else if (ev.key === "Enter" && !ev.shiftKey) {
                        ev.preventDefault();
                        ev.currentTarget.blur();
                    }
                }}
            />
            <Show when={isPoint()}>
                <IconButton
                    size={isCoarsePointer() ? "touch" : "xs"}
                    rounded="md"
                    tone="muted"
                    class="flex-none"
                    title="Remove this point"
                    // mousedown would blur the textarea and close this first
                    onMouseDown={(ev) => ev.preventDefault()}
                    onClick={() => {
                        const f = props.edit.field;
                        if (f.kind !== "point") return;
                        patchBeat(props.beat.id, {
                            points: points().filter((_, j) => j !== f.index),
                        });
                        props.onClose();
                    }}
                >
                    <Icon name="close" size={11} />
                </IconButton>
            </Show>
        </div>
    );
};

// The beat's controls, floated over the painted section. They are chrome, not content, so they stay
// out of the flow and a continuous format still merges section to section.
export const OutlineChrome: Component<{
    beat: Beat;
    index: number;
    total: number;
    selected: boolean;
}> = (props) => {
    const [details, setDetails] = createSignal(false);
    let anchor: HTMLButtonElement | undefined;
    const patch = (p: Partial<Beat>): void => patchBeat(props.beat.id, p);
    const points = (): string[] => props.beat.points ?? [];
    const covers = (): string[] => props.beat.covers ?? [];
    const busy = (): boolean => !!gen.activeSection;
    const touch = isCoarsePointer;
    // the editor shows one pill at a time (hovered, else selected); touch has no hover, so there
    // selection is the only trigger
    const shown = (): string =>
        props.selected
            ? "opacity-100"
            : touch()
              ? "opacity-0"
              : "opacity-0 group-hover:opacity-100";

    return (
        <>
            {/* mirrors the editor's section pill (editor/panels/Selection.tsx): same shape, shadow
                and straddled bottom edge, with this surface's own actions */}
            <FloatingBar
                tone="panel"
                rounded="full"
                shadow="lg"
                gap="0.5"
                anchor="free"
                class={`absolute left-1/2 z-panel -translate-x-1/2 transition-opacity focus-within:opacity-100 ${shown()}`}
                style={{ top: "calc(100% - 16px)" }}
                onPointerDown={(e) => e.stopPropagation()}
            >
                <div class="-my-1 flex flex-col justify-center">
                    <button
                        class={barStepAction}
                        disabled={props.index === 0}
                        title="Move section up"
                        onClick={() => moveBeatDir(props.beat.id, -1)}
                    >
                        <Icon name="chevronUp" size={13} />
                    </button>
                    <button
                        class={barStepAction}
                        disabled={props.index === props.total - 1}
                        title="Move section down"
                        onClick={() => moveBeatDir(props.beat.id, 1)}
                    >
                        <Icon name="chevronDown" size={13} />
                    </button>
                </div>
                <Separator vertical class="h-3.5" />
                <button
                    class={barPrimaryAction}
                    disabled={busy()}
                    title="Write this section now"
                    onClick={() => void buildSectionNow(props.beat.id)}
                >
                    <Icon name="sparkle" size={13} /> Write
                    <span class="hidden sm:inline">
                        · <Credits n={sectionCost()} />
                    </span>
                </button>
                <Separator vertical class="h-3.5" />
                <button
                    class={barAction}
                    title="Add a point to this section"
                    onClick={() => patch({ points: [...points(), ""] })}
                >
                    <Icon name="plus" size={13} />
                    <span class="hidden sm:inline">Point</span>
                </button>
                <Separator vertical class="h-3.5" />
                <button
                    ref={anchor}
                    class={barAction}
                    title="Brief, layout and role"
                    onClick={() => setDetails((v) => !v)}
                >
                    <Icon name="layout" size={13} />
                    <span class="hidden sm:inline">Details</span>
                </button>
                <Separator vertical class="h-3.5" />
                <button
                    class={barIconAction}
                    title="Add a section after this one"
                    onClick={() => addBeatAfter(props.beat.id)}
                >
                    <Icon name="plus" size={14} />
                </button>
                <button
                    class={barDangerAction}
                    title="Delete section"
                    onClick={() => removeBeatById(props.beat.id)}
                >
                    <Icon name="trash" size={14} />
                </button>
            </FloatingBar>

            <Popover
                anchor={() => anchor}
                open={details()}
                onClose={() => setDetails(false)}
                fixedWidth={320}
                estHeight={280}
                panelClass="p-3"
            >
                <div class="flex flex-col gap-2.5">
                    <Field label="What it must say">
                        <Inline
                            ariaLabel="Section brief"
                            class="text-[12.5px] leading-relaxed"
                            placeholder="One line telling the writer this section's job…"
                            value={props.beat.brief ?? ""}
                            onChange={(v) => patch({ brief: v })}
                        />
                    </Field>
                    <div class="flex flex-wrap items-end gap-3">
                        <div class="w-36">
                            <Field label="Layout">
                                <Dropdown
                                    compact
                                    value={props.beat.layout ?? "full"}
                                    options={LAYOUT_IDS.map((id) => ({
                                        value: id,
                                        label: LAYOUT_LABELS[id] ?? id,
                                    }))}
                                    onChange={(layout) =>
                                        patch({
                                            layout,
                                            blocks: blocksForLayout(layout, props.beat.blocks),
                                        })
                                    }
                                />
                            </Field>
                        </div>
                        <div class="w-32">
                            <Field label="Role">
                                <Dropdown
                                    compact
                                    value={props.beat.role}
                                    options={BEAT_ROLES.map((r) => ({ value: r, label: r }))}
                                    onChange={(role) => patch({ role })}
                                />
                            </Field>
                        </div>
                    </div>
                    <Button
                        variant={props.beat.image ? "outline" : "ghost"}
                        size="sm"
                        onClick={() => patch({ image: !props.beat.image })}
                    >
                        <Icon name="media" size={12} />
                        {props.beat.image ? "Leads with an image" : "No lead image"}
                    </Button>
                    <Show when={covers().length}>
                        <div class="flex flex-wrap gap-1 border-t border-line pt-2">
                            <For each={covers()}>{(c) => <Tag tone="accent">{c}</Tag>}</For>
                        </div>
                    </Show>
                </div>
            </Popover>
        </>
    );
};
