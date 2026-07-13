// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
    bindingLabel,
    eventChord,
    formatChord,
    installKeyDispatcher,
    isMac,
    listCommands,
    normalizeChord,
    pushScope,
    registerBinding,
    registerCommand,
    resolveChord,
    toSteps,
    type KeyCtx,
} from "../keys";

const MOD: Partial<KeyboardEventInit> = isMac ? { metaKey: true } : { ctrlKey: true };

function ctx(keys: string[] = [], inputFocused = false): KeyCtx {
    const set = new Set(keys);
    return { has: (k) => set.has(k), scope: null, scopes: [], inputFocused };
}

describe("eventChord", () => {
    it("maps the platform mod key to `mod`", () => {
        expect(eventChord({ key: "k", ...MOD })).toBe("mod+k");
    });
    it("orders modifiers canonically (mod·ctrl·alt·shift)", () => {
        expect(eventChord({ key: "z", shiftKey: true, ...MOD })).toBe("mod+shift+z");
    });
    it("lowercases letters and names special keys", () => {
        expect(eventChord({ key: "K" })).toBe("k");
        expect(eventChord({ key: "Escape" })).toBe("escape");
        expect(eventChord({ key: " " })).toBe("space");
        expect(eventChord({ key: "ArrowUp" })).toBe("up");
        expect(eventChord({ key: "ArrowDown", ...MOD })).toBe("mod+down");
    });
    it("does not double-count shift for a shifted symbol", () => {
        expect(eventChord({ key: "?", shiftKey: true })).toBe("?");
    });
    it("keeps shift for named keys", () => {
        expect(eventChord({ key: "Tab", shiftKey: true })).toBe("shift+tab");
    });
});

describe("normalizeChord + toSteps", () => {
    it("lowercases, aliases, and reorders modifiers", () => {
        expect(normalizeChord("Mod+Shift+Z")).toBe("mod+shift+z");
        expect(normalizeChord("Shift+Mod+z")).toBe("mod+shift+z");
        expect(normalizeChord("Cmd+K")).toBe("mod+k");
        // ctrl stays literal Control, distinct from mod
        expect(normalizeChord("Ctrl+Alt+Delete")).toBe("ctrl+alt+delete");
        expect(normalizeChord("Esc")).toBe("escape");
    });
    it("preserves punctuation base keys", () => {
        expect(normalizeChord("mod+,")).toBe("mod+,");
    });
    it("splits a sequence into normalized steps", () => {
        expect(toSteps("g l")).toEqual(["g", "l"]);
        expect(toSteps("Mod+K")).toEqual(["mod+k"]);
    });
});

describe("formatChord", () => {
    it("renders a platform-aware label", () => {
        expect(formatChord("mod+shift+z")).toBe(isMac ? "⌘⇧Z" : "Ctrl+Shift+Z");
        expect(formatChord("mod+k")).toBe(isMac ? "⌘K" : "Ctrl+K");
    });
    it("renders named + arrow keys as glyphs", () => {
        expect(formatChord("up")).toBe("↑");
        expect(formatChord("escape")).toBe("Esc");
    });
    it("renders a sequence with a space", () => {
        expect(formatChord("g l")).toBe("G L");
    });
});

describe("resolveChord", () => {
    it("resolves a bound command and honors its context gate", () => {
        registerCommand({
            id: "test.editorOnly",
            title: "Editor only",
            group: "edit",
            when: (c) => c.has("editor"),
            run: () => {},
        });
        registerBinding({ chord: "mod+shift+e", command: "test.editorOnly" });
        expect(resolveChord("mod+shift+e", ctx(["editor"]))?.id).toBe("test.editorOnly");
        expect(resolveChord("mod+shift+e", ctx([]))).toBeNull();
    });

    it("blocks non-allowInInput bindings while an input is focused", () => {
        registerCommand({ id: "test.inputGate", title: "x", group: "edit", run: () => {} });
        registerBinding({ chord: "mod+shift+g", command: "test.inputGate" });
        expect(resolveChord("mod+shift+g", ctx([], true))).toBeNull();
        expect(resolveChord("mod+shift+g", ctx([], false))?.id).toBe("test.inputGate");
    });

    it("lets allowInInput bindings fire in inputs", () => {
        registerCommand({ id: "test.allow", title: "x", group: "view", run: () => {} });
        registerBinding({ chord: "mod+shift+h", command: "test.allow", allowInInput: true });
        expect(resolveChord("mod+shift+h", ctx([], true))?.id).toBe("test.allow");
    });

    it("higher priority wins when two bindings share a chord", () => {
        registerCommand({ id: "test.lo", title: "lo", group: "edit", run: () => {} });
        registerCommand({ id: "test.hi", title: "hi", group: "edit", run: () => {} });
        registerBinding({ chord: "mod+shift+j", command: "test.lo", priority: 0 });
        registerBinding({ chord: "mod+shift+j", command: "test.hi", priority: 10 });
        expect(resolveChord("mod+shift+j", ctx())?.id).toBe("test.hi");
    });

    it("resolves the built-in palette binding", () => {
        expect(resolveChord("mod+k", ctx([], true))?.id).toBe("view.commandPalette");
    });

    it("an exclusive scope blocks ordinary bindings but not allowInInput globals", () => {
        registerCommand({ id: "test.exclusiveGate", title: "x", group: "edit", run: () => {} });
        registerBinding({ chord: "mod+shift+q", command: "test.exclusiveGate" });
        const excl: KeyCtx = {
            has: () => false,
            scope: "modal",
            scopes: ["modal"],
            inputFocused: false,
            exclusive: true,
        };
        expect(resolveChord("mod+shift+q", excl)).toBeNull();
        // ⌘K is allowInInput — opens even inside a modal
        expect(resolveChord("mod+k", excl)?.id).toBe("view.commandPalette");
    });
});

describe("listCommands + bindingLabel", () => {
    it("filters by context gate and palette flag", () => {
        registerCommand({
            id: "test.hidden",
            title: "Hidden",
            group: "edit",
            palette: false,
            run: () => {},
        });
        registerCommand({
            id: "test.gated",
            title: "Gated",
            group: "edit",
            when: (c) => c.has("present"),
            run: () => {},
        });
        const ids = listCommands(ctx([])).map((c) => c.id);
        expect(ids).not.toContain("test.hidden");
        expect(ids).not.toContain("test.gated");
        expect(listCommands(ctx(["present"])).map((c) => c.id)).toContain("test.gated");
    });
    it("labels a command from its first binding", () => {
        expect(bindingLabel("view.commandPalette")).toBe(isMac ? "⌘K" : "Ctrl+K");
        expect(bindingLabel("nonexistent.command")).toBeNull();
    });
});

describe("installKeyDispatcher", () => {
    const disposers: Array<() => void> = [];
    afterEach(() => {
        while (disposers.length) disposers.pop()!();
    });

    it("runs a bound command and prevents default", () => {
        installKeyDispatcher();
        const run = vi.fn();
        registerCommand({ id: "test.dispatch", title: "d", group: "edit", run });
        registerBinding({ chord: "mod+shift+u", command: "test.dispatch" });
        const e = new KeyboardEvent("keydown", {
            key: "u",
            shiftKey: true,
            ...MOD,
            cancelable: true,
        });
        window.dispatchEvent(e);
        expect(run).toHaveBeenCalledTimes(1);
        expect(e.defaultPrevented).toBe(true);
    });

    it("routes Escape to the topmost scope's onEscape", () => {
        installKeyDispatcher();
        const onEscape = vi.fn();
        disposers.push(pushScope("test-modal", { onEscape }));
        const e = new KeyboardEvent("keydown", { key: "Escape", cancelable: true });
        window.dispatchEvent(e);
        expect(onEscape).toHaveBeenCalledTimes(1);
        expect(e.defaultPrevented).toBe(true);
    });

    it("an exclusive scope swallows stray mod-combos", () => {
        installKeyDispatcher();
        disposers.push(pushScope("test-exclusive", { exclusive: true }));
        // no binding; the exclusive scope swallows it
        const e = new KeyboardEvent("keydown", {
            key: "9",
            shiftKey: true,
            ...MOD,
            cancelable: true,
        });
        window.dispatchEvent(e);
        expect(e.defaultPrevented).toBe(true);
    });

    it("runs a sequence chord (g then a key)", () => {
        installKeyDispatcher();
        const run = vi.fn();
        registerCommand({ id: "test.seq", title: "seq", group: "navigate", run });
        registerBinding({ chord: "g y", command: "test.seq" });
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "g", cancelable: true }));
        expect(run).not.toHaveBeenCalled(); // prefix buffered, not yet fired
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "y", cancelable: true }));
        expect(run).toHaveBeenCalledTimes(1);
    });
});
