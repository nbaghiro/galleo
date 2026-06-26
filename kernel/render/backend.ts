import type { RenderCommand } from "@engine/render-command";

// A backend turns resolved render commands into a concrete target (DOM, canvas, PDF, ...).
export interface Backend {
    name: string;
    paint: (commands: RenderCommand[]) => void;
}
