import type { ArtifactContent } from "@model/artifact";

// A minimal starting artifact for "create new" — one empty section the user fills in the editor.
export function blankArtifact(format: string, theme = "studio"): ArtifactContent {
    return {
        format,
        theme,
        sections: [{ id: "s-1", grid: "full", cells: { a: {} } }],
    };
}
