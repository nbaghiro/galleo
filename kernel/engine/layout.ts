import type { EngineNode, Rect } from "@engine/node";
import type { RenderCommand } from "@engine/render-command";

// Resolve a node tree into absolute-positioned render commands within a container rect.
export function layout(_node: EngineNode, _container: Rect): RenderCommand[] {
    throw new Error("engine layout is not implemented yet");
}
