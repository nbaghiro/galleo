import { register } from "@elements/spec";
import { fit } from "@model/geometry";
import { composite, t, avatar } from "@elements/composite/shared";

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
);
register(profileElement);
