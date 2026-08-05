import type { Component } from "solid-js";
import { createMemo, createSignal, For, Show } from "solid-js";
import { Button, Eyebrow, IconButton } from "@ui/button";
import { CloseIcon } from "@ui/icons";
import { Modal } from "@ui/overlay";
import { Dropdown } from "@ui/select";
import { featuresState } from "../stores/features";
import { overlayThemeVars } from "../stores/theme";
import {
    clearModelOverrides,
    modelOverrides,
    overrideCount,
    setModelOverride,
} from "../stores/models";

// only reachable when the server says it will honour the header

const DEFAULT = "";

// in the order a generation walks through them
const STEPS: { task: string; label: string; note: string }[] = [
    { task: "brief", label: "Brief", note: "Expands a one-line prompt into goal, audience, tone" },
    { task: "outline", label: "Outline", note: "The arc: section beats, titles, takeaways" },
    { task: "section", label: "Sections", note: "Writes each beat into elements" },
    { task: "chat", label: "Chat", note: "The agent loop and its tool routing" },
    { task: "generate", label: "Generate (one-shot)", note: "The whole-artifact tool" },
    { task: "edit", label: "Edit", note: "Section and element revisions" },
    { task: "rewrite", label: "Rewrite", note: "Targeted text rewrites" },
    { task: "translate", label: "Translate", note: "Text translation" },
    { task: "theme", label: "Theme", note: "Theme generation from a prompt" },
];

const [open, setOpen] = createSignal(false);
export const openModelDebug = (): void => {
    setOpen(true);
};
export const modelDebugAvailable = (): boolean => !!featuresState()?.modelDebug;

const Row: Component<{
    step: { task: string; label: string; note: string };
    options: { label: string; value: string }[];
}> = (props) => (
    <div class="flex items-center gap-3 border-b border-line/60 py-2.5 last:border-b-0">
        <div class="min-w-0 flex-1">
            <div class="flex items-center gap-1.5">
                <span class="text-[13px] font-medium text-ink">{props.step.label}</span>
                <span class="font-mono text-[10px] text-muted">{props.step.task}</span>
            </div>
            <p class="truncate text-[11.5px] text-soft">{props.step.note}</p>
        </div>
        <div class="w-56 flex-none">
            <Dropdown
                compact
                value={modelOverrides()[props.step.task] ?? DEFAULT}
                options={props.options}
                onChange={(v) => setModelOverride(props.step.task, v)}
            />
        </div>
    </div>
);

export const ModelDebugModal: Component = () => {
    const info = () => featuresState()?.modelDebug ?? null;

    // the catalogue plus a "server default" entry, which is what clearing an override means
    const options = createMemo(() => [
        { label: "Server default", value: DEFAULT },
        ...(info()?.models ?? []).map((m) => ({ label: m.label, value: m.id })),
    ]);
    const steps = createMemo(() => {
        const tasks = info()?.tasks ?? [];
        return STEPS.filter((s) => tasks.includes(s.task));
    });

    return (
        <Show when={open() && info()}>
            <Modal
                size="md"
                scrim="blur"
                vars={overlayThemeVars()}
                class="p-5"
                onClose={() => setOpen(false)}
            >
                <div class="mb-3 flex items-start justify-between gap-4">
                    <div>
                        <h2 class="text-[16px] font-semibold text-ink">Models</h2>
                        <p class="mt-0.5 text-[12px] text-soft">
                            Pick the model each step runs on. Local to this browser, and only
                            honoured while the server has the debug flag on.
                        </p>
                    </div>
                    <IconButton onClick={() => setOpen(false)}>
                        <CloseIcon size={15} />
                    </IconButton>
                </div>

                <div class="max-h-[60vh] overflow-y-auto">
                    <For each={steps()}>{(step) => <Row step={step} options={options()} />}</For>
                </div>

                <div class="mt-4 flex items-center gap-3">
                    <Eyebrow weight="normal" tracking="wide">
                        <Show when={overrideCount()} fallback="all default">
                            {overrideCount()} overridden
                        </Show>
                    </Eyebrow>
                    <span class="flex-1" />
                    <Button
                        variant="ghost"
                        size="sm"
                        disabled={!overrideCount()}
                        onClick={clearModelOverrides}
                    >
                        Reset all
                    </Button>
                    <Button variant="primary" size="sm" onClick={() => setOpen(false)}>
                        Done
                    </Button>
                </div>
            </Modal>
        </Show>
    );
};
