import type { Artifact } from "@model/artifact";
import { asContent } from "@model/artifact";
import type { Component } from "solid-js";
import { createResource, Show } from "solid-js";
import { useNavigate, useParams } from "@solidjs/router";
import { setArtifactMusic } from "@elements/ops";
import type { SoundtrackSource } from "@ui/narration";

import { PresentSurface } from "@ui/present";
import { canEditHere } from "@ui/viewport";
import { api } from "@app/api";
import { can } from "@app/stores/features";
import { narrationGate } from "@app/stores/narration";

/** Absent access means the caller reached this through their own workspace, so they own it. */
const canWrite = (a: () => Artifact): boolean => (a().access ?? "edit") === "edit";

/**
 * No source means no control, which is how the parked music feature stays invisible without any of
 * it being deleted: `backgroundMusic` is `status: "planned"`, so `can()` is false for everyone until
 * there are beds to serve. `enable` is the on-ramp and only goes to someone who may edit the piece.
 */
const bedSource = (a: () => Artifact): SoundtrackSource | undefined => {
    if (!can("backgroundMusic")) return undefined;
    if (!canEditHere() || !canWrite(a)) return { load: () => api.soundtrack(a().id) };
    return {
        load: () => api.soundtrack(a().id),
        shelf: () => api.musicShelf(),
        choose: (bedId) => api.setArtifactBed(a().id, bedId),
        composeForPiece: async () => {
            const { trackId } = await api.composeSoundtrack(a().id, { custom: true });
            return api.setArtifactBed(a().id, trackId);
        },
        enable: async () => {
            // written for this piece from its own subject, rather than the shared house preset
            const { trackId, track } = await api.composeSoundtrack(a().id, { custom: true });
            await api.saveArtifact(a().id, {
                draftContent: setArtifactMusic(asContent(a().draftContent), { on: true, trackId }),
            });
            // the bed the route just built, rather than a read that would race the write above
            return track;
        },
    };
};

export const PresentView: Component = () => {
    const params = useParams();
    const navigate = useNavigate();
    const [data] = createResource(
        () => params.id,
        (id) => api.getArtifact(id),
    );

    // one credit refusal ends the piece rather than repeating itself section by section
    const gate = narrationGate({
        artifactId: () => data()?.artifact.id ?? params.id ?? "",
        record: (sectionId) => api.narrateSection(data()!.artifact.id, sectionId),
    });

    return (
        <Show
            when={data()?.artifact}
            fallback={
                <div class="grid h-dvh place-items-center text-[13px] text-muted">Loading…</div>
            }
        >
            {(a) => (
                <>
                    <PresentSurface
                        artifact={asContent(a().draftContent)}
                        autoFullscreen={canEditHere()}
                        viewOnly={!canEditHere()}
                        overview
                        narration={{
                            load: () => api.narrationManifest(a().id),
                            // Recording spends the owner's credits, so only for someone who may edit the
                            // piece. An invited viewer plays what is there; the alternative is a warm-up
                            // loop that can only answer 403, and a control that never becomes ready.
                            ...(canWrite(a) ? { ensure: gate.ensure } : {}),
                        }}
                        soundtrack={bedSource(a)}
                        // the caller reached this through the workspace, so the notes are theirs to read
                        notes
                        // exiting to /edit would bounce straight back here, since that route redirects
                        // to preview on a phone
                        onExit={() => navigate(canEditHere() ? `/edit/${params.id}` : "/")}
                    />
                </>
            )}
        </Show>
    );
};
