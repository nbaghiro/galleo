import { describe, it, expect } from "vitest";
import type { ChatContext } from "@model/ai";
import type { ArtifactContent, ElementInstance, Section } from "@model/artifact";
import { THEME_LIST } from "@themes";
import { chatSystem } from "../chat";

const txt = (text: string): ElementInstance => ({ type: "text", data: { text } });
const sec = (id: string, title: string): Section => ({
    id,
    root: { type: "group", data: { children: [txt(title)] } },
});

const content: ArtifactContent = {
    format: "deck",
    theme: "studio",
    sections: [sec("s1", "Title"), sec("s2", "Thesis")],
};

describe("chatSystem — library surface (no open artifact)", () => {
    const libCtx: ChatContext = {
        surface: "library",
        library: {
            artifactCount: 3,
            folder: "Decks",
            folders: [{ id: "f1", name: "Work" }],
            recent: [{ title: "Aria deck", format: "deck" }],
        },
        credits: { remaining: 5, limit: 100 },
    };

    it("uses the library persona", () => {
        expect(chatSystem(libCtx)).toContain("Galleo's library");
    });
    it("does NOT include the editor's artifact digest or theme reference", () => {
        const out = chatSystem(libCtx);
        expect(out).not.toContain("Current artifact");
        expect(out).not.toContain("Built-in themes");
    });
    it("summarizes the workspace", () => {
        const out = chatSystem(libCtx);
        expect(out).toContain("They have 3 artifacts.");
        expect(out).toContain("Aria deck");
        expect(out).toContain("f1 — Work");
    });
    it("pluralizes the artifact count", () => {
        expect(chatSystem({ surface: "library", library: { artifactCount: 1 } })).toContain(
            "They have 1 artifact.",
        );
    });
    it("omits the workspace summary when there is no library", () => {
        expect(chatSystem({ surface: "library" })).not.toContain("The user's workspace");
    });
    it("omits the credit line when there are no credits", () => {
        expect(chatSystem({ surface: "library" })).not.toContain("AI credits left");
    });
});

describe("chatSystem — editor surface (open artifact)", () => {
    const edCtx: ChatContext = {
        surface: "editor",
        content,
        credits: { remaining: 5, limit: 100 },
        plan: "pro",
    };

    it("uses the editor persona", () => {
        expect(chatSystem(edCtx)).toContain("Galleo's editor");
    });
    it("includes the artifact spine and digest", () => {
        const out = chatSystem(edCtx);
        expect(out).toContain('A deck themed "studio".');
        expect(out).toContain("Current artifact");
    });
    it("includes a theme reference listing EVERY built-in theme id", () => {
        const out = chatSystem(edCtx);
        expect(out).toContain("Built-in themes");
        for (const t of THEME_LIST) expect(out).toContain(t.id);
    });
    it("renders the credit line with the plan", () => {
        expect(chatSystem(edCtx)).toContain("5 of 100 AI credits");
    });
});

describe("chatSystem — focus (current selection) line", () => {
    it("omits the selection line for focus kind none", () => {
        const ctx: ChatContext = { surface: "editor", content, focus: { kind: "none" } };
        expect(chatSystem(ctx)).not.toContain("The user's current selection");
    });
    it("names a selected section", () => {
        const ctx: ChatContext = {
            surface: "editor",
            content,
            focus: { kind: "section", sectionId: "s2", headline: "Thesis" },
        };
        const out = chatSystem(ctx);
        expect(out).toContain("The user's current selection");
        expect(out).toContain("section [s2]");
    });
    it("names a selected element by type and section", () => {
        const ctx: ChatContext = {
            surface: "editor",
            content,
            focus: { kind: "element", sectionId: "s2", elementType: "stat" },
        };
        expect(chatSystem(ctx)).toContain("a stat in section [s2]");
    });
});
