import { createSignal } from "solid-js";

export interface KeyLike {
    key: string;
    metaKey?: boolean;
    ctrlKey?: boolean;
    shiftKey?: boolean;
    altKey?: boolean;
}

export type CommandGroup =
    | "navigate"
    | "file"
    | "edit"
    | "select"
    | "insert"
    | "arrange"
    | "format"
    | "view"
    | "theme"
    | "ai"
    | "present"
    | "share"
    | "account"
    | "help";

/** Fixed group order; drives palette + shortcuts sheet. */
export const GROUP_ORDER: CommandGroup[] = [
    "navigate",
    "file",
    "edit",
    "select",
    "insert",
    "arrange",
    "format",
    "view",
    "theme",
    "ai",
    "present",
    "share",
    "account",
    "help",
];

export const GROUP_LABEL: Record<CommandGroup, string> = {
    navigate: "Navigate",
    file: "File",
    edit: "Edit",
    select: "Select",
    insert: "Insert",
    arrange: "Arrange",
    format: "Format",
    view: "View",
    theme: "Theme",
    ai: "AI",
    present: "Present",
    share: "Share",
    account: "Account",
    help: "Help",
};

export interface KeyCtx {
    /** true if the named context key is set (e.g. "editor.element"). */
    has: (key: string) => boolean;
    scope: string | null;
    /** outermost → innermost. */
    scopes: string[];
    /** in an <input>/<textarea>/<select>/contenteditable. */
    inputFocused: boolean;
    /** a modal is active — only allowInInput bindings fire under it. */
    exclusive?: boolean;
}

export interface PaletteItem {
    id: string;
    title: string;
    hint?: string;
    icon?: string;
    keywords?: string[];
    dangerous?: boolean;
    run?: (ctx: KeyCtx) => void | Promise<void>;
    provider?: (ctx: KeyCtx) => PaletteItem[] | Promise<PaletteItem[]>;
}

export interface Command {
    id: string; // "selection.delete" — namespace.verbObject
    title: string;
    group: CommandGroup;
    keywords?: string[];
    icon?: string;
    when?: (ctx: KeyCtx) => boolean; // gate: enabled AND palette-visible
    run?: (ctx: KeyCtx) => void | Promise<void>; // omit for provider-only (sub-list) commands
    palette?: boolean; // show in ⌘K (default true; false = binding-only)
    provider?: (ctx: KeyCtx) => PaletteItem[] | Promise<PaletteItem[]>; // sub-list palette
    dangerous?: boolean;
}

export interface Binding {
    chord: string | string[]; // "mod+shift+z" | ["mod+z"]; a space = a sequence ("g l")
    command: string;
    when?: string | ((ctx: KeyCtx) => boolean); // extra gate; a string is a context-key check
    allowInInput?: boolean; // fire even when an input/contenteditable is focused (⌘K, ⌘,, Esc)
    priority?: number; // higher wins when several bindings match one chord (default 0)
}

export const isMac: boolean =
    typeof navigator !== "undefined" &&
    /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent || "");

const ARROWS: Record<string, string> = {
    ArrowUp: "up",
    ArrowDown: "down",
    ArrowLeft: "left",
    ArrowRight: "right",
};
const NAMED = new Set([
    "enter",
    "escape",
    "tab",
    "space",
    "backspace",
    "delete",
    "up",
    "down",
    "left",
    "right",
    "home",
    "end",
    "pageup",
    "pagedown",
]);
const MOD_ORDER = ["mod", "ctrl", "alt", "shift"];
const ALIASES: Record<string, string> = {
    cmd: "mod",
    command: "mod",
    meta: "mod",
    control: "ctrl",
    option: "alt",
    opt: "alt",
    esc: "escape",
    del: "delete",
    return: "enter",
    spacebar: "space",
    arrowup: "up",
    arrowdown: "down",
    arrowleft: "left",
    arrowright: "right",
};

function baseKey(e: KeyLike): string {
    const k = e.key;
    if (k === " " || k === "Spacebar") return "space";
    if (k in ARROWS) return ARROWS[k]!;
    return k.toLowerCase();
}

/** The normalized chord for a key event: canonical modifier order (mod·ctrl·alt·shift) + base key. */
export function eventChord(e: KeyLike): string {
    const base = baseKey(e);
    const mods: string[] = [];
    if (isMac ? !!e.metaKey : !!e.ctrlKey) mods.push("mod");
    if (isMac && e.ctrlKey) mods.push("ctrl"); // a literal Control held alongside ⌘
    if (e.altKey) mods.push("alt");
    // shift matters for alnum + named keys; a shifted symbol ("?") already encodes it in its character
    const alnum = /^[a-z0-9]$/.test(base);
    if (e.shiftKey && (alnum || NAMED.has(base))) mods.push("shift");
    return [...mods, base].join("+");
}

/** Normalize an authored chord ("Mod+Shift+Z") into the dispatcher's canonical form ("mod+shift+z"). */
export function normalizeChord(chord: string): string {
    const toks = chord
        .trim()
        .toLowerCase()
        .split("+")
        .map((p) => p.trim())
        .filter(Boolean)
        .map((p) => ALIASES[p] ?? p);
    const mods = toks
        .filter((t) => MOD_ORDER.includes(t))
        .sort((a, b) => MOD_ORDER.indexOf(a) - MOD_ORDER.indexOf(b));
    const base = toks.filter((t) => !MOD_ORDER.includes(t));
    return [...mods, ...base].join("+");
}

/** Split a (possibly sequence) chord "g l" into normalized single-chord steps. */
export function toSteps(chord: string): string[] {
    return chord.trim().split(/\s+/).filter(Boolean).map(normalizeChord);
}

const SYM_MAC: Record<string, string> = {
    mod: "⌘",
    ctrl: "⌃",
    alt: "⌥",
    shift: "⇧",
    enter: "⏎",
    escape: "Esc",
    tab: "⇥",
    space: "Space",
    backspace: "⌫",
    delete: "⌦",
    up: "↑",
    down: "↓",
    left: "←",
    right: "→",
    pageup: "PgUp",
    pagedown: "PgDn",
};
const SYM_PC: Record<string, string> = {
    mod: "Ctrl",
    ctrl: "Ctrl",
    alt: "Alt",
    shift: "Shift",
    enter: "Enter",
    escape: "Esc",
    tab: "Tab",
    space: "Space",
    backspace: "Backspace",
    delete: "Del",
    up: "↑",
    down: "↓",
    left: "←",
    right: "→",
    pageup: "PgUp",
    pagedown: "PgDn",
};

/** A human label for a chord, platform-aware: "mod+shift+z" → "⌘⇧Z" (mac) / "Ctrl+Shift+Z" (pc). */
export function formatChord(chord: string): string {
    const sym = isMac ? SYM_MAC : SYM_PC;
    const sep = isMac ? "" : "+";
    return toSteps(chord)
        .map((step) =>
            step
                .split("+")
                .map((t) => sym[t] ?? (t.length === 1 ? t.toUpperCase() : cap(t)))
                .join(sep),
        )
        .join(" ");
}

function cap(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1);
}

const commands = new Map<string, Command>();

interface BindingEntry {
    steps: string[];
    command: string;
    when?: (ctx: KeyCtx) => boolean;
    allowInInput: boolean;
    priority: number;
}
const bindings: BindingEntry[] = [];

// Bumped on every registration so the palette / sheet / tooltip labels react to new commands + bindings.
const [registryTick, setRegistryTick] = createSignal(0);
export { registryTick };
function bumpRegistry(): void {
    setRegistryTick((n) => n + 1);
}

export function registerCommand(cmd: Command): void {
    commands.set(cmd.id, cmd);
    bumpRegistry();
}
export function registerCommands(cmds: Command[]): void {
    for (const c of cmds) commands.set(c.id, c);
    bumpRegistry();
}
export function registerBinding(b: Binding): void {
    const chords = Array.isArray(b.chord) ? b.chord : [b.chord];
    const whenFn =
        typeof b.when === "string" ? (ctx: KeyCtx): boolean => ctx.has(b.when as string) : b.when;
    for (const chord of chords)
        bindings.push({
            steps: toSteps(chord),
            command: b.command,
            when: whenFn,
            allowInInput: !!b.allowInInput,
            priority: b.priority ?? 0,
        });
    bumpRegistry();
}
export function registerBindings(bs: Binding[]): void {
    for (const b of bs) registerBinding(b);
}

export function getCommand(id: string): Command | undefined {
    return commands.get(id);
}
export function allCommands(): Command[] {
    return [...commands.values()];
}
/** Test/HMR helper: wipe the registries (built-ins re-register on next import evaluation). */
export function _resetRegistry(): void {
    commands.clear();
    bindings.length = 0;
    bumpRegistry();
}

const [contextKeys, setContextKeys] = createSignal<Record<string, boolean>>({});
export function setContext(key: string, value: boolean): void {
    setContextKeys((prev) => (prev[key] === value ? prev : { ...prev, [key]: value }));
}
export function getContext(key: string): boolean {
    return !!contextKeys()[key];
}

export interface ScopeOpts {
    exclusive?: boolean; // swallow unmatched mod-combos so lower shortcuts don't leak (a true modal)
    onEscape?: () => void; // centralized Esc-to-dismiss
}
interface ScopeFrame extends ScopeOpts {
    name: string;
}
const [scopeStack, setScopeStack] = createSignal<ScopeFrame[]>([]);
/** Push a scope frame; returns a disposer that pops exactly this frame. */
export function pushScope(name: string, opts: ScopeOpts = {}): () => void {
    const frame: ScopeFrame = { name, ...opts };
    setScopeStack((s) => [...s, frame]);
    return () => setScopeStack((s) => s.filter((f) => f !== frame));
}
export function activeScopes(): string[] {
    return scopeStack().map((f) => f.name);
}

const [paletteOpen, setPaletteOpen] = createSignal(false);
export { paletteOpen };
export function openPalette(): void {
    setPaletteOpen(true);
}
export function closePalette(): void {
    setPaletteOpen(false);
}
export function togglePalette(): void {
    setPaletteOpen((v) => !v);
}

const [sheetOpen, setSheetOpen] = createSignal(false);
export { sheetOpen };
export function openShortcuts(): void {
    setSheetOpen(true);
}
export function closeShortcuts(): void {
    setSheetOpen(false);
}
export function toggleShortcuts(): void {
    setSheetOpen((v) => !v);
}

function isInputFocused(): boolean {
    if (typeof document === "undefined") return false;
    const el = document.activeElement as HTMLElement | null;
    if (!el) return false;
    return (
        el.tagName === "INPUT" ||
        el.tagName === "TEXTAREA" ||
        el.tagName === "SELECT" ||
        el.isContentEditable
    );
}

function makeCtx(inputFocused: boolean): KeyCtx {
    const keys = contextKeys();
    const stack = scopeStack();
    return {
        has: (k) => !!keys[k],
        scope: stack.length ? stack[stack.length - 1]!.name : null,
        scopes: stack.map((f) => f.name),
        inputFocused,
        exclusive: stack.some((f) => f.exclusive),
    };
}
/** Live context snapshot (focus computed now). */
export function currentCtx(): KeyCtx {
    return makeCtx(isInputFocused());
}

/** The command a single chord resolves to in `ctx`, or null. Pure over the registry. */
export function resolveChord(chord: string, ctx: KeyCtx): Command | null {
    let best: { entry: BindingEntry; cmd: Command } | null = null;
    for (const entry of bindings) {
        if (entry.steps.length !== 1 || entry.steps[0] !== chord) continue;
        if (ctx.inputFocused && !entry.allowInInput) continue;
        // under an exclusive scope only allowInInput globals fire; block lower-scope leaks
        if (ctx.exclusive && !entry.allowInInput) continue;
        if (entry.when && !entry.when(ctx)) continue;
        const cmd = commands.get(entry.command);
        if (!cmd) continue;
        if (cmd.when && !cmd.when(ctx)) continue;
        if (!best || entry.priority > best.entry.priority) best = { entry, cmd };
    }
    return best?.cmd ?? null;
}

/** Commands eligible for the palette in `ctx`, in registration order. */
export function listCommands(ctx: KeyCtx): Command[] {
    registryTick();
    return [...commands.values()].filter((c) => c.palette !== false && (!c.when || c.when(ctx)));
}

/** Run a command by id in the live context. */
export function runCommand(id: string): void {
    const cmd = commands.get(id);
    void cmd?.run?.(currentCtx());
}

/** The label of the first binding for a command, platform-formatted, or null. Reactive. */
export function bindingLabel(id: string): string | null {
    registryTick();
    const entry = bindings.find((b) => b.command === id);
    return entry ? formatChord(entry.steps.join(" ")) : null;
}

let installed = false;
let seqBuffer: string[] = [];
let seqTimer = 0;
const SEQ_TIMEOUT = 1000;

function resetSeq(): void {
    seqBuffer = [];
    if (seqTimer) {
        clearTimeout(seqTimer);
        seqTimer = 0;
    }
}
function armSeq(): void {
    if (seqTimer) clearTimeout(seqTimer);
    seqTimer = (
        typeof window !== "undefined" ? window.setTimeout(resetSeq, SEQ_TIMEOUT) : 0
    ) as number;
}
function seqBindings(ctx: KeyCtx): BindingEntry[] {
    return bindings.filter(
        (b) => b.steps.length > 1 && commands.has(b.command) && (!b.when || b.when(ctx)),
    );
}

/** Install the one global capture-phase key dispatcher. Idempotent; returns a disposer. */
export function installKeyDispatcher(): () => void {
    if (installed || typeof window === "undefined") return () => {};
    installed = true;
    const onKey = (e: KeyboardEvent): void => {
        const chord = eventChord(e);
        const inputFocused = isInputFocused();
        const ctx = makeCtx(inputFocused);

        // 1) Escape → the topmost scope that wants to dismiss on Escape (modals / palette / popovers).
        if (chord === "escape") {
            const stack = scopeStack();
            for (let i = stack.length - 1; i >= 0; i--) {
                const f = stack[i]!;
                if (f.onEscape) {
                    e.preventDefault();
                    resetSeq();
                    f.onEscape();
                    return;
                }
            }
        }

        // 2) Continue an in-flight sequence (bare keys only; never mid-typing).
        if (seqBuffer.length && !inputFocused) {
            const attempt = [...seqBuffer, chord];
            const seqs = seqBindings(ctx);
            const exact = seqs.find(
                (b) =>
                    b.steps.length === attempt.length && b.steps.every((s, i) => s === attempt[i]),
            );
            if (exact) {
                e.preventDefault();
                resetSeq();
                void runCommand(exact.command);
                return;
            }
            const partial = seqs.some(
                (b) => b.steps.length > attempt.length && attempt.every((s, i) => b.steps[i] === s),
            );
            if (partial) {
                seqBuffer = attempt;
                armSeq();
                e.preventDefault();
                return;
            }
            resetSeq(); // dead end — fall through
        }

        // 3) A single-chord binding.
        const cmd = resolveChord(chord, ctx);
        if (cmd) {
            e.preventDefault();
            resetSeq();
            void cmd.run?.(ctx);
            return;
        }

        // 4) Begin a sequence if this bare key is the first step of one.
        if (!inputFocused && !chord.includes("+")) {
            const starts = seqBindings(ctx).some((b) => b.steps[0] === chord);
            if (starts) {
                seqBuffer = [chord];
                armSeq();
                e.preventDefault();
                return;
            }
        }

        // 5) exclusive top scope swallows stray mod-combos so lower-scope shortcuts don't leak while open
        const top = scopeStack().at(-1);
        if (top?.exclusive && chord.includes("mod+") && !inputFocused) e.preventDefault();
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
        window.removeEventListener("keydown", onKey, true);
        installed = false;
        resetSeq();
    };
}

registerCommands([
    {
        id: "view.commandPalette",
        title: "Command palette…",
        group: "view",
        icon: "search",
        keywords: ["commands", "run", "palette", "actions"],
        run: () => togglePalette(),
    },
    {
        id: "help.shortcuts",
        title: "Keyboard shortcuts",
        group: "help",
        icon: "inspector",
        keywords: ["keys", "bindings", "cheatsheet", "help"],
        run: () => openShortcuts(),
    },
]);
registerBinding({ chord: "mod+k", command: "view.commandPalette", allowInInput: true });
registerBinding({ chord: "mod+,", command: "help.shortcuts", allowInInput: true });
registerBinding({ chord: "?", command: "help.shortcuts" });
