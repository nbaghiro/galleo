import type { ArtifactContent } from "@model/artifact";
import type { Component } from "solid-js";
import { createResource, Show } from "solid-js";
import { useNavigate, useParams } from "@solidjs/router";
import { Present } from "@present/Present";
import { api } from "../data/api";

// The /present/:id route — fetches the artifact and hands its content to the standalone present surface.
// Exit (Esc / the close button) returns to the editor.
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
                <Present
                    artifact={a().draftContent as ArtifactContent}
                    onExit={() => navigate(`/edit/${params.id}`)}
                />
            )}
        </Show>
    );
};
