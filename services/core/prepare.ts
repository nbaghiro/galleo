import { eq } from "drizzle-orm";
import type { ArtifactContent, Section, SectionOp } from "@model/artifact";
import { asContent, needsScript, unscripted } from "@model/artifact";
import { featuresFor } from "@model/billing";
import { estimateCost } from "@model/tools";
import { db } from "@services/db/client";
import { schema } from "@services/db/schema";
import { applyContentOps } from "@services/core/artifacts";
import type { WrittenNotes } from "@services/core/ai/tools/notes";
import { runTool } from "@services/core/ai/execute";
import { aiReady } from "@services/core/ai/provider";
import { speechReady } from "@services/core/ai/speech";
import { musicReady } from "@services/core/ai/music";
import { DEFAULT_MS } from "@services/core/ai/music";
import { pruneOrphans, spokenOf, unitsFor } from "@services/core/narration";
import type { Composed, Narrated } from "@services/core/ai/tools/audio";
import { bedMinutes } from "@services/core/soundtrack";
import { pricesFor } from "@services/core/spend";
import { warn } from "@services/utils/env";

/**
 * Having a piece ready to speak before anyone asks it to.
 *
 * Narrating a cold artifact is a script the model has to write and audio a provider has to render,
 * which measured together is about five seconds before the first word. Doing that when someone
 * presses play puts the whole wait where it is least wanted, so this does it behind a request that
 * has already been answered.
 *
 * Deliberately not a queue. It is triggered when an artifact is opened, and everything it does is
 * keyed on what is missing, so opening a prepared piece is two indexed reads that find nothing to
 * do. It used to run on every save as well, which narrated a piece once per edit and spent more on
 * pieces nobody presented than the whole of generation; an open is the moment someone is about to
 * read or present, so that is the one this listens to.
 *
 * **Narration follows the content; the bed does not.** A script IS the words, so a section whose
 * copy changed has a script that is now wrong, and every such section is rewritten in one pass so
 * they still read as one piece rather than as a patch dropped into someone else's argument. A bed
 * is a mood: its prompt comes from the opening lines, so chasing edits would recompose a whole
 * piece of music because slide nine gained a comma. It is composed once and left alone.
 *
 * What that costs is bounded by the fingerprint: only sections whose own words moved are rewritten,
 * only rewritten sections re-record (the narration hash is over the spoken text), and an artifact
 * nobody touched finds nothing to do.
 */

/** At most this many artifacts in flight per process, so preparation cannot crowd out real work. */
const MAX_CONCURRENT = 2;
const preparing = new Set<string>();
// An open arrives in pairs (the editor, then present) and the read it rode in on should answer
// first, so a pass starts a moment later and one pass covers the pair.
const QUIET_MS = 2_000;
const pending = new Map<string, ReturnType<typeof setTimeout>>();
// A workspace that could not pay is not asked again for a while: the refusal is the same on the
// next save, and each attempt is a hold, a trace and an analytics event for nothing.
const REFUSED_FOR_MS = 10 * 60_000;
const refusedAt = new Map<string, number>();
export const noteRefusal = (workspaceId: string): void => {
    refusedAt.set(workspaceId, Date.now());
};
const refusedRecently = (workspaceId: string): boolean =>
    Date.now() - (refusedAt.get(workspaceId) ?? 0) < REFUSED_FOR_MS;

/**
 * Whether the workspace can pay for the first thing a pass would ask for. Checked before the pass
 * starts rather than left to the hold, since a refused hold is still a trace and an event.
 */
export function affordable(
    ws: { aiCreditsBalance: number } & Parameters<typeof pricesFor>[0],
): boolean {
    return (
        ws.aiCreditsBalance >=
        estimateCost("write-speaker-notes", { sections: 1 }, pricesFor(ws, {}))
    );
}

/**
 * Sections worth spending on: no script yet, or one written for copy that has since changed.
 * `needsScript` never reports a script a person wrote, whatever happened to the words around it.
 */
const worthWriting = (s: Section): boolean => needsScript(s) && !!s.root;

/** Sections this may rewrite at all: never a script a person wrote. */
const ours = (s: Section): boolean => !!s.root && s.notes?.source !== "human";

export interface PrepareTarget {
    artifactId: string;
    workspaceId: string;
}

/**
 * Start preparing, and return. Callers are request handlers that have already sent their response,
 * so this must never reject and never be awaited.
 */
export function prepareInBackground(target: PrepareTarget): void {
    if (refusedRecently(target.workspaceId)) return;
    clearTimeout(pending.get(target.artifactId));
    pending.set(
        target.artifactId,
        setTimeout(() => {
            pending.delete(target.artifactId);
            start(target);
        }, QUIET_MS),
    );
}

function start(target: PrepareTarget): void {
    if (preparing.size >= MAX_CONCURRENT || preparing.has(target.artifactId)) return;
    preparing.add(target.artifactId);
    void prepare(target)
        .catch((e: unknown) => {
            // there is no one to tell: the request this rode in on is long gone, and the next
            // trigger will try again from whatever did land
            warn(`prepare ${target.artifactId}: ${e instanceof Error ? e.message : "failed"}`);
        })
        .finally(() => preparing.delete(target.artifactId));
}

/** Exported for its tests; `prepareInBackground` is how the rest of the server reaches it. */
export async function prepare({ artifactId, workspaceId }: PrepareTarget): Promise<void> {
    const ws = await workspaceFor(workspaceId);
    if (!ws?.prepareAudio) return; // off unless the workspace asked for it
    if (!affordable(ws)) {
        noteRefusal(workspaceId);
        return;
    }
    const features = featuresFor(ws);

    const [row] = await db
        .select({ content: schema.artifacts.draftContent, createdBy: schema.artifacts.createdBy })
        .from(schema.artifacts)
        .where(eq(schema.artifacts.id, artifactId));
    if (!row?.createdBy) return; // nobody to bill it to
    const spender = row.createdBy;

    let content = asContent(row.content);
    if (!content.sections.length) return;

    if (features.voiceNarration && speechReady()) {
        if (aiReady()) content = await fillScripts(artifactId, workspaceId, ws, spender, content);
        // audio for sections that are no longer here, and for scripts since rewritten
        await pruneOrphans(artifactId, content).catch(() => 0);
        await recordSections(artifactId, workspaceId, ws, spender, content);
    }

    if (features.backgroundMusic && musicReady() && !content.music?.trackId)
        await composeBed(artifactId, workspaceId, ws, spender, content);
}

/**
 * Composed, but left unattached: turning music on is the artifact's choice, not this one's. The bed
 * is cached on (artifact, prompt), so the press that does turn it on hits it and pays zero.
 *
 * Billed like everything else here. Composing without a reservation made background music free and
 * invisible: it never reached the ledger, so a prepared piece showed its narration and nothing for
 * the music beside it, and a workspace out of credits still got beds.
 */
async function composeBed(
    artifactId: string,
    workspaceId: string,
    ws: typeof schema.workspaces.$inferSelect,
    spender: string,
    content: ArtifactContent,
): Promise<void> {
    const out = await runTool<Composed>(
        {
            id: "compose-soundtrack",
            surface: "direct",
            input: { custom: true, lengthMs: DEFAULT_MS },
        },
        { userId: spender, ws, role: "member" },
        {
            ctx: { image: {}, artifact: content, artifactId },
            size: { musicMinutes: 1 },
            // a bed this deployment already had reports zero, so a second pass owes nothing
            produced: (r) => ({ music: bedMinutes((r as Composed | undefined)?.ms) }),
        },
    ).catch((e: unknown) => {
        warn(`prepare bed ${artifactId}: ${e instanceof Error ? e.message : "failed"}`);
        return null;
    });
    if (out && !out.ok) {
        if (out.reason === "credits") noteRefusal(workspaceId);
        else warn(`prepare bed ${artifactId}: ${out.reason}`);
    }
}

const workspaceFor = async (
    id: string,
): Promise<(typeof schema.workspaces.$inferSelect & { prepareAudio: boolean }) | undefined> => {
    const [ws] = await db.select().from(schema.workspaces).where(eq(schema.workspaces.id, id));
    return ws;
};

/**
 * Write every script that is missing or out of date, in **one pass**: the model is shown the whole
 * current piece and answers for all of them together, so a rewritten section still belongs to the
 * argument its neighbours are making. Writing them one at a time would cost the same and read like
 * a patch.
 *
 * The result goes back through the ops path rather than as a whole-tree write: a section edited
 * while the model was thinking keeps the edit, and one deleted meanwhile is simply not there to set.
 */
async function fillScripts(
    artifactId: string,
    workspaceId: string,
    ws: typeof schema.workspaces.$inferSelect,
    spender: string,
    content: ArtifactContent,
): Promise<ArtifactContent> {
    const moved = content.sections.filter(worthWriting);
    if (!moved.length) return content;

    /**
     * A piece that gained a beat has a different story, not just a different sentence, so the
     * scripts around the new one are rewritten with it: a deck where slide six was inserted should
     * not have slide five still handing over to what used to follow it.
     *
     * Sections a person wrote are never in this set, whatever moved around them.
     */
    const restructured = moved.some(unscripted);
    const targets = (restructured ? content.sections.filter(ours) : moved).map((s) => s.id);

    // Through the executor rather than reserving here: `write-speaker-notes` has a registered body,
    // so routing it keeps one tool costing and validating the same however it was reached. runTool
    // does the reservation itself, at the same size, rates, role and surface this used to pass.
    const out = await runTool<WrittenNotes[]>(
        { id: "write-speaker-notes", surface: "direct", input: { sectionIds: targets } },
        { userId: spender, ws, role: "member" },
        { ctx: { image: {}, artifact: content }, size: { sections: targets.length } },
    );
    // Out of credits, or a body that threw: either way the piece stays unprepared, which is not an
    // error anyone asked about. Nothing was billed for a run that produced no notes.
    if (!out.ok) {
        if (out.reason === "credits") noteRefusal(workspaceId);
        else warn(`prepare notes ${artifactId}: ${out.reason}`);
        return content;
    }
    const written = out.result;
    if (!written.length) return content;

    const ops: SectionOp[] = [];
    for (const w of written) {
        const at = content.sections.find((s) => s.id === w.sectionId);
        if (at) ops.push({ kind: "set", section: { ...at, notes: w.notes } });
    }
    if (!ops.length) return content;
    const patch = await applyContentOps(workspaceId, artifactId, ops, {});
    if (patch.status !== 200) return content;

    return {
        ...content,
        sections: content.sections.map((s) => {
            const w = written.find((n) => n.sectionId === s.id);
            return w ? { ...s, notes: w.notes } : s;
        }),
    };
}

/** Record every scripted section that has no audio, one at a time so a long piece stays polite. */
async function recordSections(
    artifactId: string,
    workspaceId: string,
    ws: typeof schema.workspaces.$inferSelect,
    spender: string,
    content: ArtifactContent,
): Promise<void> {
    for (const section of content.sections) {
        const chars = spokenOf(section).length;
        if (!chars) continue;

        const out = await runTool<Narrated>(
            { id: "narrate-artifact", surface: "direct", input: { sectionIds: [section.id] } },
            { userId: spender, ws, role: "member" },
            {
                ctx: { image: {}, artifact: content, artifactId },
                size: { speechUnits: Math.max(1, unitsFor(chars)) },
                produced: (r) => ({ speech: unitsFor((r as Narrated | undefined)?.chars ?? 0) }),
            },
        ).catch((e: unknown) => {
            warn(`prepare voice ${artifactId}: ${e instanceof Error ? e.message : "failed"}`);
            return null;
        });
        if (out && !out.ok) {
            // the wall is for the whole piece, not this section
            if (out.reason === "credits") noteRefusal(workspaceId);
            return;
        }
        if (!out) return; // a provider that refused once will refuse the next section too
    }
}
