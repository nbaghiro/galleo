import type { Component } from "solid-js";
import { createMemo, createSignal, For, Show } from "solid-js";
import { Button, Chip, Eyebrow } from "@ui/button";
import { Modal } from "@ui/overlay";
import { Dropdown, type DropdownOption } from "@ui/select";
import { featuresState } from "@app/stores/features";
import { artifacts } from "@app/stores/library";
import { relativeTime } from "@ui/time";
import { ArtifactThumb } from "./previews";
import {
    chooseModel,
    clearRuns,
    effectiveModel,
    isOverridden,
    modelLabel,
    modelRuns,
    type RunRecord,
} from "@app/stores/model-usage";
import { overlayThemeVars } from "@app/stores/theme";
import { UpgradeNotice } from "@app/components/Upgrade";
import { clearModelOverrides, overrideCount } from "@app/stores/models";

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
export const openModelPicker = (): void => {
    setOpen(true);
};
export const modelPickerReady = (): boolean => !!featuresState()?.models;

const Row: Component<{
    step: { task: string; label: string; note: string };
    options: DropdownOption[];
}> = (props) => (
    <div class="flex items-center justify-between gap-4 border-b border-line/60 py-2.5 last:border-b-0">
        <div class="min-w-0 flex-1">
            <div class="flex items-center gap-1.5">
                <span class="text-[13px] font-medium text-ink">{props.step.label}</span>
                <span class="font-mono text-[10px] text-muted">{props.step.task}</span>
            </div>
            <p class="truncate text-[11.5px] text-soft">
                <Show when={isOverridden(props.step.task)}>
                    <span class="text-accent">Overridden · </span>
                </Show>
                {props.step.note}
            </p>
        </div>
        <div class="w-56 flex-none">
            <Dropdown
                value={effectiveModel(props.step.task)}
                options={props.options}
                onChange={(v) => chooseModel(props.step.task, v)}
            />
        </div>
    </div>
);

const RunRow: Component<{ run: RunRecord }> = (props) => {
    const art = () =>
        props.run.artifactId ? artifacts().find((a) => a.id === props.run.artifactId) : undefined;
    return (
        <div class="flex items-start gap-2.5 border-b border-line/60 py-2.5 last:border-b-0">
            <div class="h-9 w-12 flex-none overflow-hidden rounded-md border border-line">
                <ArtifactThumb cover={art()?.cover} />
            </div>
            <div class="min-w-0 flex-1">
                <div class="flex items-baseline gap-2">
                    <span class="min-w-0 flex-1 truncate text-[12.5px] text-ink">
                        {art()?.title || props.run.label}
                    </span>
                    {/* saved runs carry the same record on the artifact, so it outlives this browser */}
                    <Show when={props.run.artifactId}>
                        <span class="flex-none font-mono text-[9px] uppercase tracking-wide text-accent">
                            stored
                        </span>
                    </Show>
                    <span class="flex-none font-mono text-[10px] text-muted">
                        {relativeTime(new Date(props.run.at).toISOString())}
                    </span>
                </div>
                <div class="mt-1 flex flex-wrap gap-1">
                    <For each={Object.entries(props.run.steps)}>
                        {([task, id]) => (
                            <Chip variant="outline" size="sm" rounded="md">
                                <span class="font-mono text-[9.5px] text-muted">{task}</span>
                                <span class="ml-1">{modelLabel(id)}</span>
                            </Chip>
                        )}
                    </For>
                </div>
            </div>
        </div>
    );
};

export const ModelPickerModal: Component = () => {
    const info = () => featuresState()?.models ?? null;

    // no "server default" entry: the server's own choice is preselected, so the list is only models;
    // models above the plan's tier are listed but marked — the server would ignore them anyway
    const options = createMemo(() =>
        (info()?.models ?? []).map((m) => ({
            label: m.locked ? `${m.label} · upgrade` : m.label,
            value: m.id,
            group: m.provider,
        })),
    );
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
                <div class="mb-3 max-md:pr-9">
                    <h2 class="text-[16px] font-semibold text-ink">Models</h2>
                    <p class="mt-0.5 text-[12px] text-soft">
                        Pick the model each step runs on, and see what recent runs used. Kept in
                        this browser, so it follows you rather than the workspace.
                    </p>
                </div>

                <div class="max-h-[58vh] overflow-y-auto">
                    <For each={steps()}>{(step) => <Row step={step} options={options()} />}</For>

                    {/* the list marks locked models but a mark does not say what to do about it */}
                    <Show when={(info()?.models ?? []).some((m) => m.locked)}>
                        <div class="mt-3">
                            <UpgradeNotice feature="textModelTier" title="Premium models">
                                Models marked “upgrade” sit above your plan’s tier, so a run falls
                                back to the default.
                            </UpgradeNotice>
                        </div>
                    </Show>

                    {/* the client-side answer to "what did that run use", so a comparison does not
                        need the server log */}
                    <Show when={modelRuns().length}>
                        <div class="mt-5 flex items-center gap-2">
                            <Eyebrow weight="normal" tracking="wide">
                                Recent runs
                            </Eyebrow>
                            <span class="h-px flex-1 bg-line" />
                            <button
                                class="text-[11px] text-muted transition-colors hover:text-ink"
                                onClick={clearRuns}
                            >
                                Clear
                            </button>
                        </div>
                        <For each={modelRuns()}>{(run) => <RunRow run={run} />}</For>
                    </Show>
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
