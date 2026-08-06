// @vitest-environment happy-dom
import "@elements/register";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot } from "solid-js";
import type { ArtifactShell, Section, SectionSummary } from "@model/artifact";
import { emptyRegion } from "@model/artifact";
import { sectionOf } from "@canvas/testkit";
import {
    commit,
    editor,
    editSeq,
    ensureAllSections,
    isWindowed,
    loadArtifactContent,
    loadArtifactWindow,
    knownHeight,
    onLoadSections,
    pending,
    rememberHeight,
    redo,
    requestSections,
    undo,
} from "@editor/core/store";

const shell: ArtifactShell = { format: "deck", theme: "studio" };
const index = (ids: string[]): SectionSummary[] =>
    ids.map((id) => ({ id, kind: "content", size: 900 }));
const real = (id: string): Section => sectionOf(emptyRegion(), { id });

const ids = (): string[] => editor.artifact.sections.map((s) => s.id);

beforeEach(() => {
    loadArtifactContent("base", { ...shell, sections: [real("a")] });
    onLoadSections(async () => []);
});

describe("loadArtifactWindow", () => {
    it("places the loaded sections and holds the rest open as placeholders", () => {
        loadArtifactWindow("doc", shell, index(["a", "b", "c", "d"]), [real("a"), real("b")]);
        expect(ids()).toEqual(["a", "b", "c", "d"]);
        expect([...pending().keys()]).toEqual(["c", "d"]);
        // the summary the stand-in is drawn from, not just a height
        expect(pending().get("c")).toMatchObject({ id: "c", kind: "content", size: 900 });
        expect(isWindowed()).toBe(true);
    });

    it("is not windowed when the first read already covered the artifact", () => {
        loadArtifactWindow("doc", shell, index(["a", "b"]), [real("a"), real("b")]);
        expect(pending().size).toBe(0);
        expect(isWindowed()).toBe(false);
    });

    it("carries the shell through", () => {
        loadArtifactWindow("doc", { format: "doc", theme: "aurora" }, index(["a"]), [real("a")]);
        expect(editor.artifact.format).toBe("doc");
        expect(editor.artifact.theme).toBe("aurora");
    });
});

describe("requestSections", () => {
    it("swaps a placeholder for its content without recording an edit", async () => {
        await inRootAsync(async () => {
            loadArtifactWindow("doc", shell, index(["a", "b"]), [real("a")]);
            const seq = editSeq();
            onLoadSections(async (want) => want.map(real));
            await requestSections(["b"]);
            expect(pending().size).toBe(0);
            expect(editSeq()).toBe(seq); // a load is not an edit — no autosave, no history entry
        });
    });

    it("asks once for a section already in flight, and never for a loaded one", async () => {
        loadArtifactWindow("doc", shell, index(["a", "b"]), [real("a")]);
        const asked: string[][] = [];
        onLoadSections(async (want) => {
            asked.push(want);
            return want.map(real);
        });
        await Promise.all([requestSections(["b"]), requestSections(["b"])]);
        await requestSections(["b", "a"]);
        expect(asked).toEqual([["b"]]);
    });

    it("leaves a section pending when the fetch fails", async () => {
        loadArtifactWindow("doc", shell, index(["a", "b"]), [real("a")]);
        onLoadSections(() => Promise.reject(new Error("offline")));
        await requestSections(["b"]);
        expect([...pending().keys()]).toEqual(["b"]);
    });
});

describe("ensureAllSections", () => {
    it("resolves everything that is still pending", async () => {
        loadArtifactWindow("doc", shell, index(["a", "b", "c"]), [real("a")]);
        onLoadSections(async (want) => want.map(real));
        await ensureAllSections();
        expect(pending().size).toBe(0);
    });

    it("gives up rather than spinning when nothing can be fetched", async () => {
        loadArtifactWindow("doc", shell, index(["a", "b"]), [real("a")]);
        const load = vi.fn(async () => []);
        onLoadSections(load);
        await ensureAllSections();
        expect(load).toHaveBeenCalledTimes(1);
        expect(pending().size).toBe(1);
    });
});

describe("switching artifacts mid-flight", () => {
    it("drops a response that lands after the switch, rather than splicing it in", async () => {
        await inRootAsync(async () => {
            loadArtifactWindow("doc-a", shell, index(["a", "shared"]), [real("a")]);
            let release: (s: Section[]) => void = () => {};
            onLoadSections(() => new Promise<Section[]>((res) => (release = res)));
            const inFlight = requestSections(["shared"]);

            // the user opens another artifact whose sections happen to share an id
            loadArtifactWindow("doc-b", shell, index(["shared"]), [real("shared")]);
            const before = editor.artifact.sections[0];
            release([sectionOf(emptyRegion(), { id: "shared" })]);
            await inFlight;

            expect(editor.artifact.sections[0]).toBe(before); // untouched
        });
    });

    it("releases in-flight ids so the next artifact can ask for the same one", async () => {
        loadArtifactWindow("doc-a", shell, index(["x"]), []);
        onLoadSections(() => new Promise<Section[]>(() => {}));
        void requestSections(["x"]);
        loadArtifactWindow("doc-b", shell, index(["x"]), []);
        const asked: string[][] = [];
        onLoadSections(async (want) => {
            asked.push(want);
            return want.map(real);
        });
        await requestSections(["x"]);
        expect(asked).toEqual([["x"]]);
    });
});

describe("remembered heights", () => {
    it("returns a section's measured height for the same width bucket, and forgets on load", () => {
        loadArtifactWindow("doc", shell, index(["a"]), [real("a")]);
        rememberHeight("a", 1000, 480);
        expect(knownHeight("a", 1000)).toBe(480);
        expect(knownHeight("a", 1010)).toBe(480); // same width bucket
        expect(knownHeight("a", 600)).toBeUndefined(); // a different layout width
        loadArtifactContent("other", { ...shell, sections: [real("a")] });
        expect(knownHeight("a", 1000)).toBeUndefined();
    });
});

describe("history across a windowed load", () => {
    it("undo does not un-load a section that arrived after the snapshot", async () => {
        await inRootAsync(async () => {
            loadArtifactWindow("doc", shell, index(["a", "b"]), [real("a")]);
            // an edit recorded while b was still a placeholder
            commit({ ...editor.artifact, sections: [real("a2"), editor.artifact.sections[1]!] });
            onLoadSections(async (want) => want.map((id) => sectionOf(emptyRegion(), { id })));
            await requestSections(["b"]);
            const loadedB = editor.artifact.sections[1];

            undo();
            expect(editor.artifact.sections[1]).toBe(loadedB); // still the real one
            redo();
            expect(editor.artifact.sections[1]).toBe(loadedB);
        });
    });
});

// createRoot with an async body: dispose after the body settles
async function inRootAsync(body: () => Promise<void>): Promise<void> {
    let done!: Promise<void>;
    createRoot((dispose) => {
        done = body().finally(dispose);
    });
    await done;
}
