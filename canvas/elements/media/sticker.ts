import { register } from "@elements/spec";
import { imageLike } from "./shared";

register(
    imageLike({
        type: "sticker",
        label: "Sticker",
        kind: "sticker",
        src: "https://api.dicebear.com/9.x/fun-emoji/svg?seed=galleo",
        fit: "contain",
        aspect: 1,
    }),
);
