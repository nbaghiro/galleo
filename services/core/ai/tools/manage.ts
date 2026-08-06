import { z } from "zod";
import type { TurnEvent, WorkspaceAction } from "@model/ai";
import { register } from "./registry";

type Action<K extends WorkspaceAction["kind"]> = Extract<WorkspaceAction, { kind: K }>;

export const renameArtifactTool = register({
    id: "rename-artifact",
    describe:
        "Rename one of the user's artifacts. artifactId = its id (from find-artifacts); title = the new title.",
    input: z.object({
        artifactId: z.string(),
        title: z.string().describe("the new title"),
    }),
    async *run(input): AsyncGenerator<TurnEvent, Action<"rename">> {
        return { kind: "rename", id: input.artifactId, title: input.title.trim() };
    },
});

export const moveArtifactTool = register({
    id: "move-artifact",
    describe:
        "Move an artifact into a folder, or out of one. artifactId = its id; folderId = the target folder id (from the workspace's folder list), or null to remove it from any folder.",
    input: z.object({
        artifactId: z.string(),
        folderId: z.string().nullable().describe("target folder id, or null for no folder"),
    }),
    async *run(input): AsyncGenerator<TurnEvent, Action<"move">> {
        return { kind: "move", id: input.artifactId, folderId: input.folderId };
    },
});

export const duplicateArtifactTool = register({
    id: "duplicate-artifact",
    describe:
        "Make a copy of an artifact (kept in the same folder). artifactId = its id. Good for spinning a variant.",
    input: z.object({ artifactId: z.string() }),
    async *run(input): AsyncGenerator<TurnEvent, Action<"duplicate">> {
        return { kind: "duplicate", id: input.artifactId };
    },
});

export const trashArtifactTool = register({
    id: "trash-artifact",
    describe:
        "Move an artifact to Trash (recoverable). artifactId = its id. Use only when the user clearly wants to delete/remove it — the user still confirms before it happens.",
    input: z.object({ artifactId: z.string() }),
    async *run(input): AsyncGenerator<TurnEvent, Action<"trash">> {
        return { kind: "trash", id: input.artifactId };
    },
});

export const restoreArtifactTool = register({
    id: "restore-artifact",
    describe: "Restore an artifact from Trash back into the library. artifactId = its id.",
    input: z.object({ artifactId: z.string() }),
    async *run(input): AsyncGenerator<TurnEvent, Action<"restore">> {
        return { kind: "restore", id: input.artifactId };
    },
});

export const createFolderTool = register({
    id: "create-folder",
    describe: "Create a new folder in the workspace. name = the folder name.",
    input: z.object({ name: z.string().describe("the folder name") }),
    async *run(input): AsyncGenerator<TurnEvent, Action<"create-folder">> {
        return { kind: "create-folder", name: input.name.trim() };
    },
});

export const shareArtifactTool = register({
    id: "share-artifact",
    describe:
        "Open the share options for an artifact so the user can publish a link. artifactId = its id. This does NOT publish — it opens the share panel where the user chooses visibility and explicitly creates the link. Use it when they ask to share/publish/send a piece.",
    input: z.object({ artifactId: z.string() }),
    async *run(input): AsyncGenerator<TurnEvent, Action<"share">> {
        return { kind: "share", id: input.artifactId };
    },
});

export const exportArtifactTool = register({
    id: "export-artifact",
    describe:
        "Open an artifact so the user can export it (PDF / PNG / etc.). artifactId = its id. This opens the artifact in the editor, where the Export menu lives — it does not download anything on its own.",
    input: z.object({ artifactId: z.string() }),
    async *run(input): AsyncGenerator<TurnEvent, Action<"export">> {
        return { kind: "export", id: input.artifactId };
    },
});
