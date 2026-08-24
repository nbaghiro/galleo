import { Hono } from "hono";
import type { Context } from "hono";
import { appUrl } from "@services/utils/env";
import { readJson } from "@services/utils/http";
import { z } from "zod";
import { verifyAccessToken } from "@services/core/authorization";
import { MCP_RESOURCE } from "@services/api/authorize";
import { delegatedLimiter } from "@services/api/middleware";
import { BASE_SCOPES } from "@services/core/authorization";
import { handleRpc, isAuthChallenge, scopeChallengeOf } from "@services/core/mcp";
import type { JsonRpcRequest, JsonRpcResponse } from "@services/core/mcp";

// Streamable HTTP, the transport both directories require. One POST carries one JSON-RPC message
// (or a batch); the server replies in the same response rather than opening a stream, which is a
// valid Streamable HTTP server and is all a request/response tool surface needs.
//
// Authorization is answered here rather than inside a tool result, because both answers are things
// a client acts on: 401 with the metadata url when there is no usable token, 403 with the scope
// that would satisfy the call when the token was granted less than it needs.

const zRpcMessage = z.looseObject({});
const zRpcBody = z.union([zRpcMessage, z.array(zRpcMessage)]);

export const mcp = new Hono();

// RFC 6750. `scope` names what would satisfy the request, which is what a client re-authorizes
// with; without it the only thing it learns is that something was refused.
const challenge = (scope: readonly string[] = BASE_SCOPES): Record<string, string> => ({
    "www-authenticate": `Bearer resource_metadata="${appUrl("/.well-known/oauth-protected-resource")}", scope="${scope.join(" ")}"`,
});

// A refusal for want of permission is a transport answer, not a tool result: 403 plus the challenge
// is the shape a client acts on, and the JSON-RPC error rides in the body so a client that reads
// only the envelope still sees which call failed and why. Batches keep the plain 200, because one
// status cannot describe a mix and only the failing call was refused.
const scopeRefusal = (
    c: Context,
    replies: JsonRpcResponse[],
    batched: boolean,
): Response | null => {
    if (batched || replies.length !== 1) return null;
    const needs = scopeChallengeOf(replies[0]!);
    return needs ? c.json(replies[0], 403, challenge([needs])) : null;
};

const bearer = (header: string | undefined): string | null => {
    const m = /^Bearer\s+(.+)$/i.exec(header ?? "");
    return m ? m[1]!.trim() : null;
};

mcp.all("/mcp", delegatedLimiter, async (c) => {
    if (c.req.method === "GET" || c.req.method === "DELETE")
        // no server-initiated stream yet, so there is no session to open or close
        return c.body(null, 405, { allow: "POST" });
    if (c.req.method !== "POST") return c.body(null, 405, { allow: "POST" });

    // A token is verified when one is offered, but its absence is not refused here. Some of the
    // surface is public (a template catalog is not anybody's content), so what needs an account is
    // decided per call and answered with the challenge below. A token that is offered and bad is
    // still refused outright: that is a broken client, not an anonymous one.
    const raw = bearer(c.req.header("authorization"));
    const grant = raw ? await verifyAccessToken(raw, MCP_RESOURCE()) : null;
    if (raw && !grant) return c.json({ error: "invalid_token" }, 401, challenge());

    // A JSON-RPC body is one message or a batch of them. Loose on purpose: this states only that the
    // envelope is an object (or a list of them) and leaves the fields to handleRpc, which already
    // answers -32600 for a message that is not a request. Anything that is not JSON at all, or is a
    // bare scalar, is the parse error below.
    const body = await readJson(c, zRpcBody);
    if (!body)
        return c.json({
            jsonrpc: "2.0",
            id: null,
            error: { code: -32700, message: "Parse error" },
        });

    const batch = Array.isArray(body) ? (body as JsonRpcRequest[]) : [body as JsonRpcRequest];
    const replies: JsonRpcResponse[] = [];
    for (const message of batch) {
        const reply = await handleRpc(grant, message ?? {});
        if (reply) replies.push(reply);
    }
    // a batch of notifications has nothing to answer with, which is 202 rather than an empty body
    if (!replies.length) return c.body(null, 202);
    const batched = Array.isArray(body);
    // 401 rather than 403: this client has no token at all, so the challenge is what starts OAuth.
    if (!batched && replies.length === 1 && isAuthChallenge(replies[0]!))
        return c.json(replies[0], 401, challenge());
    return scopeRefusal(c, replies, batched) ?? c.json(batched ? replies : replies[0]);
});
