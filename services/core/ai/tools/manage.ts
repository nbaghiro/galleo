import type { TurnEvent, WorkspaceAction } from "@model/ai";
import { implement } from "@services/core/ai/tools";

type Action<K extends WorkspaceAction["kind"]> = Extract<WorkspaceAction, { kind: K }>;

export const renameArtifactTool = implement(
    "rename-artifact",
    async function* (input): AsyncGenerator<TurnEvent, Action<"rename">> {
        return { kind: "rename", id: input.artifactId, title: input.title.trim() };
    },
);

export const moveArtifactTool = implement("move-artifact", async function* (input): AsyncGenerator<
    TurnEvent,
    Action<"move">
> {
    return { kind: "move", id: input.artifactId, folderId: input.folderId };
});

export const duplicateArtifactTool = implement(
    "duplicate-artifact",
    async function* (input): AsyncGenerator<TurnEvent, Action<"duplicate">> {
        return { kind: "duplicate", id: input.artifactId };
    },
);

export const trashArtifactTool = implement(
    "trash-artifact",
    async function* (input): AsyncGenerator<TurnEvent, Action<"trash">> {
        return { kind: "trash", id: input.artifactId };
    },
    { note: () => "Proposed moving it to Trash; the user confirms before it happens." },
);

export const restoreArtifactTool = implement(
    "restore-artifact",
    async function* (input): AsyncGenerator<TurnEvent, Action<"restore">> {
        return { kind: "restore", id: input.artifactId };
    },
);

export const createFolderTool = implement("create-folder", async function* (input): AsyncGenerator<
    TurnEvent,
    Action<"create-folder">
> {
    return { kind: "create-folder", name: input.name.trim() };
});

export const shareArtifactTool = implement(
    "share-artifact",
    async function* (input): AsyncGenerator<TurnEvent, Action<"share">> {
        return { kind: "share", id: input.artifactId };
    },
    { note: () => "Opened the share options for the user to publish a link." },
);

export const exportArtifactTool = implement(
    "export-artifact",
    async function* (input): AsyncGenerator<TurnEvent, Action<"export">> {
        return { kind: "export", id: input.artifactId };
    },
    { note: () => "Opened the artifact for the user to export." },
);
