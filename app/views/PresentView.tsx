import type { ArtifactContent } from "@model/artifact";
import type { Component } from "solid-js";
import { createResource, Show } from "solid-js";
import { useNavigate, useParams } from "@solidjs/router";
import { PresentSurface } from "@ui/present";
import { api } from "../api";

// The /present/:id route — fetches the artifact and hands its content to the shared present surface
// (@ui/present). Exit (Esc / the close button) returns to the editor.
export const PresentView: Component = () => {
    const params = useParams();
    const navigate = useNavigate();
    const [data] = createResource(
        () => params.id,
        (id) => api.getArtifact(id),
    );
    return (
        <Show
            when={data()?.artifact}
            fallback={
                <div class="grid h-screen place-items-center text-[13px] text-muted">Loading…</div>
            }
        >
            {(a) => (
                <PresentSurface
                    artifact={a().draftContent as ArtifactContent}
                    autoFullscreen
                    onExit={() => navigate(`/edit/${params.id}`)}
                />
            )}
        </Show>
    );
};
