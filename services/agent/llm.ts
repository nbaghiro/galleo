import Anthropic from "@anthropic-ai/sdk";
import { resolveModel, type Quality, type Role } from "./models";

// Thin wrapper over the Anthropic SDK. Stages call complete()/structured() with a role; the model is
// resolved from the registry. Adaptive thinking is on; structured() constrains output to a JSON schema.
// The key is read from process.env.ANTHROPIC_API_KEY (loaded via dotenv in the API/worker entry).

let cached: Anthropic | null = null;
function client(): Anthropic {
    if (!process.env.ANTHROPIC_API_KEY) {
        throw new Error("ANTHROPIC_API_KEY is not set — add it to .env");
    }
    cached ??= new Anthropic();
    return cached;
}

type Effort = "low" | "medium" | "high";

export interface CallOpts {
    role: Role;
    quality?: Quality;
    system?: string;
    user: string;
    maxTokens?: number;
    effort?: Effort;
}

const textOf = (blocks: Anthropic.ContentBlock[]): string =>
    blocks.map((b) => (b.type === "text" ? b.text : "")).join("");

// Plain text completion.
export async function complete(opts: CallOpts): Promise<string> {
    const msg = await client().messages.create({
        model: resolveModel(opts.role, { quality: opts.quality }),
        max_tokens: opts.maxTokens ?? 4096,
        thinking: { type: "adaptive" },
        ...(opts.effort ? { output_config: { effort: opts.effort } } : {}),
        ...(opts.system ? { system: opts.system } : {}),
        messages: [{ role: "user", content: opts.user }],
    });
    return textOf(msg.content);
}

// JSON output constrained to `schema` (a JSON Schema) — the staged IR comes back already shaped.
export async function structured<T>(
    opts: CallOpts & { schema: Record<string, unknown> },
): Promise<T> {
    const msg = await client().messages.create({
        model: resolveModel(opts.role, { quality: opts.quality }),
        max_tokens: opts.maxTokens ?? 4096,
        thinking: { type: "adaptive" },
        output_config: {
            format: { type: "json_schema", schema: opts.schema },
            ...(opts.effort ? { effort: opts.effort } : {}),
        },
        ...(opts.system ? { system: opts.system } : {}),
        messages: [{ role: "user", content: opts.user }],
    });
    return JSON.parse(textOf(msg.content)) as T;
}
