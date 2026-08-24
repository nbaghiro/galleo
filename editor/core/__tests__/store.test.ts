// @vitest-environment happy-dom
import "@elements/register";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot } from "solid-js";
import type { ArtifactContent } from "@model/artifact";
import { emptyRegion } from "@model/artifact";
import { artifactOf, sectionOf } from "@canvas/testkit";
import {
    addSectionAfter,
    canRedo,
    canUndo,
    commit,
    commitOver,
    currentArtifactId,
    currentTitle,
    renameArtifact,
    setEditAccess,
    setSlideFrame,
    slideFrame,
    duplicateSectionAt,
    editing,
    editor,
    editSeq,
    endThemePreview,
    keepPreviewedTheme,
    loadArtifactContent,
    moveSectionBy,
    moveSectionTo,
    previewingTheme,
    previewSavedTheme,
    redo,
    removeSectionAt,
    selection,
    setArtifactLive,
    setSelection,
    startEditing,
    startThemePreview,
    themeForPersist,
    undo,
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
