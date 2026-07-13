import { register } from "@elements/spec";
import { imageLike } from "./shared";

// exported name used by section-background helpers + tests
export const imageElement = imageLike({
    type: "image",
    label: "Image",
    kind: "photo",
    src: "https://picsum.photos/seed/galleo-image/1100/760",
    fit: "cover",
    aspect: 1.5,
});
register(imageElement);
