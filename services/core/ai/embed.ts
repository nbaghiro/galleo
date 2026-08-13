import { embedMany } from "ai";
import { googleEmbedding } from "./provider";
import { recordUsd } from "./meter";

// One embedding contract for every retrievable text. The dimension is baked into the chunks
// table's vector column, so changing it means a re-embed migration — not a config flip.
const EMBED_DIMS = 768;
const EMBED_MODEL = "gemini-embedding-001";
// provider list price per 1M input tokens; reported via recordUsd since the model registry only
// prices language models
const USD_PER_1M_TOKENS = 0.15;
const BATCH = 100;

type EmbedTask = "doc" | "query";

// asymmetric retrieval embeddings: documents and queries are embedded with their own task types
const TASK: Record<EmbedTask, string> = { doc: "RETRIEVAL_DOCUMENT", query: "RETRIEVAL_QUERY" };

export type Embedder = (texts: string[], task: EmbedTask) => Promise<number[][]>;

export const embedTexts: Embedder = async (texts, task) => {
    if (!texts.length) return [];
    const model = googleEmbedding(EMBED_MODEL);
    const out: number[][] = [];
    for (let i = 0; i < texts.length; i += BATCH) {
        const { embeddings, usage } = await embedMany({
            model,
            values: texts.slice(i, i + BATCH),
            providerOptions: {
                google: { outputDimensionality: EMBED_DIMS, taskType: TASK[task] },
            },
        });
        recordUsd(((usage?.tokens ?? 0) / 1e6) * USD_PER_1M_TOKENS);
        out.push(...embeddings);
    }
    return out;
};
