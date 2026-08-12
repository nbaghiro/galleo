import { describe, expect, it } from "vitest";
import type { ChatGeneration } from "@model/ai";
import type { ArtifactContent } from "@model/artifact";
import { chatSystem } from "../prompts/chat";

const content = (n: number): ArtifactContent => ({
    format: "deck",
    theme: "base",
    sections: Array.from({ length: n }, (_, i) => ({
        id: `s${i + 1}`,
        root: { type: "text", data: { text: `body ${i + 1}` } },
    })),
});

const generation = (over: Partial<ChatGeneration> = {}): ChatGeneration => ({
    stage: "outline",
    surface: "deck",
    prompt: "A launch deck for Meridian",
    beats: [
        { id: "s1", label: "Cover", role: "scene", written: true },
        { id: "s2", label: "The problem", role: "tension", written: false },
    ],
    ...over,
});

describe("which prompt a context gets", () => {
    it("uses the library prompt when there's nothing open", () => {
        const out = chatSystem({ surface: "library" });
        expect(out).toContain("Galleo's library");
        expect(out).not.toContain("generation studio");
    });
    it("uses the editor prompt when an artifact is open", () => {
        const out = chatSystem({ surface: "editor", content: content(2) });
        expect(out).toContain("Galleo's editor");
        expect(out).not.toContain("generation studio");
    });
    // `generation` decides, not the surface string: a stale surface must not route a live run
    it("uses the generate prompt whenever a run is present, whatever the surface says", () => {
        for (const surface of ["editor", "library", "generate"] as const) {
            const out = chatSystem({ surface, content: content(1), generation: generation() });
            expect(out).toContain("generation studio");
        }
    });
});

describe("the generate prompt", () => {
    const out = (over?: Partial<ChatGeneration>): string =>
        chatSystem({ surface: "generate", content: content(1), generation: generation(over) });

    it("names request-write as the way to execute the plan, and warns off add-section", () => {
        expect(out()).toContain("request-write");
        expect(out()).toContain("Never use add-section for this");
    });
    it("names request-plan for replanning the arc, distinct from revising it", () => {
        const text = out();
        expect(text).toContain("request-plan");
        expect(text).toContain("REPLAN");
    });
    it("never offers to start a separate artifact", () => {
        expect(out()).not.toContain("propose-generation");
    });
    it("shows every beat with its id and whether it's written", () => {
        const text = out();
        expect(text).toContain("[s1]");
        expect(text).toContain("[s2]");
        expect(text).toContain("WRITTEN");
        expect(text).toContain("not yet written");
        expect(text).toContain("1 of 2 sections written");
    });
    it("carries the brief the run is judged against", () => {
        const text = out({
            goal: "win the round",
            audience: "seed investors",
            mustInclude: ["ARR"],
        });
        expect(text).toContain("win the round");
        expect(text).toContain("seed investors");
        expect(text).toContain("ARR");
    });
    it("says so plainly when nothing is planned yet", () => {
        expect(out({ beats: [] })).toContain("No beats planned yet.");
    });
    it("offers steer-sections for an instruction meant to hold across the run", () => {
        expect(out()).toContain("steer-sections");
    });
    it("carries a steering note already in force, so the agent amends rather than repeats it", () => {
        expect(out({ steer: "keep every section under four lines" })).toContain(
            "keep every section under four lines",
        );
    });
    it("says nothing about steering when no note is set", () => {
        expect(out()).not.toContain("Standing note on every section");
    });
});

describe("the library prompt", () => {
    it("does offer to start something new", () => {
        expect(chatSystem({ surface: "library" })).toContain("propose-generation");
    });
    it("reports the balance when the client sent one", () => {
        const out = chatSystem({ surface: "library", credits: { remaining: 40, limit: 100 } });
        expect(out).toContain("40 of 100");
    });
});
