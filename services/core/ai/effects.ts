import type { PatchOp } from "@model/ai";
import { applyContentOps, toSectionOps } from "@model/ai";
import type { ArtifactContent } from "@model/artifact";
import {
    applyContentOps as writeOps,
    createArtifact,
    isArtifactContent,
    readArtifact,
    updateArtifact,
} from "@services/core/artifacts";
import { openRoom } from "@services/core/collab";

// Taking effect, for a caller with no client to apply a result. Everything the in-app surfaces do
// through the browser happens here instead: load the artifact, run the tool against it, turn its
// result into a patch through the registry's own mapper, and write it back as the ops the REST
// route writes, so `digest`, `search_text`, media adoption, `seq` and the room all follow.

interface EffectTarget {
    workspaceId: string;
    artifactId: string;
}

export async function loadContent(t: EffectTarget): Promise<ArtifactContent | null> {
    const row = await readArtifact(t.workspaceId, t.artifactId);
    const draft = row?.draftContent;
    return isArtifactContent(draft) ? draft : null;
}

/**
 * Land a tool's patch on a stored artifact. The patch is written as the section ops the REST route
 * writes and the room speaks, through the same transaction, so `digest`, `search_text`, media
 * adoption and `seq` follow, and everyone editing live sees the ops land rather than a resync.
 * Null when the stored document moved out from under the patch (a section it names is gone), which
 * the caller treats as a conflict rather than overwriting what someone else did.
 */
export async function commitPatch(
    t: EffectTarget,
    before: ArtifactContent,
    ops: PatchOp[],
    title?: string,
): Promise<{ content: ArtifactContent; seq: number } | null> {
    const content = applyContentOps(before, ops);
    const sectionOps = toSectionOps(before, ops);
    const written = sectionOps.length
        ? await writeOps(t.workspaceId, t.artifactId, sectionOps, {})
        : null;
    if (written && written.status !== 200) return null;
    if (written) openRoom(t.artifactId)?.publish(written.seq, { kind: "ai" }, sectionOps);
    if (title?.trim()) await updateArtifact(t.workspaceId, t.artifactId, { title: title.trim() });
    const seq = written?.seq ?? (await readArtifact(t.workspaceId, t.artifactId))?.seq ?? 0;
    return { content, seq };
}

/**
 * Content handed over whole by a caller with no browser: a direct create rather than a generation,
 * which makes its own draft. Kept as a class so the seed and the commit share one shape.
 */
export class Built {
    private title = "Untitled";
    private whole: ArtifactContent | null = null;
    private format = "deck";
    private theme = "studio";

    constructor(seed: { format?: string; theme?: string }) {
        this.format = seed.format ?? "deck";
        this.theme = seed.theme ?? "studio";
    }

    seed(content: { sections?: unknown[] }, title?: string): void {
        if (title) this.title = title;
        this.whole = content as ArtifactContent;
    }

    get named(): string {
        return this.title;
    }

    content(): ArtifactContent {
        return this.whole ?? { format: this.format, theme: this.theme, sections: [] };
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
