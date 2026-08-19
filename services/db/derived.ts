import type { ArtifactContent, ArtifactDigest } from "@model/artifact";
import { artifactDigest, artifactSearchText, contentWithElementIds } from "@model/artifact";

// A tree reaching a write may have been authored anywhere: an old row, an AI turn, a client that
// never stamped. Anything shaped like content is stamped here so every stored element carries the
// id a comment anchors on; the pass is identity-preserving, so an already-stamped tree is untouched.
const stampable = (v: unknown): v is ArtifactContent => {
    if (!v || typeof v !== "object") return false;
    const { sections } = v as { sections?: unknown };
    return (
        Array.isArray(sections) &&
        sections.every(
            (s) =>
                !!s &&
                typeof s === "object" &&
                !!(s as { root?: unknown }).root &&
                typeof (s as { root?: unknown }).root === "object",
        )
    );
};

// `digest` and `search_text` are a pure function of `draft_content`, so they are derived here and
// nowhere else: a write that sets the content without them leaves library covers and the search index
// silently stale, with nothing to detect it. ESLint blocks `draftContent` in a drizzle `.values()`/
// `.set()` outside this file (no-restricted-syntax), so the columns cannot be written apart.
// `search_tsv` is a generated column over `search_text`, so Postgres keeps that leg in sync itself.
export function contentWrite(content: unknown): {
    draftContent: unknown;
    digest: ArtifactDigest;
    searchText: string;
} {
    const stamped = stampable(content) ? contentWithElementIds(content) : content;
    return {
        draftContent: stamped ?? {},
        digest: artifactDigest(stamped),
        searchText: artifactSearchText(stamped),
    };
}
