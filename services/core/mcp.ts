import { z } from "zod";
import type { ToolEffect, ToolId, ToolScope } from "@model/tools";
import { isToolScope, scopeFor, TOOLS } from "@model/tools";
import { getTool, toolsFor } from "@services/core/ai/tools";
import { WIDGET_MIME, WIDGET_URI, widgetCsp, widgetHtml } from "@services/core/widget";
import { callDelegated, RENDERS } from "@services/core/delegated";
import type { AccessGrant } from "@services/core/authorization";

// The MCP protocol over JSON-RPC, kept free of hono so the transport can stay in the api layer.
// Only the methods a directory client actually calls are implemented; anything else answers
// "method not found" rather than pretending.
//
// What a token may do is the catalog's answer, not this file's: scopeFor in @model/tools resolves
// it per tool, and the executor re-checks the same thing, so a tool joining the surface declares
// its permission in the same diff rather than in a map over here that has to be remembered.

// What Galleo's own chat agent gets from a system prompt, an external client has no way to know. MCP
// hands this to the model at initialize, and without it a client reasons from tool names alone: the
// observed failure was reaching for the template list first, as a starting point to copy, which is
// not how anything here works.
const INSTRUCTIONS = `Galleo turns a brief into a finished deck, document or website. One content
tree renders as all three, so "make it a doc instead" is a re-render rather than a rewrite.

To make something new, call generate-artifact with a one-line brief. It plans an outline and writes
every section, and it is the normal way to create: do not assemble a piece section by section, and
do not start from a template unless the person asks for one. find-templates lists starter pieces and
is only for when they want to browse or begin from a named template.

Everything lives in a workspace. Most tools act on the one this connection was authorized for; pass
\`workspace\` to name another, and \`artifact\` to say which piece a change applies to. Find an
artifact by id with find-artifacts before reading or editing it.

Editing tools change the stored piece straight away, so there is nothing to save afterwards.`;

export const PROTOCOL_VERSION = "2025-06-18";

// Implementation-defined server error (JSON-RPC reserves -32000..-32099 for these). The `data`
// beside it is what the transport reads to answer with the RFC 6750 challenge a client can act on.
export const INSUFFICIENT_SCOPE = -32003;
// A call that needs an account when the client has none yet. Distinct from the scope refusal above:
// that one has a token and needs a wider grant, this one has no token at all.
export const AUTH_REQUIRED = -32004;

/** The scope a reply is asking the client to step up to, when that is what it is asking for. */
export const scopeChallengeOf = (reply: JsonRpcResponse): ToolScope | null => {
    const data = reply.error?.data as { error?: string; scope?: string } | undefined;
    if (reply.error?.code !== INSUFFICIENT_SCOPE || data?.error !== "insufficient_scope")
        return null;
    return isToolScope(data.scope) ? data.scope : null;
};

export interface JsonRpcRequest {
    jsonrpc?: string;
    id?: string | number | null;
    method?: string;
    params?: unknown;
}

export interface JsonRpcResponse {
    jsonrpc: "2.0";
    id: string | number | null;
    result?: unknown;
    error?: { code: number; message: string; data?: unknown };
}

const ok = (id: string | number | null, result: unknown): JsonRpcResponse => ({
    jsonrpc: "2.0",
    id,
    result,
});
const fail = (
    id: string | number | null,
    code: number,
    message: string,
    data?: unknown,
): JsonRpcResponse => ({ jsonrpc: "2.0", id, error: { code, message, ...(data ? { data } : {}) } });

// A tool's workspace argument belongs to this layer rather than to the catalog: the in-app surfaces
// resolve a tenant from the session, and only an external client has to name one.
const WORKSPACE_ARG = {
    type: "string",
    description:
        "which workspace to act in; omit to use the one chosen when this connection was authorized",
};

// Named the same way, and for the same reason: in the app the artifact is the document on screen,
// and an external client has to say which one it means.
const ARTIFACT_ARG = {
    type: "string",
    description: "the id of the artifact to change",
};

const HINTS: Record<ToolEffect, { readOnlyHint: boolean; destructiveHint: boolean }> = {
    read: { readOnlyHint: true, destructiveHint: false },
    write: { readOnlyHint: false, destructiveHint: false },
    destructive: { readOnlyHint: false, destructiveHint: true },
};

function describeTool(id: ToolId): Record<string, unknown> | null {
    const tool = getTool(id);
    const def = TOOLS[id];
    if (!tool || !def) return null;
    const schema = z.toJSONSchema(tool.input, { io: "input" }) as {
        properties?: Record<string, unknown>;
        [k: string]: unknown;
    };
    return {
        name: id,
        title: def.title,
        description: tool.describe,
        inputSchema: {
            ...schema,
            type: "object",
            properties: {
                ...(schema.properties ?? {}),
                workspace: WORKSPACE_ARG,
                // a tool that changes an artifact needs to be told which, unless it already asks
                ...(tool.patch && !(schema.properties ?? {}).artifactId
                    ? { artifact: ARTIFACT_ARG }
                    : {}),
            },
        },
        annotations: { title: def.title, ...HINTS[def.effect ?? "write"], openWorldHint: false },
        // The permission this one needs, so a client granted less can see what to step up to
        // rather than discovering it by being refused.
        _meta: {
            "galleo/scope": scopeFor(id),
            // A tool whose result is an artifact renders it, rather than describing it in prose.
            // `openai/outputTemplate` is the same field under ChatGPT's compatibility alias.
            ...(RENDERS.has(id)
                ? {
                      ui: { resourceUri: WIDGET_URI, ...widgetCsp() },
                      "openai/outputTemplate": WIDGET_URI,
                  }
                : {}),
        },
    };
}

export const listTools = (): Record<string, unknown>[] =>
    toolsFor("mcp")
        .map((t) => describeTool(t.id))
        .filter((t): t is Record<string, unknown> => t !== null);

export interface CallResult {
    content: { type: "text"; text: string }[];
    structuredContent?: Record<string, unknown>;
    // reaches the component and not the model; the render payload rides here for that reason
    _meta?: Record<string, unknown>;
    isError?: boolean;
}

const text = (s: string, isError = false): CallResult => ({
    content: [{ type: "text", text: s }],
    ...(isError ? { isError: true } : {}),
});

/** A call the token was not granted. The transport turns it into the 403 a client re-authorizes on. */
export interface Insufficient {
    insufficientScope: ToolScope;
}

export const isInsufficient = (v: CallOutcome): v is Insufficient => "insufficientScope" in v;

/** A call the client has no token for at all. The transport turns it into the 401 that starts OAuth. */
export interface NeedsAuth {
    needsAuth: true;
}

export type CallOutcome = CallResult | Insufficient | NeedsAuth;

export const isNeedsAuth = (v: CallOutcome): v is NeedsAuth => "needsAuth" in v;

/** True when this reply is the one the transport should answer with a 401 challenge. */
export const isAuthChallenge = (reply: JsonRpcResponse): boolean =>
    reply.error?.code === AUTH_REQUIRED;

async function callTool(grant: AccessGrant | null, params: unknown): Promise<CallOutcome> {
    const p = (params ?? {}) as { name?: string; arguments?: Record<string, unknown> };
    const id = p.name as ToolId | undefined;
    if (!id || !TOOLS[id]) return text(`There is no tool called “${String(p.name)}”.`, true);

    // The call itself is shared with the public API (core/delegated.ts). All that differs here is
    // the envelope: JSON-RPC content, the structured half a model reads, and the render payload the
    // component paints, which rides in `_meta` so the model never pays context for it.
    const out = await callDelegated({ id, surface: "mcp", input: p.arguments ?? {} }, grant);
    if (!out.ok) {
        if (out.kind === "scope") return { insufficientScope: out.needs };
        if (out.kind === "needs-auth") return { needsAuth: true };
        return text(out.message, true);
    }
    return {
        content: [{ type: "text", text: out.note ?? JSON.stringify(out.result) }],
        structuredContent: {
            ...(out.workspace ? { workspace: out.workspace } : {}),
            ...(out.artifactId ? { artifact: out.artifactId } : {}),
            result: out.result,
        },
        ...(out.rendered ? { _meta: { galleo: { content: out.rendered } } } : {}),
    };
}

export async function handleRpc(
    grant: AccessGrant | null,
    req: JsonRpcRequest,
): Promise<JsonRpcResponse | null> {
    const id = req.id ?? null;
    switch (req.method) {
        case "initialize":
            return ok(id, {
                instructions: INSTRUCTIONS,
                protocolVersion: PROTOCOL_VERSION,
                capabilities: { tools: { listChanged: false }, resources: { listChanged: false } },
                serverInfo: { name: "galleo", version: "1.0.0" },
            });
        // notifications carry no id and take no response
        case "notifications/initialized":
        case "notifications/cancelled":
            return null;
        case "ping":
            return ok(id, {});
        case "resources/list":
            return ok(id, {
                resources: [
                    {
                        uri: WIDGET_URI,
                        name: "Galleo artifact",
                        description: "A deck, document or site rendered by Galleo's own engine.",
                        mimeType: WIDGET_MIME,
                    },
                ],
            });
        case "resources/read": {
            const uri = (req.params as { uri?: string } | undefined)?.uri;
            if (uri !== WIDGET_URI) return fail(id, -32602, `Unknown resource: ${String(uri)}`);
            return ok(id, {
                contents: [{ uri: WIDGET_URI, mimeType: WIDGET_MIME, text: widgetHtml() }],
            });
        }
        case "tools/list":
            return ok(id, { tools: listTools() });
        case "tools/call": {
            // A tool body that throws is a server fault, not a protocol one, but it still has to
            // come back inside an envelope: without this it escapes the transport as a bare 500 and
            // the client sees a dead connection rather than a failed call. It matters more now that
            // a tool can write, because the throw may land after the artifact was already saved.
            try {
                const out = await callTool(grant, req.params);
                if (isNeedsAuth(out))
                    return fail(id, AUTH_REQUIRED, "Sign in to Galleo to use this tool.");
                return isInsufficient(out)
                    ? fail(id, INSUFFICIENT_SCOPE, "This connection was not granted that.", {
                          error: "insufficient_scope",
                          scope: out.insufficientScope,
                      })
                    : ok(id, out);
            } catch (e) {
                return fail(id, -32603, e instanceof Error ? e.message : "the tool failed");
            }
        }
        default:
            return fail(id, -32601, `Method not found: ${String(req.method)}`);
    }
}
