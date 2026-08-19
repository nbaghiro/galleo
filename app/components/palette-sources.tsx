import type { SearchHit } from "@model/artifact";
import { registerPaletteSource, type Row } from "@ui/palette-model";
import { rankItems } from "@ui/fuzzy";
import { folders } from "@app/stores/folders";
import { artifacts } from "@app/stores/library";
import { relativeTime } from "@ui/time";
import { ensureLibrary } from "@app/stores/library";
import { openGenerate } from "@app/stores/generate";
import { modelPickerReady, openModelPicker } from "./ModelPicker";
import { modelRuns, stepSummary } from "@app/stores/model-usage";
import { go } from "@app/stores/navigate";
import {
    fetchHits,
    hitMeta,
    hitSubtitle,
    localHits,
    reconcile,
    SEARCH_LIMIT,
} from "@app/stores/search";
import { ArtifactThumb } from "./previews";

// registered as palette sources, so @ui keeps knowing nothing about artifacts

const ARTIFACTS = { id: "artifacts", label: "Artifacts", order: 10 };
const FOLDERS = { id: "folders", label: "Folders", order: 20 };
const ACTIONS = { id: "actions", label: "Actions", order: 30 };

const artifactRow = (hit: SearchHit): Row => ({
    id: `artifact:${hit.id}`,
    title: hit.title || "Untitled",
    subtitle: hitSubtitle(hit),
    meta: hitMeta(hit),
    snippet: hit.snippet ?? null,
    thumb: () => <ArtifactThumb cover={hit.cover} />,
    run: () => go(`/edit/${hit.id}`), // the editor records the visit on open
    altRun: () => {
        window.open(`/edit/${hit.id}`, "_blank", "noopener");
    },
    altLabel: "open in a new tab",
});

// shown when the server had more than we render, so the full result set stays one keystroke away
const showAllRow = (query: string): Row => ({
    id: "artifact:show-all",
    title: `Show all results for “${query}”`,
    icon: "search",
    run: () => go(`/?q=${encodeURIComponent(query)}`),
});

const toRows = (hits: SearchHit[], query: string): Row[] => {
    const rows = hits.slice(0, SEARCH_LIMIT).map(artifactRow);
    if (query && hits.length > SEARCH_LIMIT) rows.push(showAllRow(query));
    return rows;
};

registerPaletteSource({
    id: "artifacts",
    section: ARTIFACTS,
    minQuery: 0, // an empty query is the recents landing state, so the server answers that too
    local: (query) => toRows(localHits(query), ""),
    remote: async (query, _ctx, signal) => {
        void ensureLibrary(); // opened from the editor, the local pass has nothing to rank yet
        return toRows(reconcile(await fetchHits(query, signal)), query);
    },
});

registerPaletteSource({
    id: "folders",
    section: FOLDERS,
    local: (query) =>
        query
            ? rankItems(query, folders(), (f) => f.name)
                  .slice(0, 4)
                  .map((f) => ({
                      id: `folder:${f.id}`,
                      title: f.name,
                      icon: "folder",
                      run: () => go(`/folder/${f.id}`),
                  }))
            : [],
});

// a query with no match is still a starting point: hand it to the generator
registerPaletteSource({
    id: "actions",
    section: ACTIONS,
    local: (query) => {
        const rows: Row[] = [];
        if (query.length >= 3)
            rows.push({
                id: "action:generate",
                title: `Generate an artifact about “${query}”`,
                icon: "sparkle",
                run: () => openGenerate(query),
            });
        return rows;
    },
});

const MODELS = { id: "models", label: "Model runs", order: 40 };

// Each past run as an artifact row: same thumb and shape as a search hit, with the per-step models
// where the snippet would be. Debug-only, so it waits for the query rather than sitting in recents.
registerPaletteSource({
    id: "models",
    section: MODELS,
    when: () => modelPickerReady(),
    local: (query) => {
        if (!/^\/?mod/i.test(query)) return [];
        void ensureLibrary(); // opened from the editor, the titles and covers are not loaded yet
        return modelRuns().map((run) => {
            const art = run.artifactId
                ? artifacts().find((a) => a.id === run.artifactId)
                : undefined;
            return {
                id: `models:${run.id}`,
                title: art?.title || run.label || "Untitled run",
                subtitle: stepSummary(run) || "no steps recorded",
                meta: relativeTime(new Date(run.at).toISOString()),
                thumb: () => <ArtifactThumb cover={art?.cover} />,
                run: () => (art ? go(`/edit/${art.id}`) : openModelPicker()),
            };
        });
    },
});
