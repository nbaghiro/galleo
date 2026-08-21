import { MockLanguageModelV4, convertArrayToReadableStream } from "ai/test";

// GALLEO_FAKE_AI=1: the real pipeline (turn protocol, SSE, reducers, credit gate) runs with
// canned model answers. Scenarios key off the prompts the pipeline itself writes, so an e2e spec
// picks behavior by typing what a user would type. See .docs/e2e-implementation-plan.md.

export const fakeAiActive = (): boolean => process.env.GALLEO_FAKE_AI === "1";

const USAGE = {
    inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 },
    outputTokens: { total: 0, text: 0, reasoning: 0 },
} as const;

interface PromptPart {
    type?: string;
    text?: string;
}
interface PromptMsg {
    role: string;
    content: string | PromptPart[];
}

const msgText = (m: PromptMsg): string =>
    typeof m.content === "string"
        ? m.content
        : m.content.map((p) => ("text" in p ? (p.text ?? "") : "")).join("\n");

const flat = (prompt: unknown): string => (prompt as PromptMsg[]).map(msgText).join("\n");

const lastUser = (prompt: unknown): string => {
    const users = (prompt as PromptMsg[]).filter((m) => m.role === "user");
    return users.length ? msgText(users[users.length - 1]!) : "";
};

const hasToolResults = (prompt: unknown): boolean =>
    (prompt as PromptMsg[]).some((m) => m.role === "tool");

const sectionJson = (id: string, texts: string[]): string =>
    JSON.stringify({
        id,
        root: {
            type: "container",
            data: {
                direction: "col",
                children: texts.map((t, i) => ({
                    type: "text",
                    data: { text: t, style: i === 0 ? "h2" : "body" },
                })),
            },
        },
    });

const beat = (id: string, label: string, role: string): Record<string, unknown> => ({
    id,
    label,
    role,
    layout: "full",
    blocks: ["text"],
    brief: `the ${label.toLowerCase()} beat, scripted`,
    takeaway: `the reader leaves with the scripted ${label.toLowerCase()} point`,
    points: ["make the scripted move", "land the scripted point"],
});

function completion(p: string): string {
    const idM = /section as JSON with id "([^"]+)"|Write section "([^"]+)"/.exec(p);
    if (idM) {
        const id = idM[1] ?? idM[2]!;
        if (/Copy inventory: reuse verbatim/.test(p)) {
            // a re-layout reuses the inventory the prompt lists, so copy survives verbatim
            const texts = [...p.matchAll(/^- "((?:[^"\\]|\\.)*)"$/gm)].map(
                (m) => JSON.parse(`"${m[1]}"`) as string,
            );
            return sectionJson(id, texts.length ? texts : ["Scripted copy"]);
        }
        return sectionJson(id, [`Scripted ${id} headline`, "Scripted supporting body copy."]);
    }
    if (/Plan the artifact/.test(p))
        return JSON.stringify({
            title: "Scripted piece",
            backdrop: "a scripted grey harbor at dusk, soft fog",
            beats: [beat("s1", "Open", "scene"), beat("s2", "Close", "close")],
        });
    if (/Plan the one section/.test(p)) {
        const { id: _id, ...plan } = beat("sX", "Scripted beat", "proof");
        return JSON.stringify(plan);
    }
    if (/section ideas/.test(p))
        return JSON.stringify({
            suggestions: [
                "Add a scripted proof section",
                "Compare the scripted tiers in a table",
                "Close with a scripted call to action",
            ],
        });
    return "Scripted reply.";
}

// the spec result/part types, reached through the mock class since @ai-sdk/provider is not a
// direct dependency under pnpm's strict layout
type DoGenerate = NonNullable<InstanceType<typeof MockLanguageModelV4>["doGenerate"]>;
type DoStream = NonNullable<InstanceType<typeof MockLanguageModelV4>["doStream"]>;
type GenResult = Awaited<ReturnType<DoGenerate>>;
type StreamResult = Awaited<ReturnType<DoStream>>;
type StreamPart = StreamResult["stream"] extends ReadableStream<infer P> ? P : never;

const textParts = (text: string): StreamResult => ({
    stream: convertArrayToReadableStream<StreamPart>([
        { type: "stream-start", warnings: [] },
        { type: "text-start", id: "t1" },
        { type: "text-delta", id: "t1", delta: text },
        { type: "text-end", id: "t1" },
        {
            type: "finish",
            finishReason: { unified: "stop" as const, raw: undefined },
            usage: USAGE,
        },
    ]),
});

function chatStream(prompt: unknown): StreamResult {
    if (hasToolResults(prompt)) return textParts("Done, the proposal card is attached.");
    const u = lastUser(prompt);
    const add = /add a section about (.+)/i.exec(u);
    const lay = /other layouts for (s[\w-]*)/i.exec(u);
    const call = add
        ? { toolName: "add-section", input: JSON.stringify({ instruction: add[1], afterId: null }) }
        : lay
          ? { toolName: "suggest-section-layouts", input: JSON.stringify({ sectionId: lay[1] }) }
          : null;
    if (!call) return textParts("Scripted reply.");
    return {
        stream: convertArrayToReadableStream<StreamPart>([
            { type: "stream-start", warnings: [] },
            {
                type: "tool-call",
                toolCallId: `fake-${call.toolName}`,
                toolName: call.toolName,
                input: call.input,
            },
            {
                type: "finish",
                finishReason: { unified: "tool-calls" as const, raw: undefined },
                usage: USAGE,
            },
        ]),
    };
}

const doGenerate: DoGenerate = async (options): Promise<GenResult> => ({
    content: [{ type: "text", text: completion(flat(options.prompt)) }],
    finishReason: { unified: "stop" as const, raw: undefined },
    usage: USAGE,
    warnings: [],
});

export function fakeModel(): InstanceType<typeof MockLanguageModelV4> {
    return new MockLanguageModelV4({
        provider: "galleo-fake",
        modelId: "scripted",
        doGenerate,
        doStream: async (options) => chatStream(options.prompt),
    });
}
