import type { ArtifactDigest } from "@model/artifact";
import { artifactDigest, artifactSearchText } from "@model/artifact";

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
    return {
        draftContent: content ?? {},
        digest: artifactDigest(content),
        searchText: artifactSearchText(content),
    };
}
