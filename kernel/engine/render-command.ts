import type { FillLeaf, ImageLeaf, Rect, SurfaceLeaf, TextLeaf } from "@engine/node";

export type RenderCommand =
    | { kind: "rect"; box: Rect; fill?: FillLeaf }
    | { kind: "text"; box: Rect; text: TextLeaf }
    | { kind: "image"; box: Rect; image: ImageLeaf }
    | { kind: "surface"; box: Rect; paint: SurfaceLeaf["paint"] };

// Interaction geometry: the final box of every node that carries an id (sections, cells, elements).
// Separate from paint so selection/hit-testing/overlays don't depend on what was drawn.
export interface Region {
    id: string;
    box: Rect;
}
