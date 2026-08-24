import { describe, expect, it } from "vitest";
import {
    ACCEPT,
    ATTACH_ICON,
    extensionOf,
    formatBytes,
    isExtractableFile,
    isReadableFile,
    mergeAttachments,
    SOURCE_OPTIONS,
    sourceLength,
    type Attachment,
} from "@app/stores/attachments";

const file = (name: string, text: string): Attachment => ({
    id: name,
    name,
    kind: "file",
    text,
});
const pasted = (text: string): Attachment => ({
    id: "p",
    name: "Pasted text",
    kind: "paste",
    text,
});

describe("readable files", () => {
    it("takes anything typed as text", () => {
        expect(isReadableFile("notes", "text/plain")).toBe(true);
        expect(isReadableFile("data", "application/json")).toBe(true);
    });
    it("falls back to the extension when the type is missing or wrong", () => {
        // browsers hand back "" for .md on several platforms
        expect(isReadableFile("brief.md", "")).toBe(true);
        expect(isReadableFile("rows.csv", "application/vnd.ms-excel")).toBe(true);
        expect(isReadableFile("TRANSCRIPT.VTT", "")).toBe(true);
    });
    it("refuses binaries rather than feeding the planner mojibake", () => {
        expect(isReadableFile("deck.pdf", "application/pdf")).toBe(false);
        expect(isReadableFile("notes.docx", "application/vnd.openxmlformats")).toBe(false);
        expect(isReadableFile("photo.png", "image/png")).toBe(false);
    });
    it("reads the extension off the last dot only", () => {
        expect(extensionOf("q3.final.md")).toBe("md");
        expect(extensionOf("README")).toBe("");
    });
});

describe("extractable files (the server reads these)", () => {
    it("routes the binary formats to extraction, by MIME or extension", () => {
        expect(isExtractableFile("deck.pdf", "application/pdf")).toBe(true);
        expect(isExtractableFile("deck.pdf", "")).toBe(true);
        expect(
            isExtractableFile(
                "notes.docx",
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            ),
        ).toBe(true);
        expect(isExtractableFile("model.xlsm", "")).toBe(true);
        expect(isExtractableFile("photo.png", "image/png")).toBe(true);
        expect(isExtractableFile("photo.JPG", "")).toBe(true);
    });
    it("does not claim what neither gate supports", () => {
        expect(isExtractableFile("movie.mp4", "video/mp4")).toBe(false);
        expect(isExtractableFile("old.xls", "")).toBe(false);
        // and the gates don't overlap: text stays on the inline path
        expect(isExtractableFile("notes.md", "")).toBe(false);
    });
    it("the shared accept list carries both gates, so the dialogs can't drift", () => {
        for (const ext of [".md", ".csv", ".pdf", ".docx", ".xlsx", ".png", ".webp"])
            expect(ACCEPT).toContain(ext);
        expect(ACCEPT).toContain("text/*");
    });
});

describe("merging attachments", () => {
    it("is undefined with nothing to build from", () => {
        expect(mergeAttachments([])).toBeUndefined();
        expect(mergeAttachments([pasted("   ")])).toBeUndefined();
    });
    it("names files so the planner can tell them apart, but not pasted text", () => {
        const merged = mergeAttachments([file("notes.md", "alpha"), pasted("beta")]);
        expect(merged).toBe("--- notes.md ---\nalpha\n\nbeta");
    });
    it("keeps order and drops the blanks between", () => {
        const merged = mergeAttachments([pasted("one"), pasted("  "), pasted("two")]);
        expect(merged).toBe("one\n\ntwo");
    });
    it("measures what actually gets sent, headers included", () => {
        expect(sourceLength([])).toBe(0);
        expect(sourceLength([pasted("abcde")])).toBe(5);
        expect(sourceLength([file("a.md", "xy")])).toBe("--- a.md ---\nxy".length);
    });
});

describe("byte labels", () => {
    it("scales the unit to the size", () => {
        expect(formatBytes(512)).toBe("512 B");
        expect(formatBytes(2048)).toBe("2 KB");
        expect(formatBytes(3 * 1024 * 1024)).toBe("3.0 MB");
    });
});

describe("the shared + menu's source options", () => {
    it("offers the four sources with their canonical labels, in the intake's order", () => {
        expect(SOURCE_OPTIONS.map((o) => o.id)).toEqual(["files", "paste", "link", "artifact"]);
        expect(SOURCE_OPTIONS.map((o) => o.label)).toEqual([
            "Upload files",
            "Paste text",
            "Add a link",
            "Galleo artifact",
        ]);
        expect(SOURCE_OPTIONS.map((o) => o.tag)).toEqual([
            ".txt .md .csv…",
            "docs · email · slack",
            "page → text",
            "library · template",
        ]);
    });
    it("menu icons and attachment-chip icons agree per source kind", () => {
        const iconOf = (id: string): string | undefined =>
            SOURCE_OPTIONS.find((o) => o.id === id)?.icon;
        expect(iconOf("files")).toBe(ATTACH_ICON.file);
        expect(iconOf("paste")).toBe(ATTACH_ICON.paste);
        expect(iconOf("link")).toBe(ATTACH_ICON.link);
        expect(iconOf("artifact")).toBe(ATTACH_ICON.artifact);
    });
    it("keeps one chip icon per attachment kind", () => {
        expect(Object.keys(ATTACH_ICON).sort()).toEqual(["artifact", "file", "link", "paste"]);
        for (const icon of Object.values(ATTACH_ICON)) expect(icon).toBeTruthy();
    });
});
