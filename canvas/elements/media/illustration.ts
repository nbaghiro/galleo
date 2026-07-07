import { register } from "@elements/spec";
import { imageLike } from "./shared";

// Vector art / drawings — default to `contain` so artwork isn't cropped. Search via Openverse
// (category=illustration) or generate with the illustration AI style.
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
