import { describe, it, expect } from "vitest";
import type { ChatContext, Generation } from "@model/ai";
import type { ArtifactContent, ElementInstance, Section } from "@model/artifact";
import { THEME_LIST } from "@themes";
import { chatSystem, type ChatView } from "@services/core/ai/prompts/chat";

const txt = (text: string): ElementInstance => ({ type: "text", data: { text } });
const sec = (id: string, title: string): Section => ({
    id,
    root: { type: "container", data: { children: [txt(title)] } },
});

const content: ArtifactContent = {
    format: "deck",
    theme: "studio",
    sections: [sec("s1", "Title"), sec("s2", "Thesis")],
};

const tools = [
    { id: "find-artifacts", describe: "search the library" },
    { id: "write-beat", describe: "write one planned beat" },
];

const view = (context: ChatContext, over: Partial<ChatView> = {}): string =>
    chatSystem({ context, tools, ...over });

const generation = (over: Partial<Generation> = {}): Generation => ({
    id: "gen-1",
    createdAt: "2026-09-01T00:00:00.000Z",
    workspaceId: "ws",
    artifactId: "a1",
    stage: "outlined",
    brief: {
        prompt: "A launch deck for Meridian",
        surface: "deck",
        theme: "studio",
        goal: "win the round",
        audience: "seed investors",
        mustInclude: ["ARR"],
        set: {},
    },
    briefVersion: 0,
    outline: {
        title: "Meridian",
        beats: [
            { id: "s1", label: "Cover", role: "scene" },
            { id: "s2", label: "The problem", role: "tension", takeaway: "Tools interrupt" },
        ],
    },
    plannedAgainst: 0,
    steer: "",
    clarify: null,
    beats: { s1: { status: "done", versions: [sec("s1", "Cover")], active: 0 } },
    seq: 3,
    ...over,
});

describe("chatSystem: one persona, facts per context", () => {
    it("lists exactly the tools the context was offered", () => {
        const out = view({ surface: "library" });
        expect(out).toContain("- find-artifacts: search the library");
        expect(out).toContain("- write-beat: write one planned beat");
        expect(out).not.toContain("propose-generation");
    });
    it("uses the library facts when nothing is open", () => {
        const out = view({
            surface: "library",
            library: {
                artifactCount: 3,
                folder: "Decks",
                folders: [{ id: "f1", name: "Work" }],
                recent: [{ title: "Aria deck", format: "deck" }],
            },
        });
        expect(out).toContain("## The library");
        expect(out).toContain("They have 3 artifacts.");
        expect(out).toContain("Aria deck");
        expect(out).toContain("f1 · Work");
        expect(out).not.toContain("Current artifact");
        expect(out).not.toContain("Built-in themes");
    });
    it("uses the editor facts when an artifact is open", () => {
        const out = view({ surface: "editor", content }, { content });
        expect(out).toContain("## The open artifact");
        expect(out).toContain('A deck themed "studio".');
        expect(out).toContain("Current artifact");
        for (const t of THEME_LIST) expect(out).toContain(t.id);
    });
    it("uses the generation facts when a run is in progress, whatever the surface says", () => {
        for (const surface of ["editor", "library", "generate"] as const) {
            const out = view({ surface }, { generation: generation() });
            expect(out).toContain("## The piece being made");
            expect(out).not.toContain("## The library");
        }
    });
});

describe("the generation digest", () => {
    const out = (over?: Partial<Generation>): string =>
        view({ surface: "generate", generationId: "gen-1" }, { generation: generation(over) });

    it("shows every beat with its id and whether it is written", () => {
        const text = out();
        expect(text).toContain("[s1]");
        expect(text).toContain("[s2]");
        expect(text).toContain("WRITTEN");
        expect(text).toContain("not yet written");
        expect(text).toContain("1 of 2 sections written");
    });
    it("carries the brief the run is judged against", () => {
        const text = out();
        expect(text).toContain("win the round");
        expect(text).toContain("seed investors");
        expect(text).toContain("ARR");
    });
    it("says so plainly when nothing is planned yet", () => {
        expect(out({ outline: null, beats: {} })).toContain("No beats planned yet.");
    });
    it("carries a steering note already in force, and says nothing when there is none", () => {
        expect(out({ steer: "keep every section under four lines" })).toContain(
            "keep every section under four lines",
        );
        expect(out()).not.toContain("Standing note on every section");
    });
    it("says the outline is stale once the brief moved past it", () => {
        expect(out({ briefVersion: 2 })).toContain("The brief changed after this outline");
        expect(out()).not.toContain("The brief changed after this outline");
    });
    it("warns off add-section for a planned beat", () => {
        expect(out()).toContain("never written with add-section");
    });
});

describe("what every surface carries", () => {
    it("lists pending proposals by id so a spoken approval can name one", () => {
        const out = view({
            surface: "library",
            pending: [{ id: "p-1", tool: "start-generation", summary: "Start a deck" }],
        });
        expect(out).toContain("p-1 · start-generation · Start a deck");
        expect(out).toContain("apply-patch");
    });
    it("reports the balance when the client sent one, with the plan", () => {
        const out = view({
            surface: "library",
            credits: { remaining: 40, limit: 100 },
            plan: "pro",
        });
        expect(out).toContain("40 of 100");
        expect(out).toContain("(pro plan)");
    });
    it("omits the credit line when there are no credits", () => {
        expect(view({ surface: "library" })).not.toContain("AI credits left");
    });
    it("names the selection in the editor", () => {
        const out = view(
            {
                surface: "editor",
                content,
                focus: { kind: "section", sectionId: "s2", headline: "Thesis" },
            },
            { content },
        );
        expect(out).toContain("section [s2]");
        expect(out).toContain("“Thesis”");
    });
    it("carries no em dash, the tell the copy guard bans", () => {
        expect(view({ surface: "library" }, { generation: generation() })).not.toMatch(/—/);
    });
});
