// @vitest-environment happy-dom
import "@elements/register";
import { beforeEach, describe, expect, it } from "vitest";
import { createRoot } from "solid-js";
import type { ArtifactContent, ElementInstance, Section, SectionOp } from "@model/artifact";
import {
    applyRemoteOps,
    canUndo,
    checkpointLiveEdit,
    clearEmitOps,
    commit,
    editing,
    editor,
    editSeq,
    loadArtifactContent,
    loadArtifactWindow,
    onEditSessionEnded,
    onEmitOps,
    onLoadSections,
    opsAcked,
    opsDropped,
    opsRejected,
    pending,
    requestSections,
    setArtifactLive,
    setEditAccess,
    startEditing,
    stopEditing,
    undo,
} from "@editor/core/store";

// Two documents, one server: these tests drive the store the way the socket does, so what is under
// test is the client's half of the sync contract (what it sends, what it accepts back, and what its
// undo stack does once someone else has written).

const text = (id: string, value: string): ElementInstance => ({
    type: "text",
    id,
    data: { text: value },
});
const section = (id: string, kids: ElementInstance[]): Section => ({
    id,
    root: { type: "container", id: `g-${id}`, data: { direction: "col", children: kids } },
});
const doc = (): ArtifactContent => ({
    format: "deck",
    theme: "studio",
    sections: [
        section("s1", [text("e1", "one"), text("e2", "two")]),
        section("s2", [text("e3", "three")]),
    ],
});

const elementById = (id: string): ElementInstance | undefined => {
    let found: ElementInstance | undefined;
    const walk = (el: ElementInstance): void => {
        if (el.id === id) found = el;
        for (const kid of (el.data as { children?: ElementInstance[] }).children ?? []) walk(kid);
    };
    for (const s of editor.artifact.sections) walk(s.root);
    return found;
};

const textOf = (id: string): unknown => (elementById(id)?.data as { text?: unknown }).text;

const setText = (art: ArtifactContent, sectionId: string, elementId: string, value: string) => ({
    ...art,
    sections: art.sections.map((s) =>
        s.id !== sectionId
            ? s
            : {
                  ...s,
                  root: {
                      ...s.root,
                      data: {
                          ...(s.root.data as object),
                          children: (s.root.data as { children: ElementInstance[] }).children.map(
                              (k) =>
                                  k.id === elementId
                                      ? { ...k, data: { ...(k.data as object), [`text`]: value } }
                                      : k,
                          ),
                      },
                  },
              },
    ),
});

let sent: { tag: string; ops: SectionOp[] }[] = [];
let tags = 0;

const inRoot = (body: () => void): void =>
    createRoot((dispose) => {
        body();
        dispose();
    });

const wire = (opts: { deliver?: boolean } = {}): void => {
    onEmitOps((ops) => {
        const tag = `t${++tags}`;
        sent.push({ tag, ops });
        return opts.deliver === false ? null : tag;
    });
};

beforeEach(() => {
    sent = [];
    tags = 0;
    clearEmitOps();
    setEditAccess("edit");
    onEditSessionEnded(() => undefined);
});

describe("what a local edit sends", () => {
    it("emits the narrowest op for a one-element change, not the whole section", () => {
        inRoot(() => {
            loadArtifactContent("a", doc());
            wire();
            commit(setText(editor.artifact, "s1", "e1", "ONE"));
            expect(sent).toHaveLength(1);
            expect(sent[0]?.ops).toEqual([
                { kind: "data", sectionId: "s1", elementId: "e1", keys: { text: "ONE" } },
            ]);
        });
    });

    it("sends nothing when the commit changed nothing", () => {
        inRoot(() => {
            loadArtifactContent("a", doc());
            wire();
            commit({ ...editor.artifact });
            expect(sent).toHaveLength(0);
        });
    });

    it("sends one batch per text session, not one per keystroke", () => {
        inRoot(() => {
            loadArtifactContent("a", doc());
            wire();
            const addr = { section: "s1", path: [0] };
            startEditing(addr);
            // live keystrokes go straight into the tree; the session boundary is what commits
            commit(setText(editor.artifact, "s1", "e1", "o"));
            expect(sent).toHaveLength(1);
            stopEditing();
            expect(canUndo()).toBe(true);
        });
    });

    it("holds nothing pending once the send itself failed", () => {
        inRoot(() => {
            loadArtifactContent("a", doc());
            wire({ deliver: false }); // the socket is down
            commit(setText(editor.artifact, "s1", "e1", "ONE"));
            // the remote value is accepted, since nothing of ours is in flight
            applyRemoteOps([
                { kind: "data", sectionId: "s1", elementId: "e1", keys: { text: "theirs" } },
            ]);
            expect(textOf("e1")).toBe("theirs");
        });
    });
});

// Unacked local wins, per key: while the server has not confirmed our write, an incoming value for
// that exact key is discarded. It stops a colour and a keystroke on one element from flickering.
describe("the pending-key map", () => {
    it("discards a remote value for a key we are still waiting on", () => {
        inRoot(() => {
            loadArtifactContent("a", doc());
            wire();
            commit(setText(editor.artifact, "s1", "e1", "mine"));
            applyRemoteOps([
                { kind: "data", sectionId: "s1", elementId: "e1", keys: { text: "theirs" } },
            ]);
            expect(textOf("e1")).toBe("mine");
        });
    });

    it("takes the remote value once the ack clears the key", () => {
        inRoot(() => {
            loadArtifactContent("a", doc());
            wire();
            commit(setText(editor.artifact, "s1", "e1", "mine"));
            opsAcked(sent[0]!.tag);
            applyRemoteOps([
                { kind: "data", sectionId: "s1", elementId: "e1", keys: { text: "theirs" } },
            ]);
            expect(textOf("e1")).toBe("theirs");
        });
    });

    it("takes it after a reject too, since our write did not land", () => {
        inRoot(() => {
            loadArtifactContent("a", doc());
            wire();
            commit(setText(editor.artifact, "s1", "e1", "mine"));
            opsRejected(sent[0]!.tag);
            applyRemoteOps([
                { kind: "data", sectionId: "s1", elementId: "e1", keys: { text: "theirs" } },
            ]);
            expect(textOf("e1")).toBe("theirs");
        });
    });

    it("only contests the key in flight, never the element's other keys", () => {
        inRoot(() => {
            loadArtifactContent("a", doc());
            wire();
            commit(setText(editor.artifact, "s1", "e1", "mine"));
            applyRemoteOps([
                {
                    kind: "data",
                    sectionId: "s1",
                    elementId: "e1",
                    keys: { text: "theirs", color: "blue" },
                },
            ]);
            expect(textOf("e1")).toBe("mine");
            expect((elementById("e1")?.data as { color?: string }).color).toBe("blue");
        });
    });

    it("lets a remote write on another element through untouched", () => {
        inRoot(() => {
            loadArtifactContent("a", doc());
            wire();
            commit(setText(editor.artifact, "s1", "e1", "mine"));
            applyRemoteOps([
                { kind: "data", sectionId: "s1", elementId: "e2", keys: { text: "theirs" } },
            ]);
            expect(textOf("e1")).toBe("mine");
            expect(textOf("e2")).toBe("theirs");
        });
    });
});

// The per-section paint cache and the autosave diff both key on object identity, so a remote write
// must leave everything it did not touch exactly as it was.
describe("applying a remote batch", () => {
    it("preserves object identity for untouched sections and elements", () => {
        inRoot(() => {
            loadArtifactContent("a", doc());
            const before = editor.artifact;
            const untouchedSection = before.sections[1];
            const sibling = elementById("e2");
            applyRemoteOps([
                { kind: "data", sectionId: "s1", elementId: "e1", keys: { text: "theirs" } },
            ]);
            expect(editor.artifact.sections[1]).toBe(untouchedSection);
            expect(elementById("e2")).toBe(sibling);
            expect(editor.artifact.sections[0]).not.toBe(before.sections[0]);
        });
    });

    it("repaints and never re-emits", () => {
        inRoot(() => {
            loadArtifactContent("a", doc());
            wire();
            const seq0 = editSeq();
            applyRemoteOps([
                { kind: "data", sectionId: "s1", elementId: "e1", keys: { text: "theirs" } },
            ]);
            expect(editSeq()).toBe(seq0 + 1);
            expect(sent).toHaveLength(0);
        });
    });

    it("does not repaint for a batch that lands on what is already here", () => {
        inRoot(() => {
            loadArtifactContent("a", doc());
            const before = editor.artifact;
            const seq0 = editSeq();
            expect(
                applyRemoteOps([
                    { kind: "data", sectionId: "s1", elementId: "e1", keys: { text: "one" } },
                ]),
            ).toBe(true);
            expect(editor.artifact).toBe(before);
            expect(editSeq()).toBe(seq0);
        });
    });

    it("never enters the undo stack", () => {
        inRoot(() => {
            loadArtifactContent("a", doc());
            applyRemoteOps([
                { kind: "data", sectionId: "s1", elementId: "e1", keys: { text: "theirs" } },
            ]);
            expect(canUndo()).toBe(false);
        });
    });

    it("reports failure rather than half-applying, which is the caller's cue to resync", () => {
        inRoot(() => {
            loadArtifactContent("a", doc());
            const before = editor.artifact;
            expect(applyRemoteOps([{ kind: "remove", id: "ghost" }])).toBe(false);
            expect(editor.artifact).toBe(before);
        });
    });
});

describe("undo once someone else has written", () => {
    it("drops an entry whose key a remote write has since rewritten", () => {
        inRoot(() => {
            loadArtifactContent("a", doc());
            wire();
            commit(setText(editor.artifact, "s1", "e1", "mine"));
            opsAcked(sent[0]!.tag);
            applyRemoteOps([
                { kind: "data", sectionId: "s1", elementId: "e1", keys: { text: "theirs" } },
            ]);
            undo();
            expect(textOf("e1")).toBe("theirs"); // their write stands
            expect(canUndo()).toBe(false); // and the entry is gone rather than waiting
        });
    });

    it("still undoes an entry a remote write did not touch", () => {
        inRoot(() => {
            loadArtifactContent("a", doc());
            wire();
            commit(setText(editor.artifact, "s1", "e1", "mine"));
            opsAcked(sent[0]!.tag);
            applyRemoteOps([
                { kind: "data", sectionId: "s2", elementId: "e3", keys: { text: "theirs" } },
            ]);
            undo();
            expect(textOf("e1")).toBe("one");
            expect(textOf("e3")).toBe("theirs");
        });
    });

    it("sends the undo to the room like any other write", () => {
        inRoot(() => {
            loadArtifactContent("a", doc());
            wire();
            commit(setText(editor.artifact, "s1", "e1", "mine"));
            opsAcked(sent[0]!.tag);
            undo();
            expect(sent).toHaveLength(2);
            expect(sent[1]?.ops).toEqual([
                { kind: "data", sectionId: "s1", elementId: "e1", keys: { text: "one" } },
            ]);
        });
    });

    it("keeps the history at its cap", () => {
        inRoot(() => {
            loadArtifactContent("a", doc());
            wire();
            for (let i = 0; i < 130; i++) commit(setText(editor.artifact, "s1", "e1", `v${i}`));
            let steps = 0;
            while (canUndo() && steps < 200) {
                undo();
                steps++;
            }
            expect(steps).toBe(120);
        });
    });
});

// Deletion wins: the server never refuses a structural op for lease reasons, so the client has to
// handle its own session disappearing rather than writing into a hole.
describe("when a remote write deletes what you are editing", () => {
    it("ends the session and says so", () => {
        inRoot(() => {
            loadArtifactContent("a", doc());
            let ended = 0;
            onEditSessionEnded(() => {
                ended++;
            });
            startEditing({ section: "s1", path: [0] });
            expect(editing()).not.toBeNull();
            applyRemoteOps([{ kind: "set", section: section("s1", [text("e2", "two")]) }]);
            expect(editing()).toBeNull();
            expect(ended).toBe(1);
        });
    });

    it("drops the uncommitted keystrokes rather than recording them", () => {
        inRoot(() => {
            loadArtifactContent("a", doc());
            wire();
            startEditing({ section: "s1", path: [0] });
            applyRemoteOps([{ kind: "remove", id: "s1" }]);
            stopEditing();
            expect(canUndo()).toBe(false);
            expect(sent).toHaveLength(0);
        });
    });

    it("leaves a session alone when the write was somewhere else", () => {
        inRoot(() => {
            loadArtifactContent("a", doc());
            startEditing({ section: "s1", path: [0] });
            applyRemoteOps([
                { kind: "data", sectionId: "s2", elementId: "e3", keys: { text: "theirs" } },
            ]);
            expect(editing()).not.toBeNull();
        });
    });
});

describe("remote writes against a windowed document", () => {
    const index = [
        { id: "s1", kind: "cover", size: 100 },
        { id: "s2", kind: "content", size: 100 },
    ];

    it("drops a data op aimed at a section that has not loaded yet", () => {
        inRoot(() => {
            loadArtifactWindow("a", { format: "deck", theme: "studio" }, index, [
                section("s1", [text("e1", "one")]),
            ]);
            expect(pending().has("s2")).toBe(true);
            expect(
                applyRemoteOps([
                    { kind: "data", sectionId: "s2", elementId: "e3", keys: { text: "theirs" } },
                ]),
            ).toBe(true);
            // still a placeholder, so the refetch will bring the server's version of the truth
            expect(pending().has("s2")).toBe(true);
        });
    });

    it("resolves a placeholder outright when the remote batch carries the section", () => {
        inRoot(() => {
            loadArtifactWindow("a", { format: "deck", theme: "studio" }, index, [
                section("s1", [text("e1", "one")]),
            ]);
            applyRemoteOps([{ kind: "set", section: section("s2", [text("e3", "landed")]) }]);
            expect(pending().has("s2")).toBe(false);
            expect(textOf("e3")).toBe("landed");
        });
    });

    it("does not put a placeholder back when undoing past a materialized section", async () => {
        await new Promise<void>((done) => {
            inRoot(() => {
                loadArtifactWindow("a", { format: "deck", theme: "studio" }, index, [
                    section("s1", [text("e1", "one")]),
                ]);
                wire();
                // an edit recorded while s2 was still a stub
                commit(setText(editor.artifact, "s1", "e1", "edited"));
                onLoadSections(() => Promise.resolve([section("s2", [text("e3", "real")])]));
                void requestSections(["s2"]).then(() => {
                    undo();
                    expect(textOf("e3")).toBe("real");
                    done();
                });
            });
        });
    });
});

// A text session updates the tree on every keystroke and only records an undo entry when it ends.
// While the room is the persistence path that made the whole session unsent, so a tab closed
// mid-sentence lost it and peers saw the paragraph arrive in one lump.
describe("a text session in progress", () => {
    const typeInto = (value: string): void =>
        setArtifactLive(setText(editor.artifact, "s1", "e1", value));

    it("checkpoints what has been typed so far, without ending the session", () => {
        inRoot(() => {
            loadArtifactContent("a", doc());
            wire();
            startEditing({ section: "s1", path: [0] });
            typeInto("on");
            typeInto("one and a half");
            checkpointLiveEdit();
            expect(sent).toHaveLength(1);
            expect(sent[0]?.ops).toEqual([
                {
                    kind: "data",
                    sectionId: "s1",
                    elementId: "e1",
                    keys: { text: "one and a half" },
                },
            ]);
            expect(editing()).not.toBeNull();
            expect(canUndo()).toBe(false); // the session has not ended, so there is nothing to undo
        });
    });

    it("sends only the remainder when the session ends, and still records one entry", () => {
        inRoot(() => {
            loadArtifactContent("a", doc());
            wire();
            startEditing({ section: "s1", path: [0] });
            typeInto("half");
            checkpointLiveEdit();
            typeInto("half and half");
            stopEditing();
            expect(sent).toHaveLength(2);
            expect(sent[1]?.ops).toEqual([
                { kind: "data", sectionId: "s1", elementId: "e1", keys: { text: "half and half" } },
            ]);
            expect(canUndo()).toBe(true);
            undo();
            expect(textOf("e1")).toBe("one"); // the whole session undoes at once
        });
    });

    it("puts back what a checkpoint already sent when the typing is undone by hand", () => {
        inRoot(() => {
            loadArtifactContent("a", doc());
            wire();
            startEditing({ section: "s1", path: [0] });
            typeInto("one!");
            checkpointLiveEdit();
            typeInto("one"); // back to where it started
            stopEditing();
            // nothing to undo, but the room saw "one!" and has to be told it is gone again
            expect(canUndo()).toBe(false);
            expect(sent).toHaveLength(2);
            expect(sent[1]?.ops).toEqual([
                { kind: "data", sectionId: "s1", elementId: "e1", keys: { text: "one" } },
            ]);
        });
    });

    it("keeps its baseline when nothing went out, so the next checkpoint carries the lot", () => {
        inRoot(() => {
            loadArtifactContent("a", doc());
            wire({ deliver: false }); // the socket is down; the HTTP save is carrying this
            startEditing({ section: "s1", path: [0] });
            typeInto("one and");
            checkpointLiveEdit();
            wire(); // it came back
            typeInto("one and two");
            checkpointLiveEdit();
            expect(sent.at(-1)?.ops).toEqual([
                { kind: "data", sectionId: "s1", elementId: "e1", keys: { text: "one and two" } },
            ]);
        });
    });
});

// The gate is on `record`, not on `commit`, because a text session records straight through it: a
// gate one level up let a viewer type, watched the room refuse the batch, and lost their window to
// the resync that followed.
describe("what a viewer may do", () => {
    it("refuses to open a text session at all", () => {
        inRoot(() => {
            loadArtifactContent("a", doc());
            setEditAccess("view");
            startEditing({ section: "s1", path: [0] });
            expect(editing()).toBeNull();
        });
    });

    it("sends nothing and records nothing when a session is somehow open", () => {
        inRoot(() => {
            loadArtifactContent("a", doc());
            wire();
            startEditing({ section: "s1", path: [0] });
            setEditAccess("comment"); // dropped mid-session, the way a revoked grant does it
            setArtifactLive(setText(editor.artifact, "s1", "e1", "typed anyway"));
            stopEditing();
            expect(sent).toHaveLength(0);
            expect(canUndo()).toBe(false);
        });
    });

    it("commits nothing", () => {
        inRoot(() => {
            loadArtifactContent("a", doc());
            wire();
            setEditAccess("view");
            commit(setText(editor.artifact, "s1", "e1", "nope"));
            expect(sent).toHaveLength(0);
            expect(textOf("e1")).toBe("one");
        });
    });
});

// Pending keys are a bet that an ack is coming. When the socket goes there is no ack coming, and a
// key left pending goes on discarding every remote value for it, on exactly the elements this tab
// was last editing.
describe("when the socket goes away mid-flight", () => {
    it("stops holding unacked keys against remote values", () => {
        inRoot(() => {
            loadArtifactContent("a", doc());
            wire();
            commit(setText(editor.artifact, "s1", "e1", "mine"));
            opsDropped();
            applyRemoteOps([
                { kind: "data", sectionId: "s1", elementId: "e1", keys: { text: "theirs" } },
            ]);
            expect(textOf("e1")).toBe("theirs");
        });
    });
});

// The shell is compared generically, for the reason diffSections is: a hand-listed comparison
// ignores every field added to ArtifactShell after it was written, and a remote change to one of
// those was applied and then dropped as "nothing changed".
describe("a remote write to the document shell", () => {
    it("lands a field this file does not enumerate", () => {
        inRoot(() => {
            loadArtifactContent("a", doc());
            const before = editSeq();
            applyRemoteOps([
                { kind: "shell", shell: { format: "deck", theme: "studio", voice: "v-narrator" } },
            ]);
            expect(editor.artifact.voice).toBe("v-narrator");
            expect(editSeq()).toBe(before + 1);
        });
    });

    it("still skips the repaint when the shell really did not change", () => {
        inRoot(() => {
            loadArtifactContent("a", doc());
            const before = editSeq();
            applyRemoteOps([{ kind: "shell", shell: { format: "deck", theme: "studio" } }]);
            expect(editSeq()).toBe(before);
        });
    });
});
