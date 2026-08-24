import { applyPatch } from "@model/ai";
import type { Patch, TurnEvent } from "@model/ai";
import type { ArtifactContent } from "@model/artifact";
import {
    createArtifact,
    isArtifactContent,
    readArtifact,
    updateArtifact,
} from "@services/core/artifacts";
import { openRoom } from "@services/core/collab";

// Taking effect, for a caller with no client to apply a result. Everything the in-app surfaces do
// through the browser happens here instead: load the artifact, run the tool against it, turn its
// result into a patch through the registry's own mapper, and write it back the way the REST route
// does so `digest`, `search_text`, media adoption, `seq` and the collaboration resync all follow.

export interface EffectTarget {
    workspaceId: string;
    artifactId: string;
}

export async function loadContent(t: EffectTarget): Promise<ArtifactContent | null> {
    const row = await readArtifact(t.workspaceId, t.artifactId);
    const draft = row?.draftContent;
    return isArtifactContent(draft) ? draft : null;
}

/**
 * Write a tool's already-applied content back. Goes through `updateArtifact` rather than touching
 * the row, because that is what re-derives the search columns and bumps `seq`; the room resync then
 * tells anyone editing live to catch up, which is the same pair the artifacts route uses.
 */
export async function commitContent(
    t: EffectTarget,
    content: ArtifactContent,
): Promise<Awaited<ReturnType<typeof updateArtifact>>> {
    const saved = await updateArtifact(t.workspaceId, t.artifactId, { draftContent: content });
    if (saved) openRoom(t.artifactId)?.resyncAll(saved.seq);
    return saved;
}

export const applyToContent = applyPatch;

/**
 * A tool that builds a whole piece rather than changing one. Generation streams its work as patches
 * and returns nothing, so the artifact is accumulated from the stream: the same ops the browser
 * applies while it watches sections land, gathered here instead because there is no browser.
 */
export class Built {
    private readonly ops: Patch = [];
    private title = "Untitled";
    private whole: ArtifactContent | null = null;
    private format = "deck";
    private theme = "studio";

    constructor(seed: { format?: string; theme?: string }) {
        this.format = seed.format ?? "deck";
        this.theme = seed.theme ?? "studio";
    }

    /** Content handed over whole, rather than streamed: a direct create instead of a generation. */
    seed(content: { sections?: unknown[] }, title?: string): void {
        if (title) this.title = title;
        this.whole = content as ArtifactContent;
    }

    watch = (event: TurnEvent): void => {
        if (event.type === "patch") this.ops.push(...event.ops);
        // the plan names the piece before any section exists, which is where the title comes from
        else if (event.type === "plan" && event.title) this.title = event.title;
    };

    get named(): string {
        return this.title;
    }

    content(): ArtifactContent {
        if (this.whole) return this.whole;
        return applyPatch({ format: this.format, theme: this.theme, sections: [] }, this.ops);
    }
}

/** Store a freshly built piece, returning the id an external caller then refers to it by. */
export async function commitNew(
    workspaceId: string,
    userId: string,
    built: Built,
): Promise<string | null> {
    const content = built.content();
    return createArtifact(workspaceId, userId, {
        title: built.named,
        formatId: content.format,
        themeId: content.theme,
        draftContent: content,
    });
}
