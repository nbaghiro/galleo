import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash, randomBytes } from "node:crypto";

/**
 * A client for our own MCP server, for the loop you actually run while testing it.
 *
 *   pnpm mcp connect                     sign in, consent, and keep the token
 *   pnpm mcp tools                       what the surface offers, with scopes and annotations
 *   pnpm mcp call <tool> '<json>'        run one
 *   pnpm mcp resources [uri]             list the ui:// components, or read one
 *   pnpm mcp raw <method> '<json>'       any JSON-RPC method, for the ones with no shortcut
 *   pnpm mcp status                      what the stored grant covers
 *
 * `connect` walks the real flow rather than minting a token behind it: dynamic registration, the
 * consent screen (scraped the way a browser posts it back, so the CSRF field is exercised), the code
 * exchange with PKCE. What it skips is the human, by signing in with the seeded demo account.
 *
 * Flags: --url (default http://localhost:8600), --scope, --email, --password, --ws.
 */

const SESSION = ".mcp/session.json";
const DEFAULTS = {
    url: "http://localhost:8600",
    email: "demo@galleo.app",
    password: "galleo-demo-2026",
    scope: "artifacts:read artifacts:write artifacts:delete",
};

const out = (s: string): void => {
    process.stdout.write(`${s}\n`);
};
// annotated on the variable, not just the return: that is what lets control flow narrow past a call
const die: (s: string) => never = (s) => {
    process.stderr.write(`${s}\n`);
    process.exit(1);
};

const args = process.argv.slice(2);
const flag = (name: string, fallback: string): string => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 && args[i + 1] ? args[i + 1]! : fallback;
};
const positional = args.filter((a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--"));

interface Session {
    url: string;
    accessToken: string;
    refreshToken: string;
    clientId: string;
    scope: string;
    workspace: string;
}

const readSession = (): Session =>
    existsSync(SESSION)
        ? (JSON.parse(readFileSync(SESSION, "utf8")) as Session)
        : die("No session. Run: pnpm mcp connect");

const b64 = (b: Buffer): string => b.toString("base64url");

async function connect(): Promise<void> {
    const url = flag("url", DEFAULTS.url);
    const scope = flag("scope", DEFAULTS.scope);
    const jar: string[] = [];

    const login = await fetch(`${url}/api/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
            email: flag("email", DEFAULTS.email),
            password: flag("password", DEFAULTS.password),
        }),
    });
    if (!login.ok) die(`sign-in failed (${login.status}). Is the api running, and seeded?`);
    for (const c of login.headers.getSetCookie()) jar.push(c.split(";")[0]!);
    const cookie = jar.join("; ");

    const reg = await fetch(`${url}/oauth/register`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
            client_name: "Galleo CLI",
            redirect_uris: ["http://localhost:33418/callback"],
        }),
    });
    if (!reg.ok) die(`registration failed (${reg.status})`);
    const clientId = ((await reg.json()) as { client_id: string }).client_id;

    // The canonical resource identifier, read rather than assumed: tokens are audience-bound to it,
    // and it is not always the address you happen to reach the server on (a dev port, a tunnel).
    const prm = await fetch(`${url}/.well-known/oauth-protected-resource`);
    if (!prm.ok) die(`no protected-resource metadata at ${url} (${prm.status})`);
    const resource = ((await prm.json()) as { resource: string }).resource;

    const verifier = b64(randomBytes(32));
    const challenge = b64(createHash("sha256").update(verifier).digest());
    const q = new URLSearchParams({
        client_id: clientId,
        redirect_uri: "http://localhost:33418/callback",
        code_challenge: challenge,
        code_challenge_method: "S256",
        scope,
        resource,
    });
    const page = await (await fetch(`${url}/oauth/authorize?${q}`, { headers: { cookie } })).text();

    // posted back the way the browser would, so the consent token and every carried field ride along
    const form = new URLSearchParams();
    for (const m of page.matchAll(/<input type="hidden" name="([^"]+)" value="([^"]*)"/g))
        form.append(m[1]!, m[2]!);
    const workspaces = [...page.matchAll(/name="ws" value="([^"]+)"/g)].map((m) => m[1]!);
    if (!workspaces.length) die("the consent screen offered no workspace; is the account seeded?");
    const picked = flag("ws", workspaces[0]!);
    form.append("ws", picked);
    form.append("default_ws", picked);

    const consent = await fetch(`${url}/oauth/consent`, {
        method: "POST",
        headers: { cookie, "content-type": "application/x-www-form-urlencoded" },
        body: form.toString(),
        redirect: "manual",
    });
    const location = consent.headers.get("location");
    if (!location) die(`consent failed (${consent.status}): ${await consent.text()}`);
    const code = new URL(location).searchParams.get("code");
    if (!code) die(`no code in the callback: ${location}`);

    const tokenRes = await fetch(`${url}/oauth/token`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            grant_type: "authorization_code",
            code,
            code_verifier: verifier,
            client_id: clientId,
            redirect_uri: "http://localhost:33418/callback",
        }).toString(),
    });
    if (!tokenRes.ok) die(`token exchange failed (${tokenRes.status}): ${await tokenRes.text()}`);
    const tok = (await tokenRes.json()) as {
        access_token: string;
        refresh_token: string;
        scope: string;
    };

    mkdirSync(".mcp", { recursive: true });
    const session: Session = {
        url,
        accessToken: tok.access_token,
        refreshToken: tok.refresh_token,
        clientId,
        scope: tok.scope,
        workspace: picked,
    };
    writeFileSync(SESSION, `${JSON.stringify(session, null, 2)}\n`);
    out(`connected to ${url}`);
    out(`  resource   ${resource}`);
    out(`  scope      ${tok.scope}`);
    out(`  workspace  ${picked}`);
    out(`  session    ${SESSION}`);
}

interface RpcError {
    code: number;
    message: string;
}

async function rpc(method: string, params?: unknown): Promise<unknown> {
    const s = readSession();
    const res = await fetch(`${s.url}/mcp`, {
        method: "POST",
        headers: {
            "content-type": "application/json",
            authorization: `Bearer ${s.accessToken}`,
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, ...(params ? { params } : {}) }),
    });
    if (res.status === 401) die("the token was refused. Run: pnpm mcp connect");
    const body = (await res.json()) as { result?: unknown; error?: RpcError };
    if (body.error) die(`${method}: ${body.error.message} (${body.error.code})`);
    return body.result;
}

interface ToolRow {
    name: string;
    annotations: { readOnlyHint: boolean; destructiveHint: boolean };
    inputSchema: { properties?: Record<string, unknown>; required?: string[] };
    _meta?: Record<string, unknown>;
}

async function tools(): Promise<void> {
    const { tools: list } = (await rpc("tools/list")) as { tools: ToolRow[] };
    out(`${list.length} tools`);
    for (const t of list) {
        const mark = t.annotations.destructiveHint
            ? "destructive"
            : t.annotations.readOnlyHint
              ? "read"
              : "write";
        const props = Object.keys(t.inputSchema.properties ?? {}).join(" ");
        const ui = t._meta?.ui ? " ·ui" : "";
        out(
            `  ${t.name.padEnd(18)} ${mark.padEnd(11)} ${String(t._meta?.["galleo/scope"] ?? "").padEnd(18)}${ui}`,
        );
        if (props) out(`    ${props}`);
    }
}

// The render payload is the point of the component, and it is far too big to print; showing its
// shape is what tells you it arrived.
function summarise(result: unknown): void {
    const r = result as {
        content?: { text: string }[];
        structuredContent?: Record<string, unknown>;
        _meta?: {
            galleo?: { content?: { sections?: unknown[]; format?: string; theme?: string } };
        };
        isError?: boolean;
    };
    if (r.isError) out(`ERROR  ${r.content?.[0]?.text ?? ""}`);
    else if (r.content?.[0]) out(r.content[0].text.slice(0, 2000));
    const painted = r._meta?.galleo?.content;
    if (painted)
        out(
            `\n[component] ${painted.sections?.length ?? 0} sections · ${painted.format} · ${painted.theme}`,
        );
    if (r.structuredContent)
        out(`[structured] ${JSON.stringify(r.structuredContent).slice(0, 400)}`);
}

async function main(): Promise<void> {
    const [command, ...rest] = positional;
    switch (command) {
        case "connect":
            return connect();
        case "tools":
            return tools();
        case "call": {
            const name = rest[0] ?? die("which tool? pnpm mcp call <tool> '<json>'");
            const input = rest[1] ? (JSON.parse(rest[1]) as Record<string, unknown>) : {};
            return summarise(await rpc("tools/call", { name, arguments: input }));
        }
        case "resources": {
            if (rest[0]) {
                const read = (await rpc("resources/read", { uri: rest[0] })) as {
                    contents: { text: string }[];
                };
                return out(read.contents[0]?.text ?? "");
            }
            const { resources } = (await rpc("resources/list")) as {
                resources: { uri: string; mimeType: string }[];
            };
            for (const r of resources) out(`  ${r.uri}  ${r.mimeType}`);
            return;
        }
        case "raw":
            return out(
                JSON.stringify(
                    await rpc(
                        rest[0] ?? die("which method?"),
                        rest[1] ? JSON.parse(rest[1]) : undefined,
                    ),
                    null,
                    2,
                ),
            );
        case "status": {
            const s = readSession();
            out(`  server     ${s.url}`);
            out(`  scope      ${s.scope}`);
            out(`  workspace  ${s.workspace}`);
            const info = (await rpc("initialize")) as { serverInfo?: { name: string } };
            out(`  reachable  ${info.serverInfo?.name ?? "yes"}`);
            return;
        }
        default:
            out(
                "pnpm mcp connect | tools | call <tool> '<json>' | resources [uri] | raw <method> | status",
            );
    }
}

main().catch((e: unknown) => die(String(e)));
