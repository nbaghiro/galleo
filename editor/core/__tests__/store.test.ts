// @vitest-environment happy-dom
import "@elements/register";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot } from "solid-js";
import type { ArtifactContent, ElementAddress, ElementInstance } from "@model/artifact";
import { colGroup, emptyRegion } from "@model/artifact";
import { deleteElement, updateDataAt } from "@elements/ops";
import { artifactOf, inst, sectionOf } from "@canvas/testkit";
import {
    addSectionAfter,
    canRedo,
    canUndo,
    commit,
    commitOver,
    currentArtifactId,
    currentTitle,
    HANDLE_H,
    handleTop,
    renameArtifact,
    setEditAccess,
    setSlideFrame,
    slideFrame,
    duplicateSectionAt,
    editing,
    editor,
    editSeq,
    endThemePreview,
    fitFreeze,
    extras,
    multiSelected,
    selectedAddresses,
    selectMany,
    toggleExtra,
    keepPreviewedTheme,
    loadArtifactContent,
    moveSectionBy,
    moveSectionTo,
    previewingTheme,
    previewSavedTheme,
    redo,
    removeSectionAt,
    sectionFitScale,
    selection,
    setArtifactLive,
    setSectionFits,
    setSelection,
    startEditing,
    stopEditing,
    startThemePreview,
    themeForPersist,
    undo,
    clampMinimapWidth,
    clampZoom,
    MINIMAP_DEFAULT_W,
    MINIMAP_MAX_W,
    MINIMAP_MIN_W,
    setMinimapWidth,
    minimapWidth,
    setZoom,
    toStage,
    zoom,
    zoomBy,
    ZOOM_MAX,
    ZOOM_MIN,
} from "@editor/core/store";

// the store is module-level singletons: editSeq accumulates across tests, so assertions use deltas

const makeArt = (ids: string[]): ArtifactContent =>
    artifactOf(ids.map((id) => sectionOf(emptyRegion(), { id })));

const sectionIds = (): string[] => editor.artifact.sections.map((s) => s.id);

const inRoot = (body: () => void): void =>
    createRoot((dispose) => {
        body();
        dispose();
    });

beforeEach(() => {
    // baseline reset; each test reloads its own fixture on top
    setEditAccess("edit");
    loadArtifactContent("base", makeArt(["a", "b"]));
});

describe("commit / history", () => {
    it("pushes a snapshot, replaces content, and bumps the edit sequence", () => {
        inRoot(() => {
            const base = makeArt(["a", "b"]);
            loadArtifactContent("doc", base);
            const seq0 = editSeq();
            expect(canUndo()).toBe(false);

            const next = makeArt(["a", "b", "c"]);
            commit(next);

            expect(editor.artifact).toBe(next);
            expect(canUndo()).toBe(true);
            expect(editSeq()).toBe(seq0 + 1);
        });
    });

    it("clears the redo future on a fresh commit", () => {
        inRoot(() => {
            const base = makeArt(["a"]);
            loadArtifactContent("doc", base);
            commit(makeArt(["a", "b"]));
            undo();
            expect(canRedo()).toBe(true);

            const next = makeArt(["a", "z"]);
            commit(next);
            expect(canRedo()).toBe(false);
            expect(editor.artifact).toBe(next);
        });
    });

    it("folds two commits with the same coalesce key into one undo step", () => {
        inRoot(() => {
            loadArtifactContent("doc", makeArt(["a"]));
            const base = editor.artifact;
            const seq0 = editSeq();

            const a = makeArt(["a", "1"]);
            const b = makeArt(["a", "2"]);
            commit(a, { coalesce: "slider" });
            expect(editor.artifact).toBe(a);
            commit(b, { coalesce: "slider" });
            expect(editor.artifact).toBe(b); // content still updates on the folded commit

            // both bumped the sequence but share ONE history entry
            expect(editSeq()).toBe(seq0 + 2);
            undo();
            expect(editor.artifact).toEqual(base);
            expect(canUndo()).toBe(false);
        });
    });

    it("pushes a new entry when the coalesce key differs", () => {
        inRoot(() => {
            loadArtifactContent("doc", makeArt(["a"]));
            const base = editor.artifact;
            const a = makeArt(["a", "1"]);
            const b = makeArt(["a", "2"]);
            commit(a, { coalesce: "k1" });
            commit(b, { coalesce: "k2" });

            undo();
            expect(editor.artifact).toEqual(a);
            undo();
            expect(editor.artifact).toEqual(base);
        });
    });

    it("pushes a new entry when the second commit has no key", () => {
        inRoot(() => {
            loadArtifactContent("doc", makeArt(["a"]));
            const base = editor.artifact;
            const a = makeArt(["a", "1"]);
            const b = makeArt(["a", "2"]);
            commit(a, { coalesce: "k" });
            commit(b); // absent key → its own undo step

            undo();
            expect(editor.artifact).toEqual(a);
            undo();
            expect(editor.artifact).toEqual(base);
        });
    });
});

describe("undo / redo", () => {
    it("undo on an empty stack is a no-op", () => {
        inRoot(() => {
            loadArtifactContent("doc", makeArt(["a", "b"]));
            const base = editor.artifact;
            const seq0 = editSeq();
            expect(canUndo()).toBe(false);

            undo();
            expect(editor.artifact).toBe(base);
            expect(editSeq()).toBe(seq0); // a no-op undo never bumps the sequence
            expect(canUndo()).toBe(false);
        });
    });

    it("redo on an empty stack is a no-op", () => {
        inRoot(() => {
            loadArtifactContent("doc", makeArt(["a", "b"]));
            const base = editor.artifact;
            const seq0 = editSeq();
            expect(canRedo()).toBe(false);

            redo();
            expect(editor.artifact).toBe(base);
            expect(editSeq()).toBe(seq0);
        });
    });

    it("undo restores prior content into future; redo re-applies", () => {
        inRoot(() => {
            loadArtifactContent("doc", makeArt(["a"]));
            const base = editor.artifact;
            const next = makeArt(["a", "b"]);
            commit(next);
            expect(canUndo()).toBe(true);
            expect(canRedo()).toBe(false);

            undo();
            expect(editor.artifact).toEqual(base);
            expect(canUndo()).toBe(false);
            expect(canRedo()).toBe(true);

            redo();
            expect(editor.artifact).toEqual(next);
            expect(canUndo()).toBe(true);
            expect(canRedo()).toBe(false);
        });
    });
});

describe("commitOver", () => {
    it("undo restores the base, not the transient live tree", () => {
        inRoot(() => {
            const base = makeArt(["a"]);
            loadArtifactContent("doc", base);

            // insert flow paints a placeholder live (no history), then lands the real tree over base
            const transient = makeArt(["a", "placeholder"]);
            setArtifactLive(transient);

            const next = makeArt(["a", "real"]);
            commitOver(base, next);
            expect(editor.artifact).toBe(next);

            undo();
            expect(editor.artifact).toEqual(base); // NOT the transient placeholder tree
            expect(canUndo()).toBe(false);
        });
    });
});

describe("section management", () => {
    it("moveSectionTo applies the self-removal shift", () => {
        inRoot(() => {
            loadArtifactContent("doc", makeArt(["a", "b", "c", "d"]));
            // Drop "a" (index 0) at absolute drop index 2 → delta = (2-1)-0 = 1 → lands after "b".
            moveSectionTo("a", 2);
            expect(sectionIds()).toEqual(["b", "a", "c", "d"]);
        });
    });

    it("moveSectionTo dropping a section just after its own position is delta 0 (no commit)", () => {
        inRoot(() => {
            loadArtifactContent("doc", makeArt(["a", "b", "c"]));
            const base = editor.artifact;
            const seq0 = editSeq();

            moveSectionTo("b", 2); // i=1, index=2 → delta = (2-1)-1 = 0
            moveSectionTo("a", 0); // i=0, index=0 → delta = 0-0 = 0
            moveSectionTo("missing", 1); // i<0 → early return

            expect(editor.artifact).toBe(base);
            expect(canUndo()).toBe(false);
            expect(editSeq()).toBe(seq0);
        });
    });

    it("moveSectionBy reorders and records a commit", () => {
        inRoot(() => {
            loadArtifactContent("doc", makeArt(["a", "b", "c"]));
            moveSectionBy("a", 1);
            expect(sectionIds()).toEqual(["b", "a", "c"]);
            expect(canUndo()).toBe(true);
        });
    });

    it("addSectionAfter inserts after the id and selects the new section", () => {
        inRoot(() => {
            loadArtifactContent("doc", makeArt(["a", "b"]));
            addSectionAfter("a");

            const ids = sectionIds();
            expect(ids).toHaveLength(3);
            expect(ids[0]).toBe("a");
            expect(ids[2]).toBe("b");
            const newId = ids[1];

            const sel = selection();
            expect(sel?.kind).toBe("section");
            expect(sel && sel.kind === "section" ? sel.section : null).toBe(newId);
        });
    });

    it("addSectionAfter(null) appends", () => {
        inRoot(() => {
            loadArtifactContent("doc", makeArt(["a", "b"]));
            addSectionAfter(null);

            const ids = sectionIds();
            expect(ids).toHaveLength(3);
            expect(ids.slice(0, 2)).toEqual(["a", "b"]);
            const appended = ids[2];

            const sel = selection();
            expect(sel && sel.kind === "section" ? sel.section : null).toBe(appended);
        });
    });

    it("removeSectionAt removes the section and clears selection", () => {
        inRoot(() => {
            loadArtifactContent("doc", makeArt(["a", "b"]));
            setSelection({ kind: "section", section: "a" });

            removeSectionAt("a");
            expect(sectionIds()).toEqual(["b"]);
            expect(selection()).toBeNull();
            expect(canUndo()).toBe(true);
        });
    });

    it("duplicateSectionAt inserts a copy after the original", () => {
        inRoot(() => {
            loadArtifactContent("doc", makeArt(["a", "b"]));
            duplicateSectionAt("a");

            const ids = sectionIds();
            expect(ids).toHaveLength(3);
            expect(ids[0]).toBe("a");
            expect(ids[2]).toBe("b");
            expect(ids[1]).not.toBe("a"); // the copy gets a fresh id
            expect(canUndo()).toBe(true);
        });
    });
});

describe("theme preview", () => {
    it("previews live but persists the saved theme, without bumping the edit sequence", () => {
        inRoot(() => {
            loadArtifactContent("doc", makeArt(["a"])); // theme "default"
            const seq0 = editSeq();

            startThemePreview("studio");
            expect(previewingTheme()).toBe(true);
            expect(editor.artifact.theme).toBe("studio");
            expect(themeForPersist()).toBe("default"); // autosave keeps the saved theme
            expect(previewSavedTheme()).toBe("default");
            expect(editSeq()).toBe(seq0); // a preview swap alone never triggers a save
            expect(canUndo()).toBe(false);
        });
    });

    it("previewing the current theme is a no-op", () => {
        inRoot(() => {
            loadArtifactContent("doc", makeArt(["a"])); // theme "default"
            startThemePreview("default");
            expect(previewingTheme()).toBe(false);
            expect(themeForPersist()).toBe("default");
        });
    });

    it("keepPreviewedTheme records an undoable step and bumps the sequence", () => {
        inRoot(() => {
            loadArtifactContent("doc", makeArt(["a"])); // theme "default"
            startThemePreview("studio");
            const seq0 = editSeq();

            keepPreviewedTheme();
            expect(previewingTheme()).toBe(false);
            expect(editor.artifact.theme).toBe("studio");
            expect(themeForPersist()).toBe("studio"); // now the saved theme too
            expect(editSeq()).toBe(seq0 + 1);
            expect(canUndo()).toBe(true);

            undo();
            expect(editor.artifact.theme).toBe("default"); // undo restores the pre-preview theme
        });
    });

    it("endThemePreview restores the saved theme without a history step", () => {
        inRoot(() => {
            loadArtifactContent("doc", makeArt(["a"])); // theme "default"
            startThemePreview("studio");

            endThemePreview();
            expect(previewingTheme()).toBe(false);
            expect(editor.artifact.theme).toBe("default");
            expect(previewSavedTheme()).toBeNull();
            expect(canUndo()).toBe(false); // reverting a preview is not undoable
        });
    });
});

describe("loadArtifactContent", () => {
    it("resets history / selection / editing but does not bump the edit sequence", () => {
        inRoot(() => {
            loadArtifactContent("doc", makeArt(["a", "b"]));
            commit(makeArt(["a", "b", "c"]));
            setSelection({ kind: "section", section: "a" });
            startEditing({ section: "a", path: [] });
            startThemePreview("studio");
            expect(canUndo()).toBe(true);

            const seq0 = editSeq();
            loadArtifactContent("doc2", makeArt(["x", "y"]));

            expect(sectionIds()).toEqual(["x", "y"]);
            expect(currentArtifactId()).toBe("doc2");
            expect(canUndo()).toBe(false);
            expect(canRedo()).toBe(false);
            expect(selection()).toBeNull();
            expect(editing()).toBeNull();
            expect(previewingTheme()).toBe(false);
            expect(editSeq()).toBe(seq0); // load never triggers an autosave
        });
    });
});

// Everything that changes the document funnels through `record`, so the access gate sits there
// rather than on each caller: a gate on `commit` alone missed the text session, which records
// straight through it, and the title, which is a write of its own.
describe("without edit access", () => {
    it("changes nothing and starts no session", () => {
        inRoot(() => {
            loadArtifactContent("doc", makeArt(["a", "b"]));
            setEditAccess("view");
            const before = editor.artifact;
            commit(makeArt(["a", "b", "c"]));
            addSectionAfter("a");
            startEditing({ section: "a", path: [] });
            expect(editor.artifact).toBe(before);
            expect(editing()).toBeNull();
            expect(canUndo()).toBe(false);
        });
    });

    it("refuses a rename, which the server would refuse too", () => {
        inRoot(() => {
            loadArtifactContent("doc", makeArt(["a"]));
            const was = currentTitle();
            setEditAccess("comment");
            renameArtifact("Something else");
            expect(currentTitle()).toBe(was);
        });
    });
});

// It is how someone wants to see every deck, not a per-visit choice, so a reload must not drop it.
// The storage is stubbed because node defines a bare `localStorage` global with no methods on it,
// which is the same shape the store's try/catch is there to survive.
describe("slideFrame", () => {
    let store: Map<string, string>;
    beforeEach(() => {
        store = new Map();
        vi.stubGlobal("localStorage", {
            getItem: (k: string) => store.get(k) ?? null,
            setItem: (k: string, v: string) => void store.set(k, v),
            removeItem: (k: string) => void store.delete(k),
        });
    });
    afterEach(() => vi.unstubAllGlobals());

    const reload = async (): Promise<{ slideFrame: () => boolean }> => {
        vi.resetModules();
        return import("@editor/core/store");
    };

    it("writes the choice through, in both directions", () => {
        setSlideFrame(true);
        expect(slideFrame()).toBe(true);
        expect(store.get("galleo:slide-frame")).toBe("1");

        setSlideFrame((v) => !v);
        expect(slideFrame()).toBe(false);
        expect(store.get("galleo:slide-frame")).toBe("0");
    });

    it("reads it back on a fresh load, which is what a refresh is", async () => {
        store.set("galleo:slide-frame", "1");
        expect((await reload()).slideFrame()).toBe(true);
    });

    it("defaults to off when nothing was ever stored", async () => {
        expect((await reload()).slideFrame()).toBe(false);
    });

    // the guard that matters: storage throws in some privacy modes, and the editor must still open
    it("falls back to the default when storage throws", async () => {
        vi.stubGlobal("localStorage", {
            getItem: () => {
                throw new Error("denied");
            },
            setItem: () => {
                throw new Error("denied");
            },
        });
        const fresh = await reload();
        expect(fresh.slideFrame()).toBe(false);
    });
});

// Shift-click builds a set beside the anchor. `selection` keeps its exact meaning, so the
// invariants that matter are the ones that keep `extras` a well-formed set around it.
describe("multi-selection", () => {
    const txt = (t: string): ElementInstance => inst("text", { text: t });
    const addr = (path: number[]): ElementAddress => ({ section: "a", path });
    const pick = (path: number[]): void => setSelection({ kind: "element", address: addr(path) });
    const elArt = (): ArtifactContent =>
        artifactOf([
            sectionOf(colGroup([txt("a"), txt("b"), colGroup([txt("c"), txt("d")])]), { id: "a" }),
        ]);
    const load = (): void => loadArtifactContent("multi", elArt());

    it("seeds the set from the anchor, then toggles a member back out", () => {
        inRoot(() => {
            load();
            pick([0]);
            toggleExtra(addr([1]));
            expect(multiSelected()).toBe(true);
            expect(selectedAddresses()).toEqual([addr([0]), addr([1])]);
            toggleExtra(addr([1]));
            expect(extras()).toEqual([]);
            expect(selection()).toEqual({ kind: "element", address: addr([0]) });
        });
    });

    it("shift-clicking the anchor demotes it and promotes the first extra", () => {
        inRoot(() => {
            load();
            pick([0]);
            toggleExtra(addr([1]));
            toggleExtra(addr([0]));
            expect(selection()).toEqual({ kind: "element", address: addr([1]) });
            expect(extras()).toEqual([]);
        });
    });

    it("shift-clicking a lone anchor clears it, since the toggle has nothing to promote", () => {
        inRoot(() => {
            load();
            pick([0]);
            toggleExtra(addr([0]));
            expect(selection()).toBeNull();
        });
    });

    it("shift-clicking with a section anchor just selects the element", () => {
        inRoot(() => {
            load();
            setSelection({ kind: "section", section: "a" });
            toggleExtra(addr([1]));
            expect(selection()).toEqual({ kind: "element", address: addr([1]) });
            expect(extras()).toEqual([]);
        });
    });

    it("never holds an element together with its own ancestor", () => {
        inRoot(() => {
            load();
            pick([0]);
            toggleExtra(addr([2, 0]));
            toggleExtra(addr([2, 1]));
            expect(extras()).toEqual([addr([2, 0]), addr([2, 1])]);
            toggleExtra(addr([2])); // the ancestor evicts the two it contains
            expect(extras()).toEqual([addr([2])]);
        });
    });

    it("refuses an extra that is the anchor's own ancestor or descendant", () => {
        inRoot(() => {
            load();
            pick([2, 0]);
            toggleExtra(addr([2]));
            expect(extras()).toEqual([]);
            pick([2]);
            toggleExtra(addr([2, 1]));
            expect(extras()).toEqual([]);
        });
    });

    it("returns the whole set in document order, whatever order it was built in", () => {
        inRoot(() => {
            load();
            pick([2, 1]);
            toggleExtra(addr([0]));
            expect(selectedAddresses()).toEqual([addr([0]), addr([2, 1])]);
        });
    });

    it("collapses on a plain selection", () => {
        inRoot(() => {
            load();
            pick([0]);
            toggleExtra(addr([1]));
            pick([1]);
            expect(extras()).toEqual([]);
        });
    });

    it("selectMany re-seeds the anchor and the rest of the set", () => {
        inRoot(() => {
            load();
            selectMany([addr([0]), addr([1])]);
            expect(selection()).toEqual({ kind: "element", address: addr([0]) });
            expect(extras()).toEqual([addr([1])]);
            selectMany([]);
            expect(selection()).toBeNull();
        });
    });

    it("a structural commit collapses the set; a data-only one leaves it alone", () => {
        inRoot(() => {
            load();
            pick([0]);
            toggleExtra(addr([1]));
            commit(updateDataAt(editor.artifact, addr([0]), { text: "changed" }));
            expect(extras()).toEqual([addr([1])]);
            commit(deleteElement(editor.artifact, addr([1])));
            expect(extras()).toEqual([]);
        });
    });

    it("starting a text session collapses the set, which may only address the anchor", () => {
        inRoot(() => {
            load();
            pick([0]);
            toggleExtra(addr([1]));
            startEditing(addr([0]));
            expect(extras()).toEqual([]);
        });
    });
});

// The one rule autofit needs from the editor: the scale a section was painted at is held for the
// whole of an inline session, so a keystroke that crosses a wrap boundary cannot resize the type
// under the caret. The canvas passes this straight to paintSectionStack.
describe("the autofit freeze", () => {
    const load = (): void => {
        loadArtifactContent("doc", makeArt(["a", "b"]));
        setSectionFits([0.86, 1]);
    };

    it("reads back the scale each section was painted at", () => {
        inRoot(() => {
            load();
            expect(sectionFitScale("a")).toBe(0.86);
            expect(sectionFitScale("b")).toBe(1);
            expect(sectionFitScale("gone")).toBe(1);
        });
    });

    it("holds the edited section's scale for the session and drops it on commit", () => {
        inRoot(() => {
            load();
            expect(fitFreeze()).toBeNull();
            startEditing({ section: "a", path: [] });
            expect(fitFreeze()).toEqual({ id: "a", scale: 0.86 });
            stopEditing();
            expect(fitFreeze()).toBeNull();
        });
    });
});

// Where the margin handles sit against the element they belong to. Both the drag grip and the
// comment chip read this, which is the point: they own a side each and nothing else, so the pair
// cannot drift apart the way it did when each carried its own numbers.
describe("handleTop", () => {
    const box = (y: number, h: number) => ({ y, h });

    // Flush is the whole rule. An earlier version centred the pill inside a band at the top of every
    // box, which read as a stray 10px of padding on anything taller than the band.
    it("sits flush with the top of the box", () => {
        expect(handleTop(box(100, 24))).toBe(100);
        expect(handleTop(box(100, 100))).toBe(100);
        expect(handleTop(box(100, 400))).toBe(100);
    });

    it("is flush at exactly the pill's height, with nothing left over", () => {
        expect(handleTop(box(100, HANDLE_H))).toBe(100);
    });

    // The one exception: flush would leave a pill taller than its box hanging out of the bottom,
    // pointing at nothing. Centring makes it overhang evenly instead.
    it("centres on a box too short to hold the pill", () => {
        expect(handleTop(box(100, 12))).toBe(96);
        expect(handleTop(box(100, 0))).toBe(90);
    });

    it("never insets a handle from the top of a box that can hold it", () => {
        for (const h of [20, 21, 24, 30, 40, 41, 80, 400]) expect(handleTop(box(0, h))).toBe(0);
    });
});

// The rail's width is a number the canvas reserves, so the range is a real constraint rather than a
// styling preference: below the floor the thumbnails stop reading, above the ceiling the canvas is
// what pays for it.
describe("minimap width", () => {
    it("holds the width inside the rail's range and rounds it to whole px", () => {
        expect(clampMinimapWidth(MINIMAP_DEFAULT_W)).toBe(MINIMAP_DEFAULT_W);
        expect(clampMinimapWidth(20)).toBe(MINIMAP_MIN_W);
        expect(clampMinimapWidth(1200)).toBe(MINIMAP_MAX_W);
        expect(clampMinimapWidth(200.6)).toBe(201);
    });

    // a stored value that was never a number must not collapse the rail to its floor
    it("falls back to the default for anything that is not a width", () => {
        expect(clampMinimapWidth(Number.NaN)).toBe(MINIMAP_DEFAULT_W);
        expect(clampMinimapWidth(Number.POSITIVE_INFINITY)).toBe(MINIMAP_DEFAULT_W);
    });

    it("clamps what the drag writes, so a gesture past either end settles at it", () => {
        setMinimapWidth(1000);
        expect(minimapWidth()).toBe(MINIMAP_MAX_W);
        setMinimapWidth(0);
        expect(minimapWidth()).toBe(MINIMAP_MIN_W);
        setMinimapWidth(MINIMAP_DEFAULT_W);
        expect(minimapWidth()).toBe(MINIMAP_DEFAULT_W);
    });
});

// Zoom is a view scale on the painted stack, not a layout change: the engine keeps laying out at the
// same width, so everything the canvas publishes stays in unscaled layout coordinates and anything
// read off the DOM has to come back into that space before it is compared against them.
describe("canvas zoom", () => {
    it("holds the scale inside the range and snaps it to whole percents", () => {
        expect(clampZoom(1)).toBe(1);
        expect(clampZoom(0.2)).toBe(ZOOM_MIN);
        expect(clampZoom(9)).toBe(ZOOM_MAX);
        expect(clampZoom(Number.NaN)).toBe(1);
    });

    // 0.7 + 0.1 is 0.7999999999999999, which would render as 80% and then step to 89%
    it("keeps stepping off binary floating point out of the percentage", () => {
        setZoom(0.7);
        zoomBy(1);
        expect(zoom()).toBe(0.8);
        zoomBy(1);
        expect(zoom()).toBe(0.9);
    });

    it("stops at each end rather than running past it", () => {
        setZoom(ZOOM_MIN);
        zoomBy(-1);
        expect(zoom()).toBe(ZOOM_MIN);
        setZoom(ZOOM_MAX);
        zoomBy(1);
        expect(zoom()).toBe(ZOOM_MAX);
        setZoom(1);
    });

    // getBoundingClientRect already carries the transform, so the origin lands the point in zoomed
    // pixels; the division is what puts it back where regions, hitboxes and drop slots are measured
    it("divides the scale back out of a viewport point", () => {
        const rect = { left: 100, top: 50 };
        expect(toStage(rect, 1, 160, 90)).toEqual([60, 40]);
        expect(toStage(rect, 2, 220, 130)).toEqual([60, 40]);
        expect(toStage(rect, 0.5, 130, 70)).toEqual([60, 40]);
    });
});

// The scale someone reads a deck at belongs to the reader and the screen, not to the document, so it
// is stored per artifact on the device rather than on the row.
describe("zoom persistence", () => {
    let store: Map<string, string>;
    beforeEach(() => {
        store = new Map();
        vi.stubGlobal("localStorage", {
            getItem: (k: string) => store.get(k) ?? null,
            setItem: (k: string, v: string) => void store.set(k, v),
            removeItem: (k: string) => void store.delete(k),
        });
    });
    afterEach(() => {
        vi.unstubAllGlobals();
        setZoom(1);
    });

    it("restores the scale each artifact was last read at", () => {
        inRoot(() => {
            loadArtifactContent("deck-a", makeArt(["a"]));
            setZoom(1.4);
            loadArtifactContent("deck-b", makeArt(["a"]));
            expect(zoom()).toBe(1);
            loadArtifactContent("deck-a", makeArt(["a"]));
            expect(zoom()).toBe(1.4);
        });
    });

    // 100% is the default, so an artifact left there is an absent entry rather than a stored 1
    it("stores nothing for an artifact back at 100%", () => {
        inRoot(() => {
            loadArtifactContent("deck-a", makeArt(["a"]));
            setZoom(1.4);
            setZoom(1);
            expect(JSON.parse(store.get("galleo:canvas-zoom") ?? "null")).toEqual({});
        });
    });

    it("survives a stored record that is not one", () => {
        inRoot(() => {
            store.set("galleo:canvas-zoom", "[oops");
            loadArtifactContent("deck-a", makeArt(["a"]));
            expect(zoom()).toBe(1);
        });
    });
});
