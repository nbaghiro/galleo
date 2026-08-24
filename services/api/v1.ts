import { Hono } from "hono";
import { z } from "zod";
import type { ToolId } from "@model/tools";
import { appUrl } from "@services/utils/env";
import { readJson } from "@services/utils/http";
import { verifyAccessToken } from "@services/core/authorization";
import type { AccessGrant } from "@services/core/authorization";
import { callDelegated } from "@services/core/delegated";
import type { Outcome } from "@services/core/delegated";
import { delegatedLimiter } from "@services/api/middleware";

// The public REST surface. It is a shape rather than a second implementation: every route resolves
// to a tool and runs through the same executor the chat agent and the MCP server use, so the gates,
// the metering and the effects are shared and cannot drift. What is not shared is the vocabulary,
// because a resource path is what a person integrating expects to read in documentation.

export const v1 = new Hono();

// The same ceiling MCP runs under, and the same bucket: one credential holds one budget however it
// arrives. Ahead of every route, including the anonymous catalog read, which has no token to key on.
v1.use("/api/v1/*", delegatedLimiter);

const bearer = (header: string | undefined): string | null => {
    const m = /^Bearer\s+(.+)$/i.exec(header ?? "");
    return m ? m[1]!.trim() : null;
};

// `resource: ""` on a machine token, because there is no MCP endpoint it was bound to; a browser
// token names one and is accepted here too, so one credential can drive both surfaces.
const grantFor = async (raw: string): Promise<AccessGrant | null> =>
    (await verifyAccessToken(raw, "")) ?? (await verifyAccessToken(raw, appUrl("/mcp")));

const unauthorized = { error: "unauthorized" } as const;

/** One shape for every route: resolve the caller, run the shared call, answer with what it made. */
async function run(
    header: string | undefined,
    workspace: string | undefined,
    id: ToolId,
    input: Record<string, unknown>,
): Promise<{ status: 200 | 400 | 401 | 403 | 404 | 500; body: unknown }> {
    // No token is not a refusal here: part of the surface needs no account, and which part is the
    // shared call's decision rather than this layer's, or the two surfaces allow different things.
    // A token that is offered and does not verify is still refused, the same as over MCP: that is a
    // broken client, not an anonymous one.
    const raw = bearer(header);
    const grant = raw ? await grantFor(raw) : null;
    if (raw && !grant) return { status: 401, body: unauthorized };
    let out: Outcome;
    try {
        // The named workspace goes through unresolved: whether the grant covers it is checked once,
        // where the default and the membership lookup already are.
        out = await callDelegated({ id, surface: "api", input, workspace }, grant);
    } catch (e) {
        // A tool body that throws is a server fault rather than something a client can act on, but
        // it still has to come back as JSON, the way MCP catches one into its envelope: otherwise
        // this is the one answer the two surfaces phrase differently, and the throw may land after
        // the write it was making already happened.
        return { status: 500, body: { error: e instanceof Error ? e.message : "the call failed" } };
    }
    if (out.ok)
        return {
            status: 200,
            body: {
                ...(out.workspace ? { workspace: out.workspace } : {}),
                ...(out.artifactId ? { artifact: out.artifactId } : {}),
                data: out.result,
            },
        };
    // the shapes a REST client acts on: 403 to widen a token, 404 for a thing that is not there
    if (out.kind === "scope")
        return { status: 403, body: { error: "insufficient_scope", scope: out.needs } };
    if (out.kind === "needs-auth") return { status: 401, body: unauthorized };
    if (out.kind === "not-found") return { status: 404, body: { error: out.message } };
    return { status: 400, body: { error: out.message } };
}

const ws = (c: { req: { query: (k: string) => string | undefined } }): string | undefined =>
    c.req.query("workspace");

v1.get("/api/v1/workspaces", async (c) => {
    const out = await run(c.req.header("authorization"), undefined, "list-workspaces", {});
    return c.json(out.body, out.status);
});

v1.get("/api/v1/templates", async (c) => {
    const out = await run(c.req.header("authorization"), ws(c), "find-templates", {
        query: c.req.query("q"),
    });
    return c.json(out.body, out.status);
});

v1.get("/api/v1/artifacts", async (c) => {
    const out = await run(c.req.header("authorization"), ws(c), "find-artifacts", {
        query: c.req.query("q"),
    });
    return c.json(out.body, out.status);
});

v1.get("/api/v1/artifacts/:id", async (c) => {
    const out = await run(c.req.header("authorization"), ws(c), "read-artifact", {
        id: c.req.param("id"),
    });
    return c.json(out.body, out.status);
});

const zCreate = z.object({
    title: z.string(),
    content: z.looseObject({
        format: z.string(),
        theme: z.string(),
        sections: z.array(z.unknown()),
    }),
});

v1.post("/api/v1/artifacts", async (c) => {
    const body = await readJson(c, zCreate);
    if (!body) return c.json({ error: "title and content are required" }, 400);
    const out = await run(c.req.header("authorization"), ws(c), "create-artifact", body);
    return c.json(out.body, out.status);
});

const zGenerate = z.looseObject({ prompt: z.string() });

v1.post("/api/v1/artifacts/generate", async (c) => {
    const body = await readJson(c, zGenerate);
    if (!body) return c.json({ error: "a prompt is required" }, 400);
    const out = await run(c.req.header("authorization"), ws(c), "generate-artifact", body);
    return c.json(out.body, out.status);
});

v1.delete("/api/v1/artifacts/:id", async (c) => {
    const out = await run(c.req.header("authorization"), ws(c), "trash-artifact", {
        artifactId: c.req.param("id"),
    });
    return c.json(out.body, out.status);
});
