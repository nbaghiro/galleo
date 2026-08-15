import { Hono } from "hono";
import type { Template } from "@model/templates";
import { TEMPLATE_INDEX } from "@model/templates";
import { template } from "@services/core/templates";
import { templateUseCounts } from "@services/core/visits";
import { requireUser, type AuthedEnv } from "./middleware";

export const templates = new Hono<AuthedEnv>();

templates.get("/templates", requireUser, async (c) =>
    c.json({
        templates: TEMPLATE_INDEX.map((t) => template(t.id)).filter(
            (t): t is Template => t !== null,
        ),
        uses: await templateUseCounts(),
    }),
);
