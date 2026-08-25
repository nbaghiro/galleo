// The narration spend wall. Recording costs credits, so a refusal has to stop the piece rather than
// repeat itself: the player reaches for the next section as soon as one fails, and without this a
// walled artifact would spend the rest of the presentation retrying and reporting.
//
// There is no confirmation ahead of it. Recording used to begin by itself when a present surface
// opened, which is what a one-time ask was for; it now happens only when someone presses the button
// that says it records, and asking again after that is asking twice.
import type { NarrationTrack } from "@model/speech";
import { ApiError } from "@app/api";
import { reportError } from "./errors";

export interface NarrationGate {
    ensure: (sectionId: string) => Promise<NarrationTrack | null>;
}

/**
 * Wrap a surface's record call so one credit refusal ends it. Keyed to the artifact: moving to
 * another piece clears the wall rather than inheriting the first one's.
 */
export function narrationGate(opts: {
    artifactId: () => string;
    record: (sectionId: string) => Promise<NarrationTrack | null>;
}): NarrationGate {
    let keyedTo: string | null = null;
    let walled = false;

    return {
        ensure: async (sectionId) => {
            if (keyedTo !== opts.artifactId()) {
                keyedTo = opts.artifactId();
                walled = false;
            }
            if (walled) return null;
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
