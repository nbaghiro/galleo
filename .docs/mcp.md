# Galleo — MCP server

> How Galleo is reached from outside the product: one remote MCP server that serves Claude, ChatGPT,
> and any standalone client, authorized by OAuth with Galleo acting as the authorization server, and
> rendering its results as interactive components inside the host chat rather than as text.

Companion docs: `ai.md` (the turn protocol, the tool catalog and its pricing, the credit gate),
`workspaces.md` (membership, roles, the entitlement resolver, the credit window), `architecture.md`
(the layering law and the data model), `rendering.md` (the engine the widget paints with),
`hosting.md` (the single-origin topology every URL here depends on).

## Status

Running and connectable. Built: the tool executor, the authorization server (registration, consent,
code exchange, refresh rotation with family revocation on replay), per-call workspace resolution, the
MCP endpoint over Streamable HTTP, the effect path that lets a write take effect with no client to
apply it, the interactive component, and vendored fonts.

Connect a client to `http://localhost:8600/mcp` with `pnpm dev` and `pnpm api` running. Discovery,
dynamic registration and the browser consent flow all work from a cold start, and Vite proxies
`/mcp`, `/oauth` and `/.well-known` so the dev URL matches the production one.

For the loop you run while working on it, `pnpm mcp` is a client for our own server:

```
pnpm mcp connect                  sign in, consent, and keep the token
pnpm mcp tools                    the surface, with scopes and annotations
pnpm mcp call read-artifact '{"id":"..."}'
pnpm mcp resources [uri]          the ui:// components
pnpm mcp raw <method> '<json>'    anything with no shortcut
```

`connect` walks the real flow rather than minting a token behind it: dynamic registration, the
consent form posted back the way a browser posts it (so the CSRF field is exercised), and the code
exchange with PKCE. It reads the canonical resource identifier out of the protected-resource
metadata rather than assuming it from the address, which is what a real client does and what keeps
it working against a dev port or a tunnel. The only thing it skips is the human, by signing in as
the seeded demo account. The token lands in `.mcp/`, which is gitignored.

| file                             | what it holds                                                        |
| -------------------------------- | -------------------------------------------------------------------- |
| `services/core/ai/execute.ts`    | `runTool`: the surface check, the scope, the schema, the credit hold |
| `services/core/ai/effects.ts`    | load, apply, commit, and the room resync                             |
| `services/core/authorization.ts` | clients, codes, tokens, PKCE, rotation, families, connected apps     |
| `services/api/authorize.ts`      | the two metadata documents, `/oauth/*`, the consent page             |
| `services/core/mcp.ts`           | the JSON-RPC methods, hono-free                                      |
| `services/api/mcp.ts`            | the transport, the 401 and 403 challenges, the per-token rate limit  |
| `services/core/widget.ts`        | the `ui://` component html and the exact origins it may fetch from   |
| `widget/`                        | the component itself: the real engine, no framework                  |
| `scripts/fonts-vendor.ts`        | vendors every face the theme library and the picker can name         |
| `scripts/mcp.ts`                 | `pnpm mcp`, a client for our own server, for testing it              |

## What it is

One server, at one URL, doing three jobs that would otherwise be three integrations:

- the **Claude connectors directory**, submitted through the org settings portal on claude.ai,
- the **ChatGPT app directory**, submitted as a plugin with MCP,
- **standalone** use from Claude Desktop, Claude Code, VS Code, or anything else speaking MCP.

There is no per-store variant. The authorization flow, the tool list, and the UI components are the
same for all three, because both directories converged on the same specifications: OAuth 2.1 with
Protected Resource Metadata for auth, and MCP Apps (SEP-1865) for interactive components.

## The endpoints

```
POST /mcp                                       Streamable HTTP, the protocol itself
GET  /.well-known/oauth-protected-resource      RFC 9728, points at the authorization server
GET  /.well-known/oauth-authorization-server    RFC 8414, the authorization server's own metadata
GET  /oauth/authorize                           browser: sign in if needed, then consent
POST /oauth/token                               code exchange and refresh
POST /oauth/register                            RFC 7591 dynamic registration (deprecated, kept)
```

Three things about the shape of this list.

The two `.well-known` paths are fixed by their RFCs, so they cannot live under the `/api` prefix
every other router uses. Neither can `/mcp`, whose path is the resource identifier a client sends
back as the RFC 8707 `resource` parameter. All three mount at the root.

In production `services/server.ts` ends with `app.get("*", serveStatic({ path: "./dist/app/index.html" }))`,
which serves the SPA for anything unmatched. These routes must mount before it or they return HTML.
The failure it produces is a client that cannot discover the server at all, which does not look like
a routing bug from the outside, so it wants a test rather than a convention.

There is no CORS middleware in the backend and the doc that explains why (`hosting.md`) treats the
single origin as load-bearing. `/mcp` needs none: hosts call it server to server with a bearer token.
The two metadata documents do need permissive CORS, because a browser-based client may read them.

## Authorization

Galleo becomes an OAuth 2.1 authorization server, and `/mcp` is a resource server in front of it. The
specification allows the two to be co-hosted, which is what the single-origin topology wants anyway.

Note that `services/api/oauth.ts` already exists and runs the opposite direction: it is Galleo as a
client of Google, for sign-in. The new routes are Galleo as a server to somebody else. Two files
named for the same protocol pointing opposite ways is a real source of confusion, so the new one is
`services/api/authorize.ts` over `services/core/authorization.ts`, and neither reuses the word
"provider", which in `services/core/accounts.ts` already means Google.

### The flow

A client with no token calls `/mcp` and gets:

```http
HTTP/1.1 401 Unauthorized
WWW-Authenticate: Bearer resource_metadata="https://galleo.app/.well-known/oauth-protected-resource",
                         scope="artifacts:read"
```

It reads that document, follows it to the authorization server metadata, obtains a client id, then
opens a browser at `/oauth/authorize` with PKCE and `resource=https://galleo.app/mcp`. Galleo already
knows how to authenticate a person in a browser, so this step reuses the session cookie: no session
redirects to `/login?next=…`, and a session renders the consent screen. The callback carries the code
and an `iss` parameter (RFC 9207), and the client exchanges the code with its verifier.

Every token is audience-bound to `https://galleo.app/mcp` and validated as such on each request. A
token issued for anything else is refused. This is the confused-deputy protection and it is not
optional.

### Client registration

The specification now ranks three mechanisms, and we accept all three because the two directories do
not agree on which they use:

| mechanism                              | status               | who uses it                                              |
| -------------------------------------- | -------------------- | -------------------------------------------------------- |
| Client ID Metadata Documents           | the current SHOULD   | the direction the spec is moving                         |
| Pre-registered static client id        | always allowed       | Anthropic holds one for directory listings               |
| Dynamic Client Registration (RFC 7591) | deprecated, retained | still offered by Anthropic, and by most existing clients |

Supporting only the newest would exclude clients that work today. Supporting only DCR would put us on
a deprecated path. The cost of all three is small: they differ only in how a `client_id` is obtained,
not in anything after it.

### Scopes

Four, mapping onto what the product already distinguishes rather than onto the tool list:

```
artifacts:read     find, read, inspect sections, export, list templates
artifacts:write    create, generate, edit, rewrite, set theme, reorder
artifacts:share    create and modify public links
artifacts:delete   trash and restore
```

`scopes_supported` in the Protected Resource Metadata advertises `artifacts:read` only. That is
deliberate: the specification asks servers to publish the minimal set for basic functionality and to
obtain the rest through step-up, so a client that only reads never has to ask for the right to write.
A call needing more returns 403 with `error="insufficient_scope"` and the scopes that would satisfy
it, and the client re-authorizes with the union.

Which scope a tool needs is stated in the catalog, not here: `effect` answers three of the four, and
a tool whose scope it cannot express declares one (`share-artifact` is a write that needs
`artifacts:share`; `restore-artifact` is a write that belongs with `artifacts:delete`, since the
trash pair travels together). A tool that declares nothing falls back to `artifacts:write`, never to
read, so forgetting to annotate cannot widen a token's reach. `tools/list` carries each tool's scope
in `_meta["galleo/scope"]`, which is what lets a client see what to step up to rather than
discovering it by being refused.

The refusal itself is a transport answer rather than a tool result: a single call comes back as 403
with the `WWW-Authenticate` challenge naming the scope, because that is the shape a client acts on.
Inside a batch it degrades to a per-call JSON-RPC error, since one status cannot describe a mix.

`offline_access` is requested by clients that want a refresh token, and is deliberately absent from
`scopes_supported`, since a refresh token is a client concern rather than a resource requirement.

The workspace does not appear in any scope. Scopes say what kind of action is permitted; the
workspace says which tenant it lands in. Encoding tenant into scope would make `scopes_supported`
unbounded and break the step-up flow that depends on it.

### Tables

```
oauth_clients          id · client_id · name · redirect_uris · registration source · created_at
oauth_authorizations   code · client_id · user_id · workspace_ids · default_workspace_id ·
                       code_challenge · scopes · resource · expires_at · consumed_at
oauth_tokens           id · client_id · user_id · workspace_ids · default_workspace_id · scopes ·
                       family_id · resource · access_token_hash · refresh_token_hash ·
                       expires_at · revoked_at · last_used_at
```

Codes are single use and short lived; `consumed_at` makes replay detectable rather than merely
impossible. Tokens store a hash, never the value. Revocation is a timestamp rather than a delete, for
the same reason the planned API keys design chose one: a credential that was used has to remain
explainable after it is turned off.

## Which workspace a call acts on

This is the decision with the most consequences, so it gets its own section.

`requireWorkspace` does not take a workspace. It calls `currentMembership(user.id)`, which resolves
from `users.activeWorkspaceId`, falling back to the oldest membership:

```ts
const row = rows.find((r) => r.ws.id === r.active) ?? rows[0];
```

That column is a mutable pointer on the user row, written by `switchWorkspace` whenever somebody uses
the workspace switcher in the browser. Reusing this gate for MCP would mean the workspace an external
tool call acts on is whatever the user last clicked in a browser tab, possibly on another device,
possibly weeks ago. Switching workspace at galleo.app would silently retarget a live conversation in
ChatGPT: content lands in the wrong tenant and draws down the wrong credit balance, with nothing in
the transcript recording it.

So the first rule is a prohibition: the MCP path never reads or writes `users.activeWorkspaceId`. It
resolves through a new `membershipFor(userId, workspaceId)` beside the existing
`currentMembership(userId)`. Note that `currentMembership` also rolls the monthly credit window as a
side effect of reading, which is invisible at every call site, so the new function carries that too,
or the roll is lifted out of both.

A grant covers a set of workspaces rather than one. The consent screen lists the user's memberships
and they choose which the client may reach, defaulting to all, with one marked as the default. Storing
the set on the grant rather than saying "everything, forever" matters because otherwise a workspace
they join next year sits inside a consent they gave today.

Selection then happens per call. Every workspace-scoped tool takes an optional `workspace`, resolved
as the explicit argument first and the grant's default second. There is no third fallback, and in
particular no inheritance from the browser. The default was chosen by a person on a consent screen, so
an omitted argument still resolves to something a human picked.

Authorization is checked live on every call, against the `members` table, so nothing about tenancy is
baked into the token. Removing somebody from a workspace revokes their MCP reach immediately with no
token surgery, which a workspace-bound token would not have given us for free.

Once `membershipFor` returns, it hands back the same `{ ws, role }` shape the cookie path produces, so
everything downstream works untouched: `requireRole`, `gateArtifact`, `featuresFor`, `reserve`, and
the per-member credit cap all reflect the named workspace. Role is already computed per workspace
(`ws.ownerId === userId ? "owner" : asRole(row.role)`), so a person who owns their personal workspace
and is a plain member of their employer's gets the right role in each with no new model.

Two rules keep the model from choosing wrongly, which is the residual risk once escalation is
impossible. Every tool result names the workspace it acted on, in `structuredContent`, so the choice
is visible in the transcript instead of implied. And destructive tools take the explicit argument
only, never falling through to the default, because `trash-artifact` in the wrong tenant is the one
mistake that is expensive.

`list-workspaces` is the only user-scoped tool in the catalog. It is worth writing down precisely
because it is the single exception to an otherwise uniform rule.

## One executor, three transports

The tool bodies are already shared. Each tool file exports a plain function and a registered tool
wrapping it (`reviseElement` and `reviseElementTool` in `tools/element.ts`), and `services/api/ai.ts`
imports the function while `chat.ts` imports the tool. What is not shared is the envelope around a
call, and MCP would be the third copy of it.

Four seams have already drifted:

- **Input contracts are inconsistent.** Some routes duplicate a tool: `/ai/theme` takes
  `{prompt, isDark}`, which is exactly `generate-theme`'s input. Some are a different operation
  sharing an inner function: `/ai/element` is handed the element object, while `revise-element`
  locates one by type and ordinal, because an LLM can name a type but cannot hand over a node. And
  `/ai/text` multiplexes two tools behind an `op` field. Only the first kind is duplication, so this
  seam closes per route rather than by a sweep.
- **Metering is inconsistent.** `/ai/element` calls `reserve(ws, userId, "revise-element", …)` itself,
  naming the tool id as a string literal in the route, while a tool called inside an agent turn
  reserves nothing: `/ai/turn` holds one reservation and settles against measured usage. The same
  tool is billed differently depending on the caller.
- **The surface field is decorative.** `toolsFor()` is referenced only in its own file and one test.
  `chat.ts` hand-assembles its toolset from twenty named imports, so a tool declaring
  `surfaces: ["agent"]` is not offered to the agent unless somebody also remembers the import.
  Nothing checks at runtime that a caller may have the tool it asked for.
- **Results are shaped per route.**

### The envelope

One executor in `services/core/ai/execute.ts`:

```ts
export async function* runTool(
    call: { id: ToolId; surface: ToolSurface; input: unknown },
    principal: { user; ws; role },
    opts: { ctx; meter?; models?; reservation? },
): AsyncGenerator<TurnEvent, ToolOutcome>;
```

In order: resolve the tool, check the surface permits this caller, parse the input with the tool's own
schema, apply the `featuresFor(ws)` entitlement, reserve, run while forwarding events, settle, return.
Step two is what turns `surfaces` from a comment into a rule.

It is a separate file from `tools.ts` rather than an addition to it, on the grounds that the registry
says what a tool **is** and the executor says what happens **around a call**. Keeping billing out of
the registry is also what lets the registry stay unit-testable without a ledger.

### The reservation seam

`opts.reservation` is what makes one executor serve all three surfaces. Absent, the executor reserves
and settles for itself, which is what a one-off direct call or an MCP call wants. Present, the
enclosing turn already holds credits, so the executor runs the body and bills nothing, preserving what
`/ai/turn` does today.

Without that seam, unifying would silently double-charge every agent turn. It is the single most
important line in this section.

### What each surface becomes

- **agent**: builds its toolset from `toolsFor("agent")` instead of twenty imports, so adding a tool
  to the catalog stops being a two-file edit where forgetting the second file fails silently.
- **direct**: the existing routes keep their URLs, and keep their own body schemas, which
  `check:validation` requires at the HTTP boundary whatever runs underneath. What they drop is the
  `reserve` call naming a tool id as a string literal, which is the fork that actually matters.
- **mcp**: `tools/list` from `toolsFor("mcp")`, with JSON Schema derived from the same zod schema that
  validates the call (zod is on `^4.4.3`, which has `z.toJSONSchema()` natively, so there is no second
  description of the inputs). `tools/call` goes through the executor.

### Keeping it unified

Unifying the code once is the smaller half of the problem, since the four seams above drifted apart
without anyone deciding they should. This repo already answers that pattern with guards that plant
violations to prove they still report, so `pnpm check:tools` asserts:

- no file under `services/api/` imports a tool body, which is the regression that re-forks
  validation (a type-only import of a result shape is not a body and does not count),
- no file outside the executor calls `reserve` with a tool id, which is the regression that re-forks
  metering, except the handful in the script's `ALLOW`: narration, voice audition and voice design
  price a provider call the catalog names but no registered body runs, and `/ai/turn` holds the one
  reservation a whole agent turn settles against,
- every tool reachable on a non-internal surface resolves to a scope,
- every tool that is **live** on the `mcp` surface has an implementation, since `tools/list` is built
  from the registry and would otherwise leave a declared tool silently out; a planned one (no `live`)
  may name where it will land,
- every `mcp` tool name is at most 64 characters, which is the Claude directory's limit.

A `TOOL_SPEC` entry is not checked here because `implement()` already throws at import for a
reachable tool without one, which is earlier and louder than a guard.

## The tool surface

The `mcp` surface is 17 tools: the four reads a client needs to find its way around
(`find-artifacts`, `read-artifact`, `show-sections`, `find-templates`) and the writes the effect path
can carry out server-side. It was once the inverse of that, carrying generate-artifact and its
neighbours while excluding every read tool, so an external client could generate a deck and then be
unable to list what exists or read one back.

The reads matter most because they are the highest value to an external client and the lowest risk,
and they are the ones a store reviewer can exercise without spending credits. The writes are gated
by scope rather than by absence: a token granted `artifacts:read` sees them in `tools/list` and is
told what to step up to, which is what makes the read-only case genuinely read-only.

It is also aspirational in a way the section below makes untenable: most of those 17 cannot take
effect over MCP at all, because they return something for a client to apply and MCP has no client. So
the surface is now truthful rather than intended. `AGENT_DIRECT` is `["agent", "direct"]`, a second
`OVER_MCP` carries the tools that genuinely work, and today that is four:
`find-artifacts`, `read-artifact`, `show-sections`, `find-templates`. Everything else joins once the
effect path exists. The agent-loop tools (`propose-generation`, `request-write`, `steer-sections`,
`revise-outline`, `search-context`) never join, being inner-loop affordances of Galleo's own chat.

`apply-patch` is the exception worth noting: it is declared `["mcp", "direct"]` and has no
implementation, which reads as somebody having anticipated exactly the gap below and left a place for
it.

Two fields are added to `ToolMeta` in `model/tools.ts`, since that file is already the one catalog:

- **`effect`**, one of `read` / `write` / `destructive`, absent meaning `write`. The MCP layer turns
  it into the `readOnlyHint` and `destructiveHint` annotations both directories check at review, and
  Anthropic's guidance names a wrong hint as a common rejection. One field rather than three
  booleans, because the three are not independent and the catalog should not be able to state a
  combination that means nothing.
- **an output schema.** `implement()` has none today, and both hosts want one. This is the piece with
  real work behind it, because tools return heterogeneous values: a string, an `ArtifactRef[]`, a
  `Section`, an `ElementInstance`.

## The effect path, which does not exist yet

Tracing a call end to end turns up the one structural gap in this design, and it is why the `mcp`
surface above is four tools rather than twenty-five.

**The AI server never persists anything.** `services/core/ai/run.ts` contains no database write.
`runGenerate` streams `{ type: "patch", ops }` and the browser does the work:

```ts
const next = applyPatch(drafts[id].content, ev.ops); // app/stores/chat.ts
```

**The artifact arrives from the client, not from the database.** `zElementEdit` and `zSuggest` take
`content: zArtifactContent` in the request body, so the browser sends the document it is already
holding. There is no server-side load step for editing. `makeWorkspaceReader.read` exists but returns
a prose digest for a model to read, not content to edit.

**Management tools return intentions rather than effects.** `tools/manage.ts` imports no database.
Its tools return a `WorkspaceAction`, and the comment on that type in `model/ai.ts` is explicit:

```ts
// client ROUTES to the guarded UI (Share modal / export), never publishes/downloads directly
| { kind: "share"; id: string }
| { kind: "export"; id: string }
```

So `share-artifact` does not share and `export-artifact` does not export; they ask a browser to open
a modal. `trash-artifact` is marked destructive because the client confirms it.

None of this is a defect. It is a coherent design for a product whose only client is its own editor,
and it keeps the AI server stateless. It simply does not survive contact with a caller that has no
browser. MCP needs a server-side path that loads an artifact, applies a tool's result through the
same section-op write the REST route uses (which already bumps `artifacts.seq` so the collaboration
room can order it), and performs a `WorkspaceAction` rather than describing one.

That path is close to what `.docs/prompts/06-public-api.md` was going to build, which revises an
earlier claim in this doc: MCP should still come first, because an OAuth token carries a real user
and solves the principal problem an API key does not, but the two share a foundation rather than
being independent.

## Widgets

MCP Apps (SEP-1865) is final, and Claude, ChatGPT, VS Code and Goose all render server-shipped HTML in
a sandboxed iframe. The server registers a `ui://` resource with mimetype `text/html;profile=mcp-app`,
a tool points at it through `_meta.ui.resourceUri`, and the host delivers the result into the iframe
over JSON-RPC on `postMessage`. ChatGPT's `openai/outputTemplate` is documented as a compatibility
alias for the same field, so this is one component rather than one per store.

### Why this is cheap here

Three things are already true.

`GET /api/media/asset/:id` has no gate. The comment on it says why: _"Public by opaque uuid so
`<img>`/canvas/export load credential-less, like a stock CDN url."_ Written for the export path, it
means a sandboxed iframe with no session loads every image in an artifact.

`canvas/` is pure TypeScript, framework-free, importing only `model`. The widget bundles the real
layout engine with no Solid and no app shell, so what renders in somebody else's chat is the product
rather than a picture of it.

The build already produces a session-free artifact renderer. `vite.config.ts` has three entries
(`website`, `app`, `publish`), and `publish/` exists to render an artifact for someone with no
account. A fourth `widget` entry follows a pattern instead of inventing one.

### structuredContent and \_meta are different audiences

`structuredContent` is what the model reads. `_meta` reaches the component and is hidden from the
model. Conflating them is the mistake to avoid.

So `structuredContent` stays small and useful to the model: id, title, format, section titles, the
workspace it acted on, the Galleo URL. Enough to say what happened and to reference in the next call.
The content tree, resolved theme tokens, and render payload go in `_meta`, where the widget reads them
and the model never pays context for JSON it cannot use.

If a large artifact exceeds a host's result size limit, the fallback is a short-lived read token in
`_meta`, scoped to that one artifact, which the widget exchanges over `connectDomains`. That is the
only genuinely new piece of auth here, since an iframe carries no cookie. It deliberately does not
reuse `/p/:slug/content`, which requires publishing, a side effect with its own workspace policy.

### The components

Two templates cover the surface: an artifact renderer and a library list. The renderer is where the
product's thesis becomes visible in somebody else's app, because switching a result between deck, doc
and web inside the chat is something no competitor can show, one tree behind three renderings being
the whole point.

The component may also call tools itself, which resolves a problem that otherwise needed durable job
state. `generate-artifact` runs for minutes and an MCP tool returns exactly one result, so streaming
it is awkward and holding the request open is worse. Instead the tool returns immediately with an
artifact id and a widget, and the widget polls a cheap read tool, painting sections as they land. The
user watches the deck build, the request does not stay open, and there is no queue to build.

CSP is declared per component through `_meta.ui`: `resourceDomains` for the widget script and images,
`connectDomains` for the read-token fetch, and `frameDomains` empty, since nested frames are blocked
by default and nothing here needs one.

## Self-hosted fonts

The widget's domain allowlist is the reason this came up, but the change is larger than the widget and
pays for more than it.

This is built. The faces are vendored under `public/fonts/` and served from our own origin through
`/fonts.css`, which is what `index.html`, `app/index.html`, `publish/index.html` and the widget shell
all link. Before that the Google Fonts stylesheet covered the whole theme library and the `<link>` was
hand-duplicated across the three entries, while `canvas/render/fonts.ts` fetched TTFs from Google **at
export time** to embed faces into PDF and PPTX, behind a 10 second deadline, a snap-to-canonical-weight
retry, and a `wawoff2` wasm decompress per face.

Self-hosting removes a third-party domain from a manifest that store reviewers read, which was the
original reason. It also removes a network fetch and a wasm decompress from the export hot path, and
it kills a flake class: `eval:shots` has a three-attempt retry around font loading that exists only
because a stalled Google fetch could fail a run. Vendored faces make that retry unnecessary.

The faces are committed rather than fetched during the build. Fonts are immutable and never churn, so
the usual objection to binaries in version control does not apply, and roughly 5MB is not a real cost.
The deciding factor is deploys: a build-time fetch means pulling 233 files from Google on every Render
deploy, which is exactly the flaky-network failure being removed.

Two scripts, in the shape the repo already uses: `pnpm fonts:vendor` regenerates the vendored set and
the `@font-face` stylesheet, run by hand when the theme library gains a family, and `pnpm check:fonts`
asserts every family any theme names has a vendored face. Without the guard, a new theme ships with an
invisible fallback and nobody notices until an export looks wrong.

One thing still to confirm rather than assume: the vendored faces are Google Fonts and almost
certainly OFL, but the unusual ones (Press Start 2P, Rye, Silkscreen, VT323) want a licence check now
that we redistribute the binaries ourselves.

## Store submission

Both directories want much the same evidence, and most rejections are for the same two or three
things rather than for anything architectural.

| requirement                             | Claude                                              | ChatGPT                                                                 |
| --------------------------------------- | --------------------------------------------------- | ----------------------------------------------------------------------- |
| Remote HTTPS server, Streamable HTTP    | yes                                                 | yes, typically at `/mcp`                                                |
| OAuth with a browser consent flow       | yes                                                 | yes                                                                     |
| Reviewer test account without MFA       | yes                                                 | yes, and it must not need SMS, email confirmation, or a private network |
| Safety annotations on every tool        | yes, a wrong hint is a common rejection             | yes                                                                     |
| Public privacy policy                   | **missing or incomplete is an immediate rejection** | yes                                                                     |
| Verified developer or business identity | via the org settings portal                         | yes                                                                     |
| Domain verification                     |                                                     | yes                                                                     |
| Exact CSP domains for components        |                                                     | yes                                                                     |
| Test cases                              |                                                     | five positive, three negative, passing on web and mobile                |
| Tool name length                        | 64 characters or fewer                              |                                                                         |

The privacy policy is the one to settle first, because it is the only item that is not engineering
work and the only one that fails a submission outright.

## Build order

1. ~~The executor.~~ Built, and every direct route now runs through it: `/ai/brief`, `/ai/suggest`,
   `/ai/element`, `/ai/text`, `/ai/refine`, `/ai/notes` and `/ai/theme` call `runTool` rather than a
   tool body beside their own `reserve`. `check:tools` enforces both halves. The reserves that
   remain outside it are in that script's ALLOW: narration, voice audition and design price a
   provider call the catalog names but no registered tool body runs, and `/ai/turn` holds the one
   reservation a whole agent turn settles against.
2. ~~The `mcp` surface membership and the `effect` annotation.~~ Built. Output schemas are not.
3. ~~The authorization server.~~ Built, and hardened: the consent screen validates the session
   through `currentUser` so a password reset revokes it, the consent form is signed against the
   session, client and challenge, redirect uris must be https or loopback, every endpoint is rate
   limited, refresh reuse revokes the family, and a person can see and disconnect apps from account
   settings.
4. ~~`membershipFor` and the per-call workspace resolution.~~ Built.
5. ~~The effect path: load an artifact server-side, apply a tool result through the section-op write,
   perform a `WorkspaceAction`.~~ Built, in `services/core/ai/effects.ts`
   (`loadContent` → `applyToContent` → `commitContent`), so the surface is no longer read-only.
6. ~~The MCP endpoint itself: initialize, `tools/list`, `tools/call`.~~ Built, in
   `services/core/mcp.ts`.
7. ~~Fonts vendored, the existing entries switched, `check:fonts`.~~ Built, and the guard now
   runs in pre-commit and CI.
8. The widget entry, the two component templates, the `ui://` resources.
9. Submission: privacy policy, reviewer account, domain verification, test cases.

Steps 1 and 2 ship on their own and are worth having whether or not the rest lands, which is why they
are first.

## Planned / deferred

- **Whether a grant may extend to workspaces joined after consent.** Assumed no here: convenient, but
  a permission that widens after the fact is not one the user actually gave.
- **`select-workspace` session state.** Left out of v1 in favour of the optional argument plus the
  grant default. MCP sessions can be re-established underneath the model, and a stale selection it
  cannot see is a confusing failure.
- **Artifacts reached only through a collaborator grant** (`gateShared`, outside the workspace) are
  not exposed. That is a third tenancy tier and it wants its own thinking.
- **Whether MCP is plan-gated.** `apiAccess` is Premium-only today. Inheriting that would make a store
  listing useless as an acquisition channel, since a new user would install the app and hit an upgrade
  wall; leaving it ungated relies on the credit meter, which already exists. Not decided.
- **The public REST API and workspace API keys** (`.docs/prompts/06-public-api.md`) remain separate and
  later. That design has an unresolved problem this one does not: a workspace key has no person
  attached, so it has to invent a synthetic principal for the ledger, while an OAuth token carries a
  real user and makes credit attribution and per-member caps work unchanged.
