import type { EngineNode } from "@engine/node";
import { register, dot } from "@elements/spec";
import { fit } from "@model/geometry";
import { composite, t, avatar, gbar } from "@elements/composite/shared";

// --- profile: avatar + name + role, centered (a team member) ---
export const profileElement = composite(
    "profile",
    "Profile",
    () => ({
        children: [
            avatar(72),
            t("Ada Lovelace", "h3", "center"),
            t("Founder & CEO", "caption", "center"),
        ],
    }),
    (_d, _ctx, kids) => ({
        w: fit(),
        h: fit(),
        direction: "col",
        gap: 8,
        alignX: "center",
        children: kids,
    }),
    (): EngineNode => ({
        w: fit(),
        h: fit(),
        direction: "col",
        gap: 8,
        alignX: "center",
        children: [dot(72), gbar(110, 12), gbar(78, 8)],
    }),
);
register(profileElement);
