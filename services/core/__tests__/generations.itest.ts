import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { readArtifact } from "@services/core/artifacts";
import { makeGenerationStore } from "@services/core/generations";
import { seedUser } from "@services/__tests__/harness";
import { db } from "@services/db/client";
import { schema } from "@services/db/schema";

// The record a run leaves on its artifact: written at create so the piece is marked as generated
// before a single beat lands, then rewritten at finish with the models that ran.

const brief = {
    prompt: "A launch deck for Meridian",
    surface: "deck" as const,
    theme: "studio",
    set: {},
};

describe("the run's record on its artifact", () => {
    it("marks the draft as generated the moment the run is created", async () => {
        const { userId, workspaceId } = await seedUser();
        const { generation } = await makeGenerationStore(workspaceId, userId).create({ brief });

        const row = await readArtifact(workspaceId, generation.artifactId);
        expect(row?.aiMeta).toMatchObject({
            generationId: generation.id,
            prompt: brief.prompt,
            surface: "deck",
            theme: "studio",
            models: {},
            beats: [],
        });
    });

    it("completes the record with the models once the run finishes", async () => {
        const { userId, workspaceId } = await seedUser();
        const store = makeGenerationStore(workspaceId, userId);
        const { generation } = await store.create({ brief });
        await store.finish(generation.id, { outline: "google:gemini-2.5-pro" });

        const row = await readArtifact(workspaceId, generation.artifactId);
        expect(row?.aiMeta).toMatchObject({
            generationId: generation.id,
            models: { outline: "google:gemini-2.5-pro" },
        });
    });

    it("hands an existing artifact to a new run, which then owns its record", async () => {
        const { userId, workspaceId } = await seedUser();
        const store = makeGenerationStore(workspaceId, userId);
        const first = await store.create({ brief });
        const second = await store.create({ brief, artifactId: first.generation.artifactId });

        const row = await readArtifact(workspaceId, first.generation.artifactId);
        expect(row?.aiMeta?.generationId).toBe(second.generation.id);
    });

    // the draft is an artifact like any other, so a run on a capped workspace is refused where the
    // row would be made, with the same words the route uses
    it("refuses a new draft when the workspace has made all its plan allows", async () => {
        const { userId, workspaceId } = await seedUser({ plan: "free" });
        await db
            .update(schema.workspaces)
            .set({ artifactsMade: 5 })
            .where(eq(schema.workspaces.id, workspaceId));
        await expect(makeGenerationStore(workspaceId, userId).create({ brief })).rejects.toThrow(
            "Upgrade for unlimited",
        );
    });
});
