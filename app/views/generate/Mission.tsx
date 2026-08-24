import type { Component, JSX } from "solid-js";
import { createMemo, createSignal, onMount, Show } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { resolveTheme, themeCssVars } from "@themes";
import { Button, Eyebrow, IconButton, Spinner } from "@ui/button";
import { FormatSwitcher } from "@ui/inputs";
import { Icon } from "@ui/icons";
import { Modal } from "@ui/overlay";
import { viewportTier } from "@ui/viewport";
import { Credits } from "@app/components/Credits";
import { thread } from "@app/stores/chat";
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
    startBuild,
    startPlan,
    stopHere,
    type Surface,
} from "@app/stores/generate";
import { BriefBar } from "./panels";
import { Board } from "./Board";
import { Console } from "./Console";
import { Intake, intakeExpanded } from "./Intake";
import {
    phonePane,
    previewFormat,
    railPane,
    setRailPane,
    RAIL_WIDTH,
    railOpen,
    setPreviewFormat,
    togglePhonePane,
    toggleRail,
} from "./shared";
import { railMode } from "./layout";

export const Studio: Component = () => {
    const navigate = useNavigate();
    const [saving, setSaving] = createSignal(false);
    const [confirmingClose, setConfirmingClose] = createSignal(false);

    const panelVars = createMemo(
        (): JSX.CSSProperties =>
            themeCssVars(resolveTheme(gen.content.theme).tokens) as JSX.CSSProperties,
    );

    const intake = (): boolean => gen.stage === "intake";
    const switched = (): boolean => railMode(viewportTier()) === "switched";
    const boardHidden = (): boolean => switched() && !intake() && phonePane() === "chat";
    const railHidden = (): boolean => switched() && phonePane() === "board";
    // the console keeps the rail on a fresh run; the brief is a step you go and open
    onMount(() => setRailPane("chat"));

    const lastChatLine = (): string => {
        for (let i = thread.messages.length - 1; i >= 0; i--) {
            const text = thread.messages[i]!.blocks.map((b) => (b.k === "text" ? b.text : "")).join(
                "",
            );
            if (text.trim()) return text.trim();
        }
        return "Ask for a change…";
    };
    const building = (): boolean => gen.stage === "building";
    const planned = (): boolean => gen.beats.length > 0;

    // the draft becomes a library artifact only here, never mid-run
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

    const requestClose = (): void => {
        if (hasUnsavedWork() && !confirmingClose()) {
            setConfirmingClose(true);
            return;
        }
        closeGenerate();
    };

    // the prompt is a compact dialog over the library (wide when a pane swaps in);
    // the studio takes the screen once a run starts
    return (
        <Modal
            size={intake() ? (intakeExpanded() ? "full" : "lg") : "screen"}
            scrim={intake() ? "blur" : "light"}
            vars={panelVars()}
            class={`flex flex-col overflow-hidden ${intake() ? "md:max-h-[88vh]" : ""}`}
            onClose={requestClose}
        >
            {/* the intake dialog is chromeless — Escape or a click outside closes it */}
            <header
                class="flex flex-none items-center gap-3 border-b border-line bg-panel px-4 py-2.5"
                classList={{ hidden: intake() }}
            >
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
                    <span class="hidden flex-none font-mono text-[10.5px] text-muted md:inline">
                        <Credits n={gen.spent} suffix="spent" />
                    </span>
                    <span class="hidden md:block">
                        <FormatSwitcher
                            variant="accent"
                            value={previewFormat()}
                            onChange={(v) => setPreviewFormat(v as Surface)}
                        />
                    </span>
                </Show>
                <span class="w-9 flex-none" aria-hidden="true" />
            </header>

            <div class="flex min-h-0 flex-1">
                {/* the board owns paint refs, so a hidden pane is hidden, never unmounted */}
                <div
                    class="min-w-0 flex-1 flex-col"
                    classList={{ hidden: boardHidden(), flex: !boardHidden() }}
                >
                    <Show when={!intake()} fallback={<Intake />}>
                        <Board />
                    </Show>
                </div>

                {/* beside the board it stays mounted when collapsed (width animates to zero), so the
                    thread keeps its scroll position */}
                <Show when={!intake()}>
                    <div
                        class="relative h-full"
                        classList={{
                            "flex-none": !switched(),
                            "min-w-0 flex-1": switched(),
                            hidden: railHidden(),
                            flex: !railHidden(),
                        }}
                    >
                        <Show when={!switched()}>
                            {/* faint backdrop so the toggle stays legible over a photo */}
                            <button
                                class="absolute right-full top-2 z-[2] mr-1 flex size-6 items-center justify-center rounded-md bg-panel/70 text-muted backdrop-blur-sm transition-colors hover:bg-panel hover:text-ink"
                                title={railOpen() ? "Hide the console" : "Show the console"}
                                aria-expanded={railOpen()}
                                onClick={toggleRail}
                            >
                                <Icon
                                    name={railOpen() ? "chevronRight" : "chevronLeft"}
                                    size={12}
                                />
                            </button>
                        </Show>
                        {/* beside the board the explicit width drives the collapse, so it must not
                            also be a flex item with a zero basis */}
                        <div
                            class="h-full overflow-hidden md:transition-[width] md:duration-200 md:ease-out motion-reduce:transition-none"
                            classList={{ "min-w-0 flex-1": switched() }}
                            style={
                                switched()
                                    ? undefined
                                    : { width: `${railOpen() ? RAIL_WIDTH : 0}px` }
                            }
                        >
                            <div
                                class="flex h-full flex-col border-line bg-panel md:w-88 md:border-l"
                                classList={{ "w-full": switched() }}
                            >
                                <Show when={switched()}>
                                    <div class="flex flex-none items-center gap-2 border-b border-line px-3 py-2">
                                        <FormatSwitcher
                                            variant="accent"
                                            value={previewFormat()}
                                            onChange={(v) => setPreviewFormat(v as Surface)}
                                        />
                                        <span class="ml-auto flex-none font-mono text-[10.5px] text-muted">
                                            <Credits n={gen.spent} suffix="spent" />
                                        </span>
                                    </div>
                                </Show>
                                {/* an accordion: whichever pane is open takes the height and the
                                    other keeps only its header line */}
                                <BriefBar
                                    open={railPane() === "brief"}
                                    onToggle={() =>
                                        setRailPane(railPane() === "brief" ? "chat" : "brief")
                                    }
                                />
                                <div
                                    class="min-h-0 flex-1 flex-col"
                                    classList={{
                                        flex: railPane() === "chat",
                                        hidden: railPane() !== "chat",
                                    }}
                                >
                                    <Console active={railPane() === "chat"} />
                                </div>
                                <Show when={railPane() !== "chat"}>
                                    <button
                                        class="flex flex-none items-center gap-2 border-t border-line px-3 py-2 text-left transition-colors hover:bg-canvas"
                                        onClick={() => setRailPane("chat")}
                                    >
                                        <Eyebrow weight="normal" tracking="widest">
                                            Console
                                        </Eyebrow>
                                        <span class="min-w-0 flex-1 truncate text-[11.5px] text-soft">
                                            {lastChatLine()}
                                        </span>
                                        <Icon name="chevronUp" size={12} />
                                    </button>
                                </Show>
                            </div>
                        </div>
                    </div>
                </Show>
            </div>

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

            <Show when={!intake()}>
                <div class="flex flex-none flex-wrap items-center gap-x-2 gap-y-1.5 border-t border-line bg-panel px-3 md:gap-x-3 pb-[calc(0.625rem+env(safe-area-inset-bottom))] pt-2.5 md:px-4 md:pb-2.5">
                    {/* the one bar that is always there, so on a phone it also owns the pane switch */}
                    <Show when={switched()}>
                        <Button
                            variant="outline"
                            size="sm"
                            class="flex-none"
                            aria-pressed={phonePane() === "chat"}
                            onClick={togglePhonePane}
                        >
                            <Icon
                                name={phonePane() === "chat" ? "chevronLeft" : "sparkle"}
                                size={12}
                            />
                            {phonePane() === "chat" ? "Outline" : "Chat"}
                        </Button>
                    </Show>
                    <div class="flex min-w-0 flex-none flex-wrap items-center gap-1.5">
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
                            <Show
                                when={viewportTier() !== "phone"}
                                fallback={
                                    <IconButton
                                        size="md"
                                        tone="muted"
                                        disabled={gen.planning}
                                        title="Plan a different arc from the same brief"
                                        onClick={() => void startPlan()}
                                    >
                                        <Show when={!gen.planning} fallback={<Spinner size={11} />}>
                                            <Icon name="refresh" size={12} />
                                        </Show>
                                    </IconButton>
                                }
                            >
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
                                        <Icon name="refresh" size={12} />
                                        <span class="inline-flex icon-row gap-1">
                                            Reroll · <Credits n={planCost()} />
                                        </span>
                                    </Show>
                                </Button>
                            </Show>
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
                                        ▶ Write the rest
                                        <span class="hidden md:inline"> ({queuedCount()})</span> · ~
                                        <Credits n={remainingBuildCost()} />
                                    </Button>
                                </Show>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    title="Skip the rest and go straight to review"
                                    onClick={stopHere}
                                >
                                    Skip<span class="hidden md:inline"> the rest</span>
                                </Button>
                            </Show>
                        </Show>
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

                    <Show when={building() && gen.paused && queuedCount() > 0}>
                        {/* pause lands at the next section boundary, so say which side of it we're on */}
                        <span class="flex-none rounded-full bg-accent/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-accent">
                            <Show
                                when={!gen.activeSection}
                                fallback={
                                    <>
                                        Pausing
                                        <span class="hidden md:inline">
                                            {" "}
                                            · finishing this section
                                        </span>
                                    </>
                                }
                            >
                                Paused
                                <span class="hidden md:inline">
                                    {" "}
                                    · {queuedCount()} still to write
                                </span>
                            </Show>
                        </span>
                    </Show>
                    <span class="hidden min-w-0 flex-1 truncate font-mono text-[10px] text-muted md:block">
                        {gen.narration[gen.narration.length - 1]?.text ?? ""}
                    </span>
                    <Show when={planned()}>
                        <span class="ml-auto flex-none font-mono text-[10px] text-muted">
                            {builtCount()}/{gen.beats.length}
                            <span class="hidden md:inline"> written</span>
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
