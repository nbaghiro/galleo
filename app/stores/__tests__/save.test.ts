// @vitest-environment happy-dom
import "@elements/register";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot } from "solid-js";
import type { ArtifactShell, Section, SectionSummary } from "@model/artifact";
import { emptyRegion } from "@model/section";
import { sectionOf } from "@canvas/testkit";
import {
    commit,
    editor,
    loadArtifactContent,
    loadArtifactWindow,
    onLoadSections,
} from "@editor/core/store";
import { flushAutosave, installAutosave } from "../save";

const shell: ArtifactShell = { format: "deck", theme: "studio" };
const sec = (id: string): Section => sectionOf(emptyRegion(), { id });
// same id, fresh object: exactly what an edit to a section produces
const edited = (id: string): Section => sectionOf(emptyRegion(), { id });
const index = (ids: string[]): SectionSummary[] =>
    ids.map((id) => ({ id, kind: "content", size: 900 }));

interface Call {
    url: string;
    method: string;
    body: Record<string, unknown>;
}

let calls: Call[] = [];
let failNext = false;

function stubFetch(): void {
    vi.stubGlobal(
        "fetch",
        vi.fn((url: string, init?: RequestInit) => {
            calls.push({
                url,
                method: init?.method ?? "GET",
                body: JSON.parse((init?.body as string) ?? "{}") as Record<string, unknown>,
            });
            if (failNext) {
                failNext = false;
                return Promise.resolve({
                    ok: false,
                    status: 409,
                    statusText: "Conflict",
                    headers: { get: () => "application/json" },
                    text: async () => JSON.stringify({ error: "unknown section" }),
                });
            }
            return Promise.resolve({
                ok: true,
                status: 200,
                statusText: "OK",
                headers: { get: () => "application/json" },
                text: async () => JSON.stringify({ ok: true, updatedAt: "now", total: 1 }),
            });
        }),
    );
}

let dispose: (() => void) | null = null;
const install = (): void => {
    createRoot((d) => {
        dispose = d;
        installAutosave();
    });
};

beforeEach(() => {
    calls = [];
    failNext = false;
    stubFetch();
    onLoadSections(async (ids) => ids.map(sec));
});

afterEach(() => {
    dispose?.();
    dispose = null;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

const contentCalls = (): Call[] => calls.filter((c) => c.url.endsWith("/content"));
const wholeCalls = (): Call[] =>
    calls.filter((c) => c.method === "PATCH" && !c.url.endsWith("/content"));

describe("autosave", () => {
    it("sends only the section that changed", async () => {
        loadArtifactContent("doc-1", { ...shell, sections: [sec("a"), sec("b")] });
        install();
        commit({ ...editor.artifact, sections: [edited("a"), editor.artifact.sections[1]!] });
        await flushAutosave();

        expect(contentCalls()).toHaveLength(1);
        const ops = contentCalls()[0]!.body.ops as { kind: string; section?: Section }[];
        expect(ops).toHaveLength(1);
        expect(ops[0]!.kind).toBe("set");
        expect(ops[0]!.section!.id).toBe("a"); // the edited section, not the untouched one
    });

    it("writes nothing when a flush finds no difference", async () => {
        loadArtifactContent("doc-2", { ...shell, sections: [sec("a")] });
        install();
        await flushAutosave();
        expect(calls).toHaveLength(0);
    });

    it("advances its baseline, so the next save carries only the newest change", async () => {
        loadArtifactContent("doc-3", { ...shell, sections: [sec("a"), sec("b")] });
        install();
        commit({ ...editor.artifact, sections: [edited("a"), editor.artifact.sections[1]!] });
        await flushAutosave();
        commit({ ...editor.artifact, sections: [editor.artifact.sections[0]!, edited("b")] });
        await flushAutosave();

        const second = contentCalls()[1]!.body.ops as { section?: Section }[];
        expect(second).toHaveLength(1);
        expect(second[0]!.section!.id).toBe("b");
    });

    it("describes a structural edit as insert plus order, not a rewrite", async () => {
        loadArtifactContent("doc-4", { ...shell, sections: [sec("a"), sec("b")] });
        install();
        const [a, b] = editor.artifact.sections;
        commit({ ...editor.artifact, sections: [a!, sec("mid"), b!] });
        await flushAutosave();

        const ops = contentCalls()[0]!.body.ops as { kind: string; index?: number }[];
        expect(ops.map((o) => o.kind)).toEqual(["insert"]);
        expect(ops[0]!.index).toBe(1);
    });

    it("falls back to a whole-document write when a section op is rejected", async () => {
        loadArtifactContent("doc-5", { ...shell, sections: [sec("a")] });
        install();
        failNext = true;
        commit({ ...editor.artifact, sections: [edited("a")] });
        await flushAutosave();

        expect(contentCalls()).toHaveLength(1);
        expect(wholeCalls()).toHaveLength(1); // the document is whole here, so replacing it is safe
        const draft = wholeCalls()[0]!.body.draftContent as { sections: Section[] };
        expect(draft.sections.map((s) => s.id)).toEqual(["a"]);
    });

    it("never replaces the whole document from a windowed client", async () => {
        loadArtifactWindow("doc-6", shell, index(["a", "b", "c"]), [sec("a")]);
        install();
        failNext = true;
        commit({
            ...editor.artifact,
            sections: [edited("a"), ...editor.artifact.sections.slice(1)],
        });
        await flushAutosave();

        expect(contentCalls()).toHaveLength(1);
        expect(wholeCalls()).toHaveLength(0); // the placeholders would have been written as empty
    });

    it("retries after a failure instead of dropping the edit", async () => {
        loadArtifactContent("doc-7", { ...shell, sections: [sec("a")] });
        install();
        vi.stubGlobal(
            "fetch",
            vi.fn(() => Promise.reject(new Error("offline"))),
        );
        commit({ ...editor.artifact, sections: [edited("a")] });
        await flushAutosave();

        stubFetch();
        await flushAutosave();
        expect(contentCalls()).toHaveLength(1); // the same edit, sent once the network came back
    });
});
