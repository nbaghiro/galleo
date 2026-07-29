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
import type { ExportFormat } from "@model/billing";
import { setArtifactFormat, getElementAt } from "@elements/ops";
import { getElement, listElements } from "@elements/spec";
import { exportDeckPng, exportPdfAuto, exportPrint } from "@canvas/render/export";
import { exportPptx } from "@canvas/render/pptx";
import { installKeyDispatcher } from "@ui/keys";
import { Badge, Button, Eyebrow, IconButton } from "@ui/button";
import { Icon, UiThemeProvider } from "@ui/icons";
import { TextField, FormatSwitcher } from "@ui/inputs";
import { Menu, MenuItem } from "@ui/menu";
import { FloatingPanel } from "@ui/overlay";
import { Canvas, Thumb } from "./Canvas";
import { Present } from "./Present";
import { DataEditor } from "./panels/DataEditor";
import { DragGhost, PaletteItem } from "./panels/Insert";
import { ElementInspector } from "./panels/RightPanel";
import { pickMedia } from "./core/media";
import {
    addSectionAfter,
    artifacts,
    canRedo,
    canUndo,
    commit,
    currentArtifactId,
    editor,
    editorTheme,
    editorTokens,
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
    undo,
} from "./core/store";

export const Editor: Component = () => {
    // ensure the key dispatcher runs even without the app shell (idempotent)
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
                class="grid h-screen grid-rows-[52px_1fr] overflow-hidden bg-canvas text-ink"
                style={vars()}
            >
                <Topbar />
                <div class="relative min-h-0 overflow-hidden">
                    <Canvas />
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
                </div>
                <DragGhost />
                <Present />
                <DataEditor />
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

// --- Topbar ---

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
                    class="cursor-text rounded px-1 text-[13px] text-muted hover:text-ink"
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

// Undo/redo — one shared stack covers content, theme, format, and rename (see editor.ts).
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

// Opens the app-level theme drawer (wired by the host via onThemePicker); the button shows the current theme.
const ThemeMenu: Component = () => {
    const current = createMemo(() => editorTheme());
    return (
        <Button variant="tool" size="sm" title="Theme" onClick={() => requestThemePicker()}>
            <Swatch
                surface={current().tokens.surface}
                ink={current().tokens.ink}
                accent={current().tokens.accent}
            />
            {current().name}
        </Button>
    );
};

// Document-level backdrop image (behind all sections) — opens the shared media picker.
const BackgroundButton: Component = () => (
    <Button
        variant="tool"
        size="sm"
        title="Document background image"
        onClick={() =>
            pickMedia(
                (url) =>
                    commit({
                        ...editor.artifact,
                        background: { ...editor.artifact.background, kind: "image", image: url },
                    }),
                "photo",
            )
        }
    >
        <Icon name="media" size={14} />
    </Button>
);

const ExportMenu: Component = () => {
    const [busy, setBusy] = createSignal(false);
    const allows = (f: ExportFormat): boolean => features().exportFormats.includes(f);
    const brand = (): boolean => !features().removeBranding;
    const run = async (fn: () => void | Promise<void>): Promise<void> => {
        setBusy(true);
        try {
            await fn();
        } finally {
            setBusy(false);
        }
    };
    // Menu row: unlocked runs the export; locked shows a "Pro" row that routes to pricing.
    const item = (
        label: string,
        format: ExportFormat,
        fn: () => void | Promise<void>,
    ): JSX.Element =>
        allows(format) ? (
            <MenuItem onClick={() => run(fn)}>{label}</MenuItem>
        ) : (
            <MenuItem
                icon={<Icon name="lock" size={12} />}
                trailing={<Badge tone="accentSoft">Pro</Badge>}
                onClick={() => requestUpgrade()}
            >
                {label}
            </MenuItem>
        );
    return (
        <Menu
            align="end"
            width={208}
            trigger={(m) => (
                <Button
                    ref={m.ref}
                    variant="tool"
                    size="sm"
                    loading={busy()}
                    onClick={() => !busy() && m.toggle()}
                >
                    <Show
                        when={busy()}
                        fallback={
                            <>
                                <Icon name="export" size={14} /> Export{" "}
                                <Icon name="chevron" size={11} />
                            </>
                        }
                    >
                        Exporting
                    </Show>
                </Button>
            )}
        >
            {item("PDF", "pdf", () =>
                exportPdfAuto(editor.artifact, editorTokens(), { brand: brand() }),
            )}
            {item("PowerPoint", "pptx", () =>
                exportPptx(editor.artifact, editorTokens(), { brand: brand() }),
            )}
            {item("PNG — deck", "png", () =>
                exportDeckPng(editor.artifact, editorTokens(), { brand: brand() }),
            )}
            {item("Print…", "print", () => exportPrint(editor.artifact, editorTokens()))}
        </Menu>
    );
};

const Topbar: Component = () => (
    <header class="relative z-menu flex items-center gap-3.5 border-b border-line bg-panel px-[18px]">
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
        <FormatSwitcher
            value={editor.artifact.format}
            onChange={(v) => commit(setArtifactFormat(editor.artifact, v))}
        />
        <ThemeMenu />
        <BackgroundButton />
        <Button
            variant="tool"
            size="sm"
            title={features().publicLinks ? "Share" : "Sharing is a paid feature — upgrade"}
            onClick={() => (features().publicLinks ? requestShare() : requestUpgrade())}
        >
            <Icon name={features().publicLinks ? "link" : "lock"} size={14} />
            Share
        </Button>
        <ExportMenu />
        <Button variant="tool" size="sm" onClick={() => present()}>
            <Icon name={editor.artifact.format === "deck" ? "present" : "preview"} size={14} />
            {editor.artifact.format === "deck" ? "Present" : "Preview"}
        </Button>
    </header>
);

// --- Minimap ---

const Minimap: Component = () => {
    const [dragIx, setDragIx] = createSignal<number | null>(null);
    const [overIx, setOverIx] = createSignal<number | null>(null);
    const rowEls: (HTMLElement | undefined)[] = [];
    let asideEl: HTMLElement | undefined; // IO root for thumbnail visibility
    // Key rows by section id, not object ref — else a content edit remounts (re-observes) the thumb every keystroke.
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
        <FloatingPanel
            as="aside"
            pad="md"
            shadow="panel"
            ref={(el) => (asideEl = el)}
            class="absolute left-3 top-1/2 z-panel flex max-h-[calc(100%-44px)] w-[182px] -translate-y-1/2 flex-col gap-3 overflow-y-auto"
        >
            <div class="flex items-center justify-between pl-1">
                <Eyebrow mono={false}>Sections</Eyebrow>
                <IconButton size="xs" tone="muted" title="Hide" onClick={() => setLeftOpen(false)}>
                    <Icon name="close" size={12} />
                </IconButton>
            </div>
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
                                        <Thumb section={s()} index={i()} root={() => asideEl} />
                                    </div>
                                    <button
                                        class="absolute left-0 top-1/2 z-raised flex h-6 w-4 -translate-y-1/2 cursor-grab items-center justify-center rounded text-muted opacity-0 transition-opacity group-hover:opacity-100 active:cursor-grabbing"
                                        title="Drag to reorder"
                                        onPointerDown={(e) => startReorder(i(), e)}
                                    >
                                        <Icon name="grip" size={14} />
                                    </button>
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
                class="mt-1 rounded-lg border border-dashed border-line py-2 text-[11px] font-semibold text-muted hover:border-accent hover:text-accent"
            >
                + Section
            </button>
        </FloatingPanel>
    );
};

// --- Panel (right dock) ---

// hidden from the palette: internal container/drop-preview + back-compat chart/diagram catch-alls (per-type tiles show instead).
const HIDDEN = new Set(["group", "__dropghost", "chart", "diagram", "avatar"]);
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

const Panel: Component = () => {
    const [q, setQ] = createSignal("");
    const all = listElements().filter((s) => !HIDDEN.has(s.type));
    const cats = createMemo(() => CAT_ORDER.filter((c) => all.some((s) => s.category === c)));

    const elementAddr = createMemo(() => {
        const s = selection();
        return s?.kind === "element" ? s.address : null;
    });
    // Elements fully editable on-canvas skip the panel: rich-text (format bar), containers (handles), and
    // any whose `bar` already surfaces every control.
    const elementInline = createMemo((): boolean => {
        const a = elementAddr();
        if (!a) return false;
        const spec = getElement(getElementAt(editor.artifact, a)?.type ?? "");
        if (!spec) return false;
        if (spec.richText || spec.container) return true;
        const bar = spec.bar ?? [];
        return spec.controls.length > 0 && spec.controls.every((c) => bar.includes(c.key));
    });
    const inspectorLabel = createMemo((): string | null => {
        const a = elementAddr();
        if (!a || elementInline()) return null;
        const type = getElementAt(editor.artifact, a)?.type;
        return (type && getElement(type)?.label) || "Element";
    });

    // A non-inline selection opens the inspector; inline elements + sections are handled elsewhere.
    createEffect(() => {
        const s = selection();
        const showInspector = s?.kind === "element" && !elementInline();
        if (showInspector) setRightTab("inspector");
        else setRightTab((t) => (t === "inspector" ? null : t));
    });

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
                        class="flex max-h-[calc(100vh-120px)] w-[284px] flex-col overflow-y-auto"
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
                                <Match when={!elementInline() && elementAddr()}>
                                    {(a) => <ElementInspector address={a()} />}
                                </Match>
                            </Switch>
                        </Show>
                    </FloatingPanel>
                )}
            </Show>

            <FloatingPanel pad="sm" shadow="panel" class="flex flex-col gap-1 self-center">
                <Show when={inspectorLabel()}>{(label) => railBtn("inspector", label())}</Show>
                {railBtn("search", "Search")}
                <For each={cats()}>{(c) => railBtn(c, CAT_LABEL[c] ?? c)}</For>
            </FloatingPanel>
        </div>
    );
};
