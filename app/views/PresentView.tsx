import { asContent } from "@model/artifact";
import type { Component } from "solid-js";
import { createResource, Show } from "solid-js";
import { useNavigate, useParams } from "@solidjs/router";
import { PresentSurface } from "@ui/present";
import { canEditHere } from "@ui/viewport";
import { api } from "@app/api";

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
                <div class="grid h-dvh place-items-center text-[13px] text-muted">Loading…</div>
            }
        >
            {(a) => (
                <PresentSurface
                    artifact={asContent(a().draftContent)}
                    autoFullscreen={canEditHere()}
                    viewOnly={!canEditHere()}
                    // exiting to /edit would bounce straight back here, since that route redirects
                    // to preview on a phone
                    onExit={() => navigate(canEditHere() ? `/edit/${params.id}` : "/")}
                />
            )}
        </Show>
    );
};
