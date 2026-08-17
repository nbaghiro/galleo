import type { ArtifactContent } from "@model/artifact";
import { layoutSection, measureText } from "@canvas/render/commands";
import { loadImages, renderToCanvas } from "@canvas/render/backends";
import { profileFor } from "@engine/profile";
import { THEMES } from "@themes";

// Sections rendered to PNG for the visual judge. Rasterising needs the engine and a canvas, so it
// happens here for the same reason `fitChecks` does: services may not import canvas. The judge gets
// pixels rather than a description, which is the whole point — everything describable is already
// covered by a deterministic check.

const FRAME_WIDTH = 1280; // the deck profile's own width, so a shot reads in authored pixels

// Half of EXPORT_SCALE: a judge needs to see the composition, not print it, and the request body
// carries every section at once.
const SHOT_SCALE = 1;

// Beyond this the payload and the token bill both stop being reasonable; the lead is what a reader
// forms an impression from anyway.
export const MAX_SHOTS = 12;

export interface SectionShot {
    id: string;
    dataUrl: string;
}

/**
 * Render up to `MAX_SHOTS` sections. Images are awaited first, so a shot never catches a section
 * mid-load and reports a missing photograph as a design fault.
 */
export async function renderShots(content: ArtifactContent): Promise<SectionShot[]> {
    const format = profileFor(content);
    const tk = THEMES[content.theme]?.tokens ?? THEMES.studio!.tokens;
    const shots: SectionShot[] = [];

    for (const section of content.sections.slice(0, MAX_SHOTS)) {
        const { commands, height } = layoutSection(section, FRAME_WIDTH, measureText, tk, format);
        if (height < 1) continue;
        await loadImages(commands);
        const canvas = await renderToCanvas(commands, FRAME_WIDTH, height, tk.bg, SHOT_SCALE);
        shots.push({ id: section.id, dataUrl: canvas.toDataURL("image/png") });
    }
    return shots;
}
