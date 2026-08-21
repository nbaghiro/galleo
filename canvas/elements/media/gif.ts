import { register } from "@elements/spec";
import { imageLike } from "./shared";

register(
    imageLike({
        type: "gif",
        label: "GIF",
        kind: "gif",
        src: "", // an inserted element is an empty frame until something is picked
        fit: "cover",
        aspect: 1.5,
    }),
);
