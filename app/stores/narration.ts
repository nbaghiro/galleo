// The narration spend gate: recording is real credit spend and the player warms a whole piece on
// open, so the first synthesis of a piece asks once, priced from what is not yet recorded.
// Declining plays only what exists; a 402 walls the same way, with the error modal carrying the
// remedies. One gate serves every surface that can trigger recording, so no entry point spends
// silently.
import { createSignal } from "solid-js";
import type { ArtifactContent } from "@model/artifact";
import type { NarrationTrack } from "@model/speech";
import { estimateCost } from "@model/tools";
import { api, ApiError } from "@app/api";
import { reportError } from "./errors";

export interface NarrationAsk {
    credits: number;
    resolve: (go: boolean) => void;
}

const [narrationAsk, setNarrationAsk] = createSignal<NarrationAsk | null>(null);
export { narrationAsk };

export interface NarrationGate {
    ensure: (sectionId: string) => Promise<NarrationTrack | null>;
}

/**
 * Wrap a surface's record call behind the one-time confirm. The decision is keyed to the artifact:
 * a navigation to another piece asks again rather than inheriting the first piece's approval,
 * decline, or wall.
 */
export function narrationGate(opts: {
    artifactId: () => string;
    content: () => ArtifactContent;
    // the editor writes missing scripts on demand, so unscripted sections still cost (the server
    // floors every section at one unit); present-only surfaces skip them
    countUnscripted: boolean;
    record: (sectionId: string) => Promise<NarrationTrack | null>;
}): NarrationGate {
    let keyedTo: string | null = null;
    let approval: Promise<boolean> | null = null;
    let walled = false;

    // mirrors the per-section reserve in services/api/narration.ts: each unrecorded section bills
    // max(1, ceil(chars / 1000)), so the quote sums per-section ceils rather than pooling
    const pendingUnits = async (): Promise<number> => {
        const manifest = await api.narrationManifest(opts.artifactId()).catch(() => null);
        const recorded = new Set(manifest?.tracks.map((t) => t.sectionId) ?? []);
        let units = 0;
        for (const s of opts.content().sections) {
            if (recorded.has(s.id)) continue;
            const chars = s.notes?.spoken.trim().length ?? 0;
            if (chars > 0) units += Math.max(1, Math.ceil(chars / 1000));
            else if (opts.countUnscripted) units += 1;
        }
        return units;
    };

    const approve = (): Promise<boolean> => {
        approval ??= (async () => {
            const units = await pendingUnits();
            if (units === 0) return true; // everything is recorded; replaying is free
            const credits = estimateCost("narrate-artifact", { speechUnits: units });
            const go = await new Promise<boolean>((resolve) =>
                setNarrationAsk({ credits, resolve }),
            );
            setNarrationAsk(null);
            return go;
        })();
        return approval;
    };

    return {
        ensure: async (sectionId) => {
            if (keyedTo !== opts.artifactId()) {
                keyedTo = opts.artifactId();
                approval = null;
                walled = false;
            }
            if (walled) return null;
            if (!(await approve())) {
                walled = true;
                return null;
            }
            try {
                return await opts.record(sectionId);
            } catch (e) {
                if (e instanceof ApiError && e.status === 402) {
                    walled = true;
                    reportError(e, "Narrating this piece");
                    return null;
                }
                throw e;
            }
        },
    };
}
