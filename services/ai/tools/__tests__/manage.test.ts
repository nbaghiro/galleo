import { describe, it, expect } from "vitest";
import type { TurnEvent } from "@model/ai";
import {
    renameArtifactTool,
    moveArtifactTool,
    duplicateArtifactTool,
    trashArtifactTool,
    restoreArtifactTool,
    createFolderTool,
    shareArtifactTool,
    exportArtifactTool,
} from "../manage";
import { makeContext, type Tool } from "../registry";

async function runTool<I, R>(tool: Tool<I, R>, input: I): Promise<R> {
    const gen = tool.run(input, makeContext({ image: {} }));
    let step: IteratorResult<TurnEvent, R> = await gen.next();
    while (!step.done) step = await gen.next();
    return step.value;
}

describe("renameArtifactTool", () => {
    it("packages a rename action and trims the title", async () => {
        const out = await runTool(renameArtifactTool, { artifactId: "a1", title: "  New Title  " });
        expect(out).toEqual({ kind: "rename", id: "a1", title: "New Title" });
    });
});

describe("moveArtifactTool", () => {
    it("packages a move into a folder", async () => {
        const out = await runTool(moveArtifactTool, { artifactId: "a1", folderId: "f9" });
        expect(out).toEqual({ kind: "move", id: "a1", folderId: "f9" });
    });

    it("folderId null → move out of any folder", async () => {
        const out = await runTool(moveArtifactTool, { artifactId: "a1", folderId: null });
        expect(out).toEqual({ kind: "move", id: "a1", folderId: null });
    });
});

describe("duplicateArtifactTool", () => {
    it("packages a duplicate action", async () => {
        expect(await runTool(duplicateArtifactTool, { artifactId: "a2" })).toEqual({
            kind: "duplicate",
            id: "a2",
        });
    });
});

describe("trashArtifactTool", () => {
    it("packages a trash action", async () => {
        expect(await runTool(trashArtifactTool, { artifactId: "a3" })).toEqual({
            kind: "trash",
            id: "a3",
        });
    });
});

describe("restoreArtifactTool", () => {
    it("packages a restore action", async () => {
        expect(await runTool(restoreArtifactTool, { artifactId: "a4" })).toEqual({
            kind: "restore",
            id: "a4",
        });
    });
});

describe("createFolderTool", () => {
    it("packages a create-folder action and trims the name", async () => {
        expect(await runTool(createFolderTool, { name: "  Q3 Docs  " })).toEqual({
            kind: "create-folder",
            name: "Q3 Docs",
        });
    });
});

describe("shareArtifactTool", () => {
    it("packages a share action", async () => {
        expect(await runTool(shareArtifactTool, { artifactId: "a5" })).toEqual({
            kind: "share",
            id: "a5",
        });
    });
});

describe("exportArtifactTool", () => {
    it("packages an export action", async () => {
        expect(await runTool(exportArtifactTool, { artifactId: "a6" })).toEqual({
            kind: "export",
            id: "a6",
        });
    });
});
