import { register } from "@elements/spec";
import { fit, grow } from "@model/geometry";
import { composite, t } from "@elements/composite/shared";

export const featureElement = composite(
    "feature",
    "Feature",
    () => ({
        children: [
            t("Fast by default", "h3"),
            t("Sub-second layout keeps editing fluid at any size.", "body"),
        ],
    }),
    (_d, _ctx, kids) => ({ w: grow(), h: fit(), direction: "col", gap: 10, children: kids }),
);
register(featureElement);
