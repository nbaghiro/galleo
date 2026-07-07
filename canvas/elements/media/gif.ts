import { register } from "@elements/spec";
import { imageLike } from "./shared";

// Animated GIFs — render/animate natively; keyless search via Openverse (extension=gif).
register(
    imageLike({
        type: "gif",
        label: "GIF",
        kind: "gif",
        src: "https://upload.wikimedia.org/wikipedia/commons/2/2c/Rotating_earth_%28large%29.gif",
        fit: "cover",
        aspect: 1.5,
    }),
);
