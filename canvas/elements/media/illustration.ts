import { register } from "@elements/spec";
import { imageLike } from "./shared";

register(
    imageLike({
        type: "illustration",
        label: "Illustration",
        kind: "illustration",
        src: "https://api.dicebear.com/9.x/shapes/svg?seed=galleo",
        fit: "contain",
        aspect: 1.5,
    }),
);
