import type { FillLeaf, ImageLeaf, Rect, SurfaceLeaf, TextLeaf } from "@engine/node";

export type RenderCommand =
    | { kind: "rect"; box: Rect; fill?: FillLeaf }
    | { kind: "text"; box: Rect; text: TextLeaf }
    | { kind: "image"; box: Rect; image: ImageLeaf }
    | { kind: "surface"; box: Rect; paint: SurfaceLeaf["paint"] };
