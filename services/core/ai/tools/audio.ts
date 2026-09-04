import type { TurnEvent } from "@model/ai";
import { implement } from "@services/core/ai/tools";
import { prepare } from "@services/core/narration";
import { composeForArtifact, composeForWorkspace, ensurePreset } from "@services/core/soundtrack";
import { DEFAULT_PRESET, type DesignedCandidate } from "@model/speech";
import { DEFAULT_MS } from "@services/core/ai/music";
import { synthesize } from "@services/core/ai/speech";
import { design, voiceFor } from "@services/core/voices";
import type { schema } from "@services/db/schema";

// The speech and music tools. Each runs against a provider rather than a text model, so the price
// is in what it makes: the executor's caller reports that from the result.

const workspaceOf = (ws: { id: string } | undefined): string => {
    if (!ws) throw new Error("There is no workspace in this context.");
    return ws.id;
};

export interface Narrated {
    chars: number; // synthesized now; a cached section counts nothing
    sections: number;
}

// each section's audio lands as its own event, so a client can play the first while the rest render
implement(
    "narrate-artifact",
    async function* (input, ctx): AsyncGenerator<TurnEvent, Narrated> {
        const content = ctx.artifact;
        const artifactId = ctx.artifactId;
        if (!content || !artifactId) throw new Error("There is no artifact to narrate here.");
        const workspaceId = workspaceOf(ctx.principal?.ws);
        let chars = 0;
        let sections = 0;
        for await (const ev of prepare(artifactId, content, workspaceId, input.sectionIds)) {
            chars += ev.chars;
            sections += 1;
            yield {
                type: "section.audio",
                id: ev.sectionId,
                ms: ev.ms,
                cached: ev.cached,
                chars: ev.chars,
            };
        }
        return { chars, sections };
    },
    { note: (r) => `Narrated ${r.sections} section${r.sections === 1 ? "" : "s"}.` },
);

type BedRow = typeof schema.soundtracks.$inferSelect;

export interface Composed {
    row: BedRow;
    ms: number; // written now; a bed this deployment already had reports zero
}

implement("compose-soundtrack", async function* (input, ctx): AsyncGenerator<TurnEvent, Composed> {
    if (input.description?.trim()) {
        const out = await composeForWorkspace(workspaceOf(ctx.principal?.ws), input.description);
        return { row: out.row, ms: out.ms };
    }
    if (input.custom) {
        if (!ctx.artifact || !ctx.artifactId)
            throw new Error("There is no artifact to write a bed for here.");
        const out = await composeForArtifact(
            ctx.artifactId,
            ctx.artifact,
            input.lengthMs ?? DEFAULT_MS,
        );
        return { row: out.row, ms: out.ms };
    }
    // a preset is built once for the deployment; `chars` is its length when it was built now
    const out = await ensurePreset(input.preset ?? DEFAULT_PRESET);
    return { row: out.row, ms: out.chars };
});

export interface Auditioned {
    audio: string; // a data url
    ms: number;
}

implement("audition-voice", async function* (input, ctx): AsyncGenerator<TurnEvent, Auditioned> {
    const voice = await voiceFor(workspaceOf(ctx.principal?.ws), input.voiceId);
    if (!voice) throw new Error("This workspace has no voices yet.");
    const out = await synthesize(input.text ?? "", voice.externalId);
    return { audio: `data:${out.mime};base64,${out.audio.toString("base64")}`, ms: out.ms };
});

implement("design-voice", async function* (input): AsyncGenerator<TurnEvent, DesignedCandidate[]> {
    return await design(input.description, input.sampleText?.trim()?.slice(0, 1000));
});
