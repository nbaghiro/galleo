import { register } from "@elements/spec";
import { imageLike } from "./shared";

// exported name used by section-background helpers + tests
export const imageElement = imageLike({
    type: "image",
    label: "Image",
    kind: "photo",
    src: "", // an inserted element is an empty frame until something is picked
    fit: "cover",
    aspect: 1.5,
});
register(imageElement);
