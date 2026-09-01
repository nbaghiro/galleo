import { Hono } from "hono";
import type { WorkspaceEnv } from "./middleware";
import { requireWorkspace } from "./middleware";
import { onboardingState } from "@services/core/onboarding";

// The first session's state. Read-only: the two things onboarding stores are written through
// PATCH /me/prefs like any other preference, and the four checklist steps are derived from rows, so
// there is nothing here to write.
export const onboarding = new Hono<WorkspaceEnv>();

onboarding.get("/onboarding", requireWorkspace, async (c) => {
    return c.json({ onboarding: await onboardingState(c.get("ws").id, c.get("user").prefs) });
});
