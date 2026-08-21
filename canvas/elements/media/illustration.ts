import { register } from "@elements/spec";
import { imageLike } from "./shared";

register(
    imageLike({
        type: "illustration",
        label: "Illustration",
        kind: "illustration",
        src: "", // an inserted element is an empty frame until something is picked
        fit: "contain",
        aspect: 1.5,
    }),
);
