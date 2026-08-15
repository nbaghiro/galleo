import type { Component, JSX } from "solid-js";
import {
    createEffect,
    createMemo,
    createSignal,
    For,
    Match,
    onMount,
    Show,
    Switch,
} from "solid-js";
import type { Tokens } from "@themes";
import { themeCssVars } from "@themes";
import type { ElementAddress, SectionBackground } from "@model/artifact";
import { setArtifactFormat, getElementAt } from "@elements/ops";
import { getElement, listElements } from "@elements/spec";
import { installKeyDispatcher } from "@ui/keys";
import { Button, Eyebrow, IconButton } from "@ui/button";
import { Icon, UiThemeProvider } from "@ui/icons";
import { TextField, FormatSwitcher } from "@ui/inputs";
import { FloatingPanel, Sheet } from "@ui/overlay";
import { isPhone } from "@ui/viewport";
import { resolveProfile } from "@engine/profile";
import { Canvas, Thumb } from "./Canvas";
import { Present } from "./Present";
import { DataEditor } from "./panels/DataEditor";
import { ExportModal, openExportModal } from "./panels/ExportModal";
import { DragGhost, PaletteItem } from "./panels/Insert";
import { ElementInspector } from "./panels/RightPanel";
import { pickArtifactBackground } from "./core/media";
import { setSectionBackground, clearBackgroundImage } from "@elements/ops";
import { SectionLayoutPopup } from "./panels/SectionLayoutPopup";
import { openSectionPrompt } from "./core/ai";
import { pickMedia } from "./core/media";
import {
    addSectionAfter,
    artifacts,
    canRedo,
    canUndo,
    commit,
    duplicateSectionAt,
    removeSectionAt,
    currentArtifactId,
    editor,
    editorTheme,
    editorTokens,
    ensureAllSections,
    features,
    leftOpen,
    moveSectionBy,
    present,
    redo,
    renameArtifact,
    requestHome,
    requestShare,
    requestThemePicker,
    requestUpgrade,
    rightTab,
    selection,
    setLeftOpen,
    setRightTab,
    setSlideFrame,
    slideFrame,
    undo,
} from "./core/store";

export const Editor: Component = () => {
    // idempotent, so it is safe when the app shell already installed it
    onMount(() => installKeyDispatcher());

    const vars = createMemo(
        (): JSX.CSSProperties =>
            ({
                ...themeCssVars(editorTokens()),
                "--panel-shadow": panelShadow(editorTokens()),
            }) as JSX.CSSProperties,
    );

    return (
        <UiThemeProvider tokens={editorTokens}>
            <div
                class="grid h-dvh grid-rows-[52px_1fr] overflow-hidden bg-canvas text-ink"
                style={vars()}
            >
                <Topbar />
                <div class="relative min-h-0 overflow-hidden">
                    <Canvas />
                    <BackdropCornerButton />
                    <Show when={!isPhone()}>
                        <Show
                            when={leftOpen()}
                            fallback={
                                <IconButton
                                    size="xl"
                                    bordered
                                    tone="muted"
                                    rounded="xl"
                                    class="absolute left-3 top-1/2 z-panel -translate-y-1/2 bg-panel/95 shadow-lg backdrop-blur-md"
                                    title="Sections"
                                    onClick={() => setLeftOpen(true)}
                                >
                                    <Icon name="sections" />
                                </IconButton>
                            }
                        >
                            <Minimap />
                        </Show>
                        <Panel />
                    </Show>
                    <Show when={isPhone()}>
                        <PhoneChrome />
                    </Show>
                </div>
                <DragGhost />
                <Present />
                <DataEditor />
                <ExportModal />
            </div>
        </UiThemeProvider>
    );
};

// compact (small offset + spread) so the shadow isn't clipped by the overflow-hidden canvas
const BASE_PANEL_SHADOW = "0 8px 24px -8px rgba(0,0,0,0.5)";

// dampened echo of the theme's card shadow (alpha × k) so chrome tints a step softer than content
function dampenShadow(shadow: string | undefined, k: number): string {
    if (!shadow || shadow === "none") return "";
    return shadow
        .replace(/rgba?\(([^)]+)\)/g, (_m, inner: string) => {
            const p = inner.split(",").map((x) => x.trim());
            const a = (p.length === 4 ? parseFloat(p[3]!) : 1) * k;
            return `rgba(${p[0]}, ${p[1]}, ${p[2]}, ${a.toFixed(3)})`;
        })
        .replace(/#([0-9a-fA-F]{6})\b/g, (_m, hex: string) => {
            const n = (i: number): number => parseInt(hex.slice(i, i + 2), 16);
            return `rgba(${n(0)}, ${n(2)}, ${n(4)}, ${k.toFixed(3)})`;
        });
}

function panelShadow(t: Tokens): string {
    const echo = dampenShadow(t.shadow, 0.6);
    return echo ? `${BASE_PANEL_SHADOW}, ${echo}` : BASE_PANEL_SHADOW;
}

const ArtifactName: Component = () => {
    const [renaming, setRenaming] = createSignal(false);
    const [draft, setDraft] = createSignal("");
    const current = createMemo(
        () => artifacts().find((d) => d.id === currentArtifactId())?.title ?? "Untitled",
    );
    let inputEl: HTMLInputElement | undefined;
    const startRename = (): void => {
        setDraft(current());
        setRenaming(true);
        queueMicrotask(() => {
            inputEl?.focus();
            inputEl?.select();
        });
    };
    const commitRename = (): void => {
        if (!renaming()) return;
        renameArtifact(draft());
        setRenaming(false);
    };

    return (
        <Show
            when={renaming()}
            fallback={
                <button
                    class="min-w-0 max-w-25 cursor-text truncate rounded px-1 text-[13px] text-muted hover:text-ink md:max-w-40 lg:max-w-none"
                    title="Rename"
                    onClick={startRename}
                >
                    {current()}
                </button>
            }
        >
            <input
                ref={(el) => (inputEl = el)}
                class="rounded-md border border-line bg-canvas px-2 py-1.5 text-[13px] font-semibold text-ink outline-none focus:border-accent"
                size={Math.max(draft().length, 8)}
                value={draft()}
                onInput={(e) => setDraft(e.currentTarget.value)}
                onBlur={commitRename}
                onKeyDown={(e) => {
                    e.stopPropagation(); // don't leak ⌘Z/Escape to the canvas' global shortcuts
                    if (e.key === "Enter") {
                        e.preventDefault();
                        commitRename();
                    } else if (e.key === "Escape") {
                        e.preventDefault();
                        setRenaming(false);
                    }
                }}
            />
        </Show>
    );
};

const HistoryButtons: Component = () => (
    <div class="flex items-center gap-0.5">
        <IconButton size="lg" tone="soft" disabled={!canUndo()} title="Undo (⌘Z)" onClick={undo}>
            <Icon name="undo" size={15} />
        </IconButton>
        <IconButton size="lg" tone="soft" disabled={!canRedo()} title="Redo (⌘⇧Z)" onClick={redo}>
            <Icon name="redo" size={15} />
        </IconButton>
    </div>
);

const Swatch: Component<{ surface: string; ink: string; accent: string }> = (props) => (
    <span class="flex h-4 w-4 overflow-hidden rounded-full border border-line">
        <span class="h-full w-1/2" style={{ background: props.surface }} />
        <span class="h-full w-1/4" style={{ background: props.ink }} />
        <span class="h-full w-1/4" style={{ background: props.accent }} />
    </span>
);

const ThemeMenu: Component = () => {
    const current = createMemo(() => editorTheme());
    return (
        <Button variant="tool" size="sm" title="Theme" onClick={() => requestThemePicker()}>
            <Swatch
                surface={current().tokens.surface}
                ink={current().tokens.ink}
                accent={current().tokens.accent}
            />
            <span class="hidden lg:inline">{current().name}</span>
        </Button>
    );
};

// only when no image is set; with one, you replace it by double-clicking the backdrop (see Canvas)
const BackdropCornerButton: Component = () => {
    const noImage = (): boolean => {
        const bg = editor.artifact.background;
        return !(bg?.kind === "image" && bg.image);
    };
    return (
        <Show when={noImage()}>
            <IconButton
                size="md"
                bordered
                tone="muted"
                rounded="lg"
                class="absolute right-4 top-4 z-panel bg-panel/90 shadow-lg backdrop-blur-md"
                title="Set document background image"
                onClick={() => pickArtifactBackground()}
            >
                <Icon name="media" size={14} />
            </IconButton>
        </Show>
    );
};

const ExportButton: Component = () => (
    <Button variant="tool" size="sm" onClick={() => openExportModal()}>
        <Icon name="export" size={14} /> <span class="hidden lg:inline">Export</span>
    </Button>
);

const ShareButton: Component = () => (
    <Button
        variant="tool"
        size="sm"
        title={features().publicLinks ? "Share" : "Sharing is a paid feature · upgrade"}
        onClick={() => (features().publicLinks ? requestShare() : requestUpgrade())}
    >
        <Icon name={features().publicLinks ? "link" : "lock"} size={14} />
        <span class="hidden lg:inline">Share</span>
    </Button>
);

// phone: format · theme · share · export fold into one sheet behind a "⋯"
const TopbarMore: Component = () => {
    const [open, setOpen] = createSignal(false);
    return (
        <>
            <IconButton
                size="lg"
                tone="soft"
                class="md:hidden"
                title="More"
                onClick={() => setOpen(true)}
            >
                <Icon name="more" size={16} />
            </IconButton>
            <Sheet open={open()} title="Document" onClose={() => setOpen(false)}>
                <div class="flex flex-col gap-4">
                    <div class="flex items-center justify-between gap-3">
                        <span class="text-[12.5px] text-soft">Format</span>
                        <FormatSwitcher
                            value={editor.artifact.format}
                            onChange={(v) => commit(setArtifactFormat(editor.artifact, v))}
                        />
                    </div>
                    <div class="flex items-center justify-between gap-3">
                        <span class="text-[12.5px] text-soft">Theme</span>
                        <ThemeMenu />
                    </div>
                    {/* these open their own modal above the sheet, so the sheet steps aside */}
                    <div class="flex items-center gap-2" onClick={() => setOpen(false)}>
                        <ShareButton />
                        <ExportButton />
                    </div>
                </div>
            </Sheet>
        </>
    );
};

const Topbar: Component = () => (
    <header class="relative z-menu flex items-center gap-2 border-b border-line bg-panel px-3 md:gap-3.5 md:px-4.5">
        <button
            class="cursor-pointer font-mono text-[15px] font-bold tracking-wide text-accent hover:opacity-80"
            title="Back to library"
            onClick={() => requestHome()}
        >
            GALLEO
        </button>
        <ArtifactName />
        <HistoryButtons />
        <span class="flex-1" />
        <div class="hidden items-center gap-3.5 md:flex">
            <FormatSwitcher
                value={editor.artifact.format}
                onChange={(v) => commit(setArtifactFormat(editor.artifact, v))}
            />
            <ThemeMenu />
            <ShareButton />
            <ExportButton />
        </div>
        <Button
            variant="tool"
            size="sm"
            onClick={() => {
                void ensureAllSections(); // Present walks the whole deck
                present();
            }}
        >
            <Icon name="present" size={14} />
            <span class="hidden lg:inline">
                {editor.artifact.format === "deck" ? "Present" : "Preview"}
            </span>
        </Button>
        <TopbarMore />
    </header>
);

// The section rail's body, shared by the desktop minimap and the phone Sections sheet.
// `cols` lays thumbs as a 2-up grid and drops the reorder grips (hover-revealed, so they never
// existed on touch anyway — Y-midpoint reordering also has no meaning in a grid).
const SectionList: Component<{ root: () => HTMLElement | undefined; cols?: boolean }> = (props) => {
    const [dragIx, setDragIx] = createSignal<number | null>(null);
    const [overIx, setOverIx] = createSignal<number | null>(null);
    const rowEls: (HTMLElement | undefined)[] = [];
    // key by section id, not object ref, or a content edit remounts the thumb every keystroke
    const sectionIds = createMemo(() => editor.artifact.sections.map((s) => s.id));

    const startReorder = (ix: number, e: PointerEvent): void => {
        e.preventDefault();
        e.stopPropagation();
        setDragIx(ix);
        setOverIx(ix);
        const move = (ev: PointerEvent): void => {
            const n = editor.artifact.sections.length;
            let over = n;
            for (let i = 0; i < n; i++) {
                const el = rowEls[i];
                if (!el) continue;
                const r = el.getBoundingClientRect();
                if (ev.clientY < r.top + r.height / 2) {
                    over = i;
                    break;
                }
            }
            setOverIx(over);
        };
        const up = (): void => {
            const from = dragIx();
            const over = overIx();
            if (from !== null && over !== null) {
                // `over` is the gap to drop before (0..n); removing `from` first shifts later slots.
                const final = over > from ? over - 1 : over;
                const id = editor.artifact.sections[from]?.id;
                if (id && final !== from) moveSectionBy(id, final - from);
            }
            setDragIx(null);
            setOverIx(null);
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", up);
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
    };

    return (
        <div class={props.cols ? "grid grid-cols-2 gap-3" : "flex flex-col gap-3"}>
            <For each={sectionIds()}>
                {(id, i) => {
                    const section = createMemo(() =>
                        editor.artifact.sections.find((s) => s.id === id),
                    );
                    return (
                        <Show when={section()}>
                            {(s) => (
                                <div class="group relative" ref={(el) => (rowEls[i()] = el)}>
                                    <Show when={dragIx() !== null && overIx() === i()}>
                                        <div class="absolute -top-1.5 left-0 right-0 h-0.5 rounded bg-accent" />
                                    </Show>
                                    <div class={dragIx() === i() ? "opacity-40" : ""}>
                                        <Thumb section={s()} index={i()} root={props.root} />
                                    </div>
                                    <Show when={!props.cols}>
                                        <button
                                            class="absolute left-0 top-1/2 z-raised flex h-6 w-4 -translate-y-1/2 cursor-grab items-center justify-center rounded text-muted opacity-0 transition-opacity group-hover:opacity-100 active:cursor-grabbing"
                                            title="Drag to reorder"
                                            onPointerDown={(e) => startReorder(i(), e)}
                                        >
                                            <Icon name="grip" size={14} />
                                        </button>
                                    </Show>
                                </div>
                            )}
                        </Show>
                    );
                }}
            </For>
            <Show when={dragIx() !== null && overIx() === editor.artifact.sections.length}>
                <div class="h-0.5 rounded bg-accent" />
            </Show>
            <button
                onClick={() => addSectionAfter(null)}
                class={`mt-1 rounded-lg border border-dashed border-line py-2 text-[11px] font-semibold text-muted hover:border-accent hover:text-accent ${
                    props.cols ? "col-span-2" : ""
                }`}
            >
                + Section
            </button>
        </div>
    );
};

const Minimap: Component = () => {
    let asideEl: HTMLElement | undefined; // IO root for thumbnail visibility
    return (
        <FloatingPanel
            as="aside"
            pad="md"
            shadow="panel"
            ref={(el) => (asideEl = el)}
            class="absolute left-3 top-1/2 z-panel flex max-h-[calc(100%-44px)] w-45.5 -translate-y-1/2 flex-col gap-3 overflow-y-auto"
        >
            <div class="flex items-center justify-between pl-1">
                <Eyebrow mono={false}>Sections</Eyebrow>
                <div class="flex items-center gap-0.5">
                    {/* paged only: a doc/site has no page shape to hold sections to */}
                    <Show when={resolveProfile(editor.artifact.format).kind === "paged"}>
                        <IconButton
                            size="xs"
                            tone="muted"
                            active={slideFrame()}
                            title={
                                slideFrame()
                                    ? "Fit sections to content"
                                    : "Frame sections as slides"
                            }
                            onClick={() => setSlideFrame((v) => !v)}
                        >
                            <Icon name="deck" size={12} />
                        </IconButton>
                    </Show>
                    <IconButton
                        size="xs"
                        tone="muted"
                        title="Hide"
                        onClick={() => setLeftOpen(false)}
                    >
                        <Icon name="close" size={12} />
                    </IconButton>
                </div>
            </div>
            <SectionList root={() => asideEl} />
        </FloatingPanel>
    );
};

// hidden from the palette: internals with no standalone meaning
const HIDDEN = new Set(["group", "avatar"]);
const CAT_ORDER = ["text", "media", "table", "composite", "chart", "diagram", "basic"];
const CAT_LABEL: Record<string, string> = {
    text: "Text",
    media: "Media",
    table: "Table",
    composite: "Composite",
    chart: "Charts",
    diagram: "Diagrams",
    basic: "Basic",
};

// selection-derived chrome state, shared by the desktop rail and the phone bottom bar
const selectedElementAddr = (): ElementAddress | null => {
    const s = selection();
    return s?.kind === "element" ? s.address : null;
};
// fully on-canvas-editable elements skip the panel; a frame forces it, for the radius slider
const selectedInline = (): boolean => {
    const a = selectedElementAddr();
    if (!a) return false;
    const spec = getElement(getElementAt(editor.artifact, a)?.type ?? "");
    if (!spec) return false;
    if (spec.richText) return true;
    if (spec.frame) return false;
    const bar = spec.bar ?? [];
    return spec.controls.every((c) => bar.includes(c.key));
};
const selectedLabel = (): string | null => {
    const a = selectedElementAddr();
    if (!a || selectedInline()) return null;
    const type = getElementAt(editor.artifact, a)?.type;
    return (type && getElement(type)?.label) || "Element";
};
const selectedSectionId = (): string | null => {
    const s = selection();
    return s ? (s.kind === "section" ? s.section : s.address.section) : null;
};

// a non-inline selection opens the inspector; inline elements and sections are handled elsewhere
const useInspectorAutoOpen = (): void => {
    createEffect(() => {
        const s = selection();
        const showInspector = s?.kind === "element" && !selectedInline();
        if (showInspector) setRightTab("inspector");
        else setRightTab((t) => (t === "inspector" ? null : t));
    });
};

const Panel: Component = () => {
    const [q, setQ] = createSignal("");
    const all = listElements().filter((s) => !HIDDEN.has(s.type));
    const cats = createMemo(() => CAT_ORDER.filter((c) => all.some((s) => s.category === c)));
    useInspectorAutoOpen();

    const items = createMemo(() => {
        const query = q().trim().toLowerCase();
        if (query)
            return all.filter(
                (s) => s.label.toLowerCase().includes(query) || s.type.includes(query),
            );
        const tab = rightTab();
        return tab && tab !== "inspector" && tab !== "search"
            ? all.filter((s) => s.category === tab)
            : all;
    });

    const railBtn = (id: string, label: string): JSX.Element => (
        <IconButton
            size="xl"
            tone="muted"
            active={rightTab() === id}
            title={label}
            onClick={() => setRightTab((t) => (t === id ? null : id))}
        >
            <Icon name={id} />
        </IconButton>
    );

    return (
        <div class="absolute right-3 top-1/2 z-chrome flex -translate-y-1/2 items-stretch gap-2">
            <Show when={rightTab()}>
                {(tab) => (
                    <FloatingPanel
                        as="aside"
                        pad="lg"
                        shadow="panel"
                        class="flex max-h-[calc(100dvh-120px)] w-60 flex-col overflow-y-auto lg:w-71"
                    >
                        <Show
                            when={tab() === "inspector"}
                            fallback={
                                <>
                                    <Eyebrow as="div" mono={false} weight="semibold" class="mb-3">
                                        {tab() === "search"
                                            ? "All elements"
                                            : (CAT_LABEL[tab()] ?? tab())}
                                    </Eyebrow>
                                    <TextField
                                        type="search"
                                        value={q()}
                                        placeholder="Search elements…"
                                        class="mb-4"
                                        onChange={setQ}
                                    />
                                    <div class="grid grid-cols-2 gap-3">
                                        <For each={items()}>
                                            {(s) => <PaletteItem type={s.type} />}
                                        </For>
                                    </div>
                                    <Show when={items().length === 0}>
                                        <p class="text-[13px] text-muted">No elements match.</p>
                                    </Show>
                                </>
                            }
                        >
                            <Switch
                                fallback={
                                    <p class="text-[13px] text-muted">
                                        Select something to edit it.
                                    </p>
                                }
                            >
                                <Match when={!selectedInline() && selectedElementAddr()}>
                                    {(a) => <ElementInspector address={a()} />}
                                </Match>
                            </Switch>
                        </Show>
                    </FloatingPanel>
                )}
            </Show>

            <FloatingPanel pad="sm" shadow="panel" class="flex flex-col gap-1 self-center">
                <Show when={selectedLabel()}>{(label) => railBtn("inspector", label())}</Show>
                {railBtn("search", "Search")}
                <For each={cats()}>{(c) => railBtn(c, CAT_LABEL[c] ?? c)}</For>
            </FloatingPanel>
        </div>
    );
};

// Phone chrome: the floating rails re-home into a bottom bar opening non-modal sheets over the
// full-bleed canvas. Same stores, same tabs signal — only the housing differs.
const PhoneChrome: Component = () => {
    const [q, setQ] = createSignal("");
    const all = listElements().filter((s) => !HIDDEN.has(s.type));
    useInspectorAutoOpen();
    const items = createMemo(() => {
        const query = q().trim().toLowerCase();
        return query
            ? all.filter((s) => s.label.toLowerCase().includes(query) || s.type.includes(query))
            : all;
    });
    const toggle = (id: string): void => {
        setRightTab((t) => (t === id ? null : id));
    };
    const barBtn = (id: string, icon: string, label: string): JSX.Element => (
        <IconButton
            size="touch"
            tone="muted"
            active={rightTab() === id}
            title={label}
            onClick={() => toggle(id)}
        >
            <Icon name={icon} size={17} />
        </IconButton>
    );
    let sectionsBody: HTMLDivElement | undefined;
    return (
        <>
            <div class="absolute inset-x-0 bottom-0 z-chrome flex items-center justify-around border-t border-line bg-panel/95 px-3 pb-[env(safe-area-inset-bottom)] backdrop-blur-md">
                {barBtn("sections", "sections", "Sections")}
                {barBtn("search", "plus", "Insert")}
                <Show when={selectedSectionId()}>{barBtn("section", "layout", "Section")}</Show>
                <Show when={selectedLabel()}>
                    {(label) => barBtn("inspector", "edit", label())}
                </Show>
            </div>
            <Sheet
                open={rightTab() === "sections"}
                title="Sections"
                tall
                onClose={() => setRightTab(null)}
            >
                <div ref={sectionsBody}>
                    <SectionList root={() => sectionsBody} cols />
                </div>
            </Sheet>
            <Sheet
                open={rightTab() === "search"}
                title="Insert"
                tall
                onClose={() => setRightTab(null)}
            >
                <TextField
                    type="search"
                    value={q()}
                    placeholder="Search elements…"
                    class="mb-4"
                    onChange={setQ}
                />
                {/* touching a tile starts its canvas drag; close the sheet so the drop target shows */}
                <div
                    class="grid grid-cols-3 gap-3"
                    onPointerDown={() => queueMicrotask(() => setRightTab(null))}
                >
                    <For each={items()}>{(s) => <PaletteItem type={s.type} />}</For>
                </div>
                <Show when={items().length === 0}>
                    <p class="text-[13px] text-muted">No elements match.</p>
                </Show>
            </Sheet>
            <Sheet
                open={rightTab() === "inspector" && !!selectedElementAddr()}
                title={selectedLabel() ?? "Element"}
                onClose={() => setRightTab(null)}
            >
                <Show when={selectedElementAddr()}>
                    {(a) => <ElementInspector address={a()} />}
                </Show>
            </Sheet>
            <Sheet
                open={rightTab() === "section" && !!selectedSectionId()}
                title="Section"
                tall
                onClose={() => setRightTab(null)}
            >
                <Show when={selectedSectionId()}>
                    {(sid) => <SectionSheetBody sid={sid()} onDone={() => setRightTab(null)} />}
                </Show>
            </Sheet>
        </>
    );
};

// the phone home for everything the hover pill offers on wide tiers, plus the layout presets
const SectionSheetBody: Component<{ sid: string; onDone: () => void }> = (props) => {
    const ix = createMemo(() => editor.artifact.sections.findIndex((s) => s.id === props.sid));
    const bg = (): SectionBackground | undefined =>
        editor.artifact.sections.find((s) => s.id === props.sid)?.background;
    const pickBg = (): void => {
        const cur = bg();
        props.onDone(); // the media picker is a modal; the sheet steps aside
        pickMedia(
            (url) =>
                commit(
                    setSectionBackground(editor.artifact, props.sid, {
                        ...cur,
                        kind: "image",
                        image: url,
                    }),
                ),
            "photo",
            cur?.image
                ? () =>
                      commit(
                          setSectionBackground(editor.artifact, props.sid, {
                              ...clearBackgroundImage(cur),
                          }),
                      )
                : undefined,
        );
    };
    const act = (icon: string, label: string, run: () => void, disabled = false): JSX.Element => (
        <IconButton
            size="touch"
            tone="muted"
            bordered
            rounded="lg"
            title={label}
            disabled={disabled}
            onClick={run}
        >
            <Icon name={icon} size={16} />
        </IconButton>
    );
    return (
        <div class="flex flex-col gap-4">
            <div class="flex flex-wrap items-center gap-2">
                {act("chevronUp", "Move up", () => moveSectionBy(props.sid, -1), ix() <= 0)}
                {act(
                    "chevronDown",
                    "Move down",
                    () => moveSectionBy(props.sid, 1),
                    ix() === editor.artifact.sections.length - 1,
                )}
                {act("plus", "Add a section below", () => addSectionAfter(props.sid))}
                {act("sparkle", "Generate a section here", () => {
                    props.onDone();
                    openSectionPrompt(props.sid);
                })}
                {act("media", "Background image", pickBg)}
                {act("duplicate", "Duplicate", () => duplicateSectionAt(props.sid))}
                {act("trash", "Delete", () => {
                    props.onDone();
                    removeSectionAt(props.sid);
                })}
            </div>
            <SectionLayoutPopup section={props.sid} />
        </div>
    );
};
