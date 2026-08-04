import type { Component, JSX } from "solid-js";
import { createMemo, createSignal, Show } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { resolveProfile } from "@engine/profile";
import { resolveTheme, themeCssVars } from "@themes";
import { backdropCss } from "@canvas/render/backends";
import { Button, Eyebrow, IconButton, Spinner } from "@ui/button";
import { FormatSwitcher, TextField } from "@ui/inputs";
import { CloseIcon, Icon } from "@ui/icons";
import { Modal } from "@ui/overlay";
import { Credits } from "../../components/credits";
import {
    builtCount,
    closeGenerate,
    hasUnsavedWork,
    gen,
    generateOpen,
    pauseBuild,
    planCost,
    queuedCount,
    remainingBuildCost,
    resumeBuild,
    retry,
    saveGenerated,
    setSteer,
    startBuild,
    startPlan,
    stopHere,
    type Surface,
} from "../../stores/generate";
import { BriefBar } from "./panels";
import { Board } from "./Board";
import { Console } from "./Console";
import { Intake } from "./Intake";
import { previewFormat, RAIL_WIDTH, railOpen, setPreviewFormat, toggleRail } from "./shared";

// The studio: one full-screen surface for the whole run. The prompt is its first body, the outline
// and the sections it becomes are the canvas, and the chat rail is alongside the whole way.

export const Studio: Component = () => {
    const navigate = useNavigate();
    const [saving, setSaving] = createSignal(false);
    const [confirmingClose, setConfirmingClose] = createSignal(false);

    const panelVars = createMemo(
        (): JSX.CSSProperties =>
            themeCssVars(resolveTheme(gen.content.theme).tokens) as JSX.CSSProperties,
    );

    const intake = (): boolean => gen.stage === "intake";
    const building = (): boolean => gen.stage === "building";
    const planned = (): boolean => gen.beats.length > 0;

    // the draft only becomes a library artifact here (or on finish) — never mid-run
    const openInEditor = async (): Promise<void> => {
        if (saving()) return;
        setSaving(true);
        try {
            const id = await saveGenerated(previewFormat());
            if (id) {
                closeGenerate();
                navigate(`/edit/${id}`);
            }
        } finally {
            setSaving(false);
        }
    };

    // closing with unkept work asks first, so a cancelled run can't quietly discard sections
    const requestClose = (): void => {
        if (hasUnsavedWork() && !confirmingClose()) {
            setConfirmingClose(true);
            return;
        }
        closeGenerate();
    };

    return (
        <Modal
            size="screen"
            scrim="light"
            vars={panelVars()}
            class="flex flex-col overflow-hidden"
            onClose={requestClose}
        >
            <header class="flex flex-none items-center gap-3 border-b border-line bg-panel px-4 py-2.5">
                <div class="min-w-0 flex-1">
                    <div class="flex items-baseline gap-2">
                        <span class="truncate text-[13.5px] font-semibold tracking-tight">
                            {gen.title || (intake() ? "Generate" : "New artifact")}
                        </span>
                        <Show when={!intake()}>
                            <Eyebrow weight="normal" tracking="widest">
                                {gen.stage}
                            </Eyebrow>
                        </Show>
                    </div>
                </div>
                <Show when={!intake()}>
                    <span class="flex-none font-mono text-[10.5px] text-muted">
                        <Credits n={gen.spent} suffix="spent" />
                    </span>
                    <FormatSwitcher
                        variant="accent"
                        value={previewFormat()}
                        onChange={(v) => setPreviewFormat(v as Surface)}
                    />
                </Show>
                <IconButton size="lg" tone="muted" title="Close" onClick={requestClose}>
                    <CloseIcon size={15} />
                </IconButton>
            </header>

            <Show when={!intake()}>
                <BriefBar />
            </Show>

            <div class="flex min-h-0 flex-1">
                <div class="flex min-w-0 flex-1 flex-col">
                    <Show when={!intake()} fallback={<Intake />}>
                        <Board />
                    </Show>
                </div>

                {/* the rail is the conversation, alongside the work rather than after it. It stays
                    MOUNTED when collapsed — width animates to zero — so the thread keeps its scroll
                    position and nothing re-runs on the way back. */}
                <Show when={!intake()}>
                    <div class="relative flex h-full flex-none">
                        {/* sits over the canvas in both states, so it keeps a faint backdrop to stay
                            legible over a photo — otherwise it would be chrome you can't find */}
                        <button
                            class="absolute right-full top-2 z-[2] mr-1 flex size-6 items-center justify-center rounded-md bg-panel/70 text-muted backdrop-blur-sm transition-colors hover:bg-panel hover:text-ink"
                            title={railOpen() ? "Hide the console" : "Show the console"}
                            aria-expanded={railOpen()}
                            onClick={toggleRail}
                        >
                            <Icon name={railOpen() ? "chevronRight" : "chevronLeft"} size={12} />
                        </button>
                        <div
                            class="h-full overflow-hidden transition-[width] duration-200 ease-out motion-reduce:transition-none"
                            style={{ width: `${railOpen() ? RAIL_WIDTH : 0}px` }}
                        >
                            <div class="flex h-full w-88 flex-col border-l border-line bg-panel">
                                <Show when={building() || gen.stage === "outline"}>
                                    <div class="flex-none border-b border-line px-3 py-2">
                                        <TextField
                                            compact
                                            icon="sparkle"
                                            value={gen.steer}
                                            placeholder="Steer every section still to come…"
                                            onChange={setSteer}
                                        />
                                    </div>
                                </Show>
                                <Console />
                            </div>
                        </div>
                    </div>
                </Show>
            </div>

            {/* a paused build says so where the work is, not just in the transport */}
            <Show when={building() && gen.paused && queuedCount() > 0}>
                <div class="flex flex-none items-center gap-3 border-t border-accent/40 bg-accent/5 px-4 py-2">
                    <span class="min-w-0 flex-1 text-[12.5px] text-ink">
                        Paused — {queuedCount()} section{queuedCount() > 1 ? "s" : ""} still to
                        write. Edit any of them below, or keep going.
                    </span>
                    <Button variant="primary" size="sm" onClick={resumeBuild}>
                        Write the rest →
                    </Button>
                </div>
            </Show>

            {/* discarding built work is a decision, not a side effect of hitting × */}
            <Show when={confirmingClose()}>
                <div class="flex flex-none items-center gap-3 border-t border-line bg-canvas px-4 py-2">
                    <span class="min-w-0 flex-1 text-[12.5px] text-ink">
                        {gen.content.sections.length} section
                        {gen.content.sections.length > 1 ? "s" : ""} built and not saved yet.
                        Discard them?
                    </span>
                    <Button variant="ghost" size="sm" onClick={() => setConfirmingClose(false)}>
                        Keep working
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        disabled={saving()}
                        onClick={() => void openInEditor()}
                    >
                        Save + open
                    </Button>
                    <Button variant="dangerGhost" size="sm" onClick={() => closeGenerate()}>
                        Discard
                    </Button>
                </div>
            </Show>

            {/* the transport */}
            <Show when={!intake()}>
                <div class="flex flex-none items-center gap-3 border-t border-line bg-panel px-4 py-2.5">
                    <div class="flex flex-none items-center gap-1.5">
                        <Show when={gen.stage === "outline"}>
                            <Button
                                variant="primary"
                                size="sm"
                                disabled={!planned()}
                                onClick={() => void startBuild()}
                            >
                                ▶ Write all {gen.beats.length} · ~
                                <Credits n={remainingBuildCost()} />
                            </Button>
                            <Button
                                variant="ghost"
                                size="sm"
                                disabled={gen.planning}
                                title="Plan a different arc from the same brief"
                                onClick={() => void startPlan()}
                            >
                                <Show
                                    when={!gen.planning}
                                    fallback={
                                        <>
                                            <Spinner size={11} /> Replanning…
                                        </>
                                    }
                                >
                                    <Icon name="refresh" size={12} /> Reroll ·{" "}
                                    <Credits n={planCost()} />
                                </Show>
                            </Button>
                        </Show>
                        <Show when={building()}>
                            {/* pause parks the queue at the next boundary; it never ends the run */}
                            <Show when={queuedCount() > 0}>
                                <Show
                                    when={gen.paused}
                                    fallback={
                                        <Button variant="ghost" size="sm" onClick={pauseBuild}>
                                            ⏸ Pause
                                        </Button>
                                    }
                                >
                                    <Button
                                        variant="primary"
                                        size="sm"
                                        disabled={!!gen.activeSection}
                                        onClick={resumeBuild}
                                    >
                                        ▶ Write the rest ({queuedCount()}) · ~
                                        <Credits n={remainingBuildCost()} />
                                    </Button>
                                </Show>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    title="Skip the rest and go straight to review"
                                    onClick={stopHere}
                                >
                                    Skip the rest
                                </Button>
                            </Show>
                        </Show>
                        {/* the way out is available the moment there's anything worth keeping */}
                        <Show when={gen.content.sections.length > 0}>
                            <Button
                                variant={gen.stage === "done" ? "primary" : "outline"}
                                size="sm"
                                disabled={saving()}
                                onClick={() => void openInEditor()}
                            >
                                <Show when={!saving()} fallback="Saving…">
                                    Open in editor →
                                </Show>
                            </Button>
                        </Show>
                        <Show when={gen.stage === "error"}>
                            <span class="mr-2 text-[12px] text-[#C0392B]">{gen.error}</span>
                            <Button variant="outline" size="sm" onClick={retry}>
                                Retry
                            </Button>
                        </Show>
                    </div>

                    <span class="min-w-0 flex-1 truncate font-mono text-[10px] text-muted">
                        {gen.narration[gen.narration.length - 1]?.text ?? ""}
                    </span>
                    <Show when={planned()}>
                        <span class="flex-none font-mono text-[10px] text-muted">
                            {builtCount()}/{gen.beats.length} written
                        </span>
                    </Show>
                </div>
            </Show>
        </Modal>
    );
};

export const GenerateStudio: Component = () => (
    <Show when={generateOpen()}>
        <Studio />
    </Show>
);

export const studioBackdrop = (): string =>
    backdropCss(gen.content.background, resolveTheme(gen.content.theme).tokens);
export const studioGap = (): string =>
    resolveProfile(previewFormat()).kind === "continuous" ? "0px" : "22px";
