import type { FillLeaf, ImageLeaf, Rect, SurfaceLeaf, TextLeaf } from "@engine/node";

export type RenderCommand =
    | { kind: "rect"; box: Rect; fill?: FillLeaf; id?: string }
    | { kind: "text"; box: Rect; text: TextLeaf; id?: string }
    | { kind: "image"; box: Rect; image: ImageLeaf; id?: string }
    | { kind: "surface"; box: Rect; paint: SurfaceLeaf["paint"]; id?: string };

// Interaction geometry: the final box of every node that carries an id (sections, cells, elements).
// Separate from paint so selection/hit-testing/overlays don't depend on what was drawn.
export interface Region {
    id: string;
    box: Rect;
}
