import type { Component, JSX } from "solid-js";
import {
    createEffect,
    createMemo,
    createSignal,
    For,
    Match,
    onCleanup,
    onMount,
    Show,
    Switch,
    on,
} from "solid-js";
import type { Tokens } from "@themes";
import { themeCssVars } from "@themes";
import type { ElementAddress, SectionBackground } from "@model/artifact";
import type { Peer } from "@model/collab";
import { getElementAt } from "@elements/ops";
import { getElement, listElements } from "@elements/spec";
import { installKeyDispatcher } from "@ui/keys";
import { Badge, Button, Eyebrow, IconButton } from "@ui/button";
import { Avatar } from "@ui/avatar";
import { Icon, UiThemeProvider } from "@ui/icons";
import { TextField, FormatSwitcher } from "@ui/inputs";
import { FloatingPanel, OverlayOwner, Sheet } from "@ui/overlay";
import { dismissalFor, newOwnerToken, pressInside } from "@ui/gesture";
import { isDesktop, isPhone } from "@ui/viewport";
import { resolveProfile } from "@engine/profile";
import { Canvas, Thumb } from "./Canvas";
import { Present } from "./Present";
import { DataEditor } from "./panels/DataEditor";
import { ExportModal, openExportModal } from "./panels/ExportModal";
import { DragGhost, PaletteItem } from "./panels/Insert";
import { ElementInspector, MultiSelectPanel } from "./panels/RightPanel";
import { CommentSheets } from "./panels/Comments";
import { collabActive, following, otherPeers, toggleFollow } from "./core/collab";
import { drag } from "./core/dnd";
import { pickArtifactBackground } from "./core/media";
import { setSectionBackground, clearBackgroundImage } from "@elements/ops";
import { SectionLayoutPopup } from "./panels/SectionLayoutPopup";
import { openSectionPrompt } from "./core/ai";
import { pickMedia } from "./core/media";
import {
    addSectionAfter,
    artifacts,
    canComment,
    canEdit,
    canRedo,
    canUndo,
    commit,
    currentArtifactId,
    duplicateSectionAt,
    editor,
    editorTheme,
    editorTokens,
    ensureAllSections,
    extras,
    features,
    leftOpen,
    moveSectionBy,
    multiSelected,
    present,
    redo,
    removeSectionAt,
    renameArtifact,
    requestHome,
    requestShare,
    requestThemePicker,
    requestUpgrade,
    rightTab,
    selectedAddresses,
    selection,
    setLeftOpen,
    setRightTab,
    takeDropSelection,
    setSlideFrame,
    slideFrame,
    switchFormat,
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

    const NAME_CLASS =
        "min-w-0 max-w-25 truncate rounded px-1 text-[13px] text-muted md:max-w-40 lg:max-w-none";

    return (
        <Show
            when={renaming()}
            fallback={
                <Show when={canEdit()} fallback={<span class={NAME_CLASS}>{current()}</span>}>
                    <button
                        class={`${NAME_CLASS} cursor-text hover:text-ink`}
                        title="Rename"
                        onClick={startRename}
                    >
                        {current()}
                    </button>
                </Show>
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
    // self-center: a text-free chip would otherwise sit on the Button's baseline
    <span class="flex h-4 w-4 self-center overflow-hidden rounded-full border border-line">
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

// Topbar tool action: a labeled Button on desktop, a bordered IconButton below lg. The label used
// to display:none away inside one Button, but a bare svg mis-sizes an icon-row's baseline line.
const ToolAction: Component<{
    icon: string;
    label: string;
    title?: string;
    onClick: () => void;
}> = (props) => (
    <Show
        when={isDesktop()}
        fallback={
            <IconButton
                size="lg"
                tone="tool"
                bordered
                class="bg-canvas"
                title={props.title ?? props.label}
                onClick={() => props.onClick()}
            >
                <Icon name={props.icon} size={14} />
            </IconButton>
        }
    >
        <Button variant="tool" size="sm" title={props.title} onClick={() => props.onClick()}>
            <Icon name={props.icon} size={14} /> {props.label}
        </Button>
    </Show>
);

// Narration lives inside the present surface now, on its own control, so this is one plain action
// again: a split whose second entry only chose how to start the same view was a menu for nothing.
const PresentButton: Component = () => (
    <ToolAction
        icon="present"
        label={editor.artifact.format === "deck" ? "Present" : "Preview"}
        onClick={() => {
            void ensureAllSections(); // presenting walks the whole deck
            present();
        }}
    />
);

const ExportButton: Component = () => (
    <ToolAction icon="export" label="Export" onClick={() => openExportModal()} />
);

// Topbar openers live outside the rail, so the rail's outside-press dismissal has to know them.
const FLYOUT_OPENER = "[data-flyout-opener]";

const ShareButton: Component = () => (
    <ToolAction
        icon={features().publicLinks ? "link" : "lock"}
        label="Share"
        title={features().publicLinks ? "Share" : "Sharing is a paid feature · upgrade"}
        onClick={() => (features().publicLinks ? requestShare() : requestUpgrade())}
    />
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
                            onChange={(v) => switchFormat(v)}
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

// The one place the editor says out loud that this artifact is not editable here. The commit gate is
// what actually enforces it; this stops the canvas from looking merely broken.
const AccessBadge: Component = () => (
    <Show when={!canEdit()}>
        <Badge tone="muted" size="xs" weight="medium">
            {canComment() ? "Comment only" : "View only"}
        </Badge>
    </Show>
);

// Who else is in the room, coloured to match their cursor. Clicking one follows them: the viewport
// is taken to where they are working and stays with them until the reader scrolls, presses Escape,
// or clicks the same avatar again. One person, one avatar, however many connections they hold.
const PeerStack: Component = () => (
    <Show when={collabActive() && otherPeers().length}>
        <div class="flex items-center -space-x-1.5 pr-1">
            <For each={otherPeers()}>
                {(peer) => {
                    const followed = (): boolean => following() === peer.user.id;
                    return (
                        <button
                            data-testid="peer-avatar"
                            class="cursor-pointer rounded-full transition-[filter] hover:brightness-110"
                            classList={{ "ring-2": !followed(), "ring-3": followed() }}
                            style={{ "--tw-ring-color": peer.color }}
                            title={
                                followed()
                                    ? `Following ${nameOf(peer)}. Click to stop.`
                                    : `Follow ${nameOf(peer)}`
                            }
                            aria-pressed={followed()}
                            onClick={() => toggleFollow(peer.user.id)}
                        >
                            <Avatar size="sm" src={peer.user.avatarUrl} name={peer.user.name} />
                        </button>
                    );
                }}
            </For>
        </div>
    </Show>
);

const nameOf = (peer: Peer): string => peer.user.name || "Someone";

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
        <AccessBadge />
        <Show when={canEdit()}>
            <HistoryButtons />
        </Show>
        <span class="flex-1" />
        <PeerStack />
        <div class="hidden items-center gap-3.5 md:flex">
            <Show when={canEdit()}>
                <FormatSwitcher value={editor.artifact.format} onChange={(v) => switchFormat(v)} />
                <ThemeMenu />
            </Show>
            <ShareButton />
            <ExportButton />
        </div>
        <PresentButton />
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

// hidden from the palette: the layout container is scaffolding the layout actions create, not
// something you add by hand, plus internals with no standalone meaning and the two storage elements
// content is written as (`chart`/`diagram` with a `data.type`) — their variants are the tiles
const HIDDEN = new Set(["container", "avatar", "chart", "diagram"]);
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
    if (multiSelected()) return `${selectedAddresses().length} selected`;
    const a = selectedElementAddr();
    if (!a || selectedInline()) return null;
    const type = getElementAt(editor.artifact, a)?.type;
    return (type && getElement(type)?.label) || "Element";
};
// a set has its own panel, so it opens the inspector even when each member edits inline
const inspectorShows = (): boolean =>
    multiSelected() || (selection()?.kind === "element" && !selectedInline());
const selectedSectionId = (): string | null => {
    const s = selection();
    return s ? (s.kind === "section" ? s.section : s.address.section) : null;
};

// A non-inline selection opens the inspector; inline elements and sections are handled elsewhere.
// A selection made by a drop is the exception: the flyout would open straight over the thing that
// was just placed, so that one is skipped and the panel stays as the drag left it.
const useInspectorAutoOpen = (): void => {
    createEffect(
        on([selection, extras], () => {
            if (takeDropSelection()) return;
            if (inspectorShows()) setRightTab("inspector");
            else setRightTab((t) => (t === "inspector" ? null : t));
        }),
    );
};

// The flyout closes on a press anywhere but itself and the icon rail, so it stops covering the
// canvas. Nothing is swallowed: no backdrop, nothing stopped, so the press still does its job.
//
// `owner` is what makes a dropdown or a menu opened from inside the inspector count as inside: it
// portals to <body>, so the rail element alone can never contain it.
//
// A press on the canvas is deferred rather than acted on, because the selection it is about to make
// may auto-open the inspector (useInspectorAutoOpen), and closing first would blink the panel shut
// and straight back open. The deferred answer is read after the selection has settled, which is why
// it hangs off pointerup: the canvas selects there, and Solid runs the effect before this listener.
function dismissFlyoutOnOutside(rail: () => HTMLElement | undefined, owner: string): void {
    createEffect(() => {
        if (!rightTab()) return;
        const onDown = (e: PointerEvent): void => {
            const inside = pressInside(e.composedPath(), {
                el: rail(),
                owner,
                opener: FLYOUT_OPENER,
            });
            const onCanvas = e
                .composedPath()
                .some((n) => n instanceof Element && n.tagName === "MAIN");
            const next = dismissalFor(
                { inside, onCanvas },
                { dragging: !!drag(), deferOnCanvas: true },
            );
            if (next === "keep") return;
            if (next === "close") {
                setRightTab(null);
                return;
            }
            // the selection the press makes decides: the inspector it opens is allowed to stay
            const settle = (): void => {
                if (!inspectorShows()) setRightTab(null);
            };
            window.addEventListener("pointerup", settle, { once: true });
            // a press that never lifts here (it left the window) must not leave the hook armed
            window.addEventListener(
                "pointercancel",
                () => window.removeEventListener("pointerup", settle),
                { once: true },
            );
        };
        window.addEventListener("pointerdown", onDown, true);
        onCleanup(() => window.removeEventListener("pointerdown", onDown, true));
    });
}

const Panel: Component = () => {
    const [q, setQ] = createSignal("");
    const all = listElements().filter((s) => !HIDDEN.has(s.type));
    const cats = createMemo(() => CAT_ORDER.filter((c) => all.some((s) => s.category === c)));
    let rail: HTMLDivElement | undefined;
    const owner = newOwnerToken("flyout");
    useInspectorAutoOpen();
    dismissFlyoutOnOutside(() => rail, owner);

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
        <OverlayOwner token={owner}>
            <div
                ref={rail}
                class="absolute right-3 top-1/2 z-chrome flex -translate-y-1/2 items-stretch gap-2"
            >
                <Show when={rightTab()}>
                    {(tab) => (
                        <FloatingPanel
                            as="aside"
                            data-testid="right-flyout"
                            pad="lg"
                            shadow="panel"
                            class="flex max-h-[calc(100dvh-120px)] w-60 flex-col overflow-y-auto lg:w-71"
                        >
                            <Switch
                                fallback={
                                    <>
                                        <Eyebrow
                                            as="div"
                                            mono={false}
                                            weight="semibold"
                                            class="mb-3"
                                        >
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
                                <Match when={tab() === "inspector"}>
                                    <Switch
                                        fallback={
                                            <p class="text-[13px] text-muted">
                                                Select something to edit it.
                                            </p>
                                        }
                                    >
                                        <Match when={multiSelected()}>
                                            <MultiSelectPanel />
                                        </Match>
                                        <Match when={!selectedInline() && selectedElementAddr()}>
                                            {(a) => <ElementInspector address={a()} />}
                                        </Match>
                                    </Switch>
                                </Match>
                            </Switch>
                        </FloatingPanel>
                    )}
                </Show>

                <FloatingPanel pad="sm" shadow="panel" class="flex flex-col gap-1 self-center">
                    <Show when={selectedLabel()}>{(label) => railBtn("inspector", label())}</Show>
                    {railBtn("search", "Search")}
                    <For each={cats()}>{(c) => railBtn(c, CAT_LABEL[c] ?? c)}</For>
                </FloatingPanel>
            </div>
        </OverlayOwner>
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
                {/* startDrag closes the flyout itself, so the drop target is never covered */}
                <div class="grid grid-cols-3 gap-3">
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
            <CommentSheets />
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
