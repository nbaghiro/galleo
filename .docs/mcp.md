# Galleo — MCP server

> How Galleo is reached from outside the product: one remote MCP server that serves Claude, ChatGPT,
> and any standalone client, authorized by OAuth with Galleo acting as the authorization server, and
> rendering its results as interactive components inside the host chat rather than as text.

Companion docs: `ai.md` (the turn protocol, the tool catalog and its pricing, the credit gate),
`workspaces.md` (membership, roles, the entitlement resolver, the credit window), `architecture.md`
(the layering law and the data model), `rendering.md` (the engine the widget paints with),
`hosting.md` (the single-origin topology every URL here depends on).

## Status

Running and connectable. Built: the tool executor (which now also serves the studio's generation tools, so an external client can run a generation beat by beat), the authorization server (registration, consent,
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
| `services/core/generations.ts`   | the `GenerationStore`: the run's row, its draft, the writer lease    |
| `services/core/ai/effects.ts`    | load, apply, commit, and the room resync                             |
| `services/core/authorization.ts` | clients, codes, tokens, PKCE, rotation, families, connected apps     |
| `services/api/authorize.ts`      | the two metadata documents, `/oauth/*`, the consent page             |
| `services/core/mcp.ts`           | the JSON-RPC methods, hono-free                                      |
| `services/api/mcp.ts`            | the transport, the 401 and 403 challenges                            |
| `services/api/v1.ts`             | the REST vocabulary over the same shared call                        |
| `services/core/delegated.ts`     | the one call both delegated surfaces make, and every refusal in it   |
| `services/api/middleware.ts`     | `delegatedLimiter`, the ceiling both `/mcp` and `/api/v1` share      |
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
is visible in the transcript instead of implied. And a destructive tool has to name its workspace when
the grant covers more than one, rather than falling through to the default, because
`trash-artifact` in the wrong tenant is the one mistake that is expensive. Where the grant covers a
single workspace there is no ambiguity to resolve, so it falls through as everything else does:
refusing there would be friction rather than safety.

`list-workspaces` is the only user-scoped tool in the catalog. It is worth writing down precisely
because it is the single exception to an otherwise uniform rule.

## One executor, three transports

Every tool body is a plain generator registered with `implement()` in `services/core/ai/tools/`,
and every caller reaches it through one function, `runTool` in `services/core/ai/execute.ts`:

```ts
runTool(
    { id, surface, input },           // input is untrusted; the tool's own zod schema parses it
    principal,                        // { userId, ws, role, scopes? }, or null for a public tool
    { ctx, holds?, apply?, size?, onEvent?, onHeld?, produced?, trace? },
): Promise<ToolOutcome>;
```

In order: the catalog lists the surface the call arrived on; the granted scope covers the tool
(a session has no scopes and skips this); the workspace's plan carries the entitlement the tool
names; the input parses; a `generationId` in the input loads the run and its draft into the
context; a write to a generation claims its writer lease; the credits are held, sized off the
generation for a write; the body runs, and every patch it yields is applied through the
`GenerationStore` as it arrives; the hold settles against what ran. The outcome is `{ ok, result,
patches, artifactId?, generationId? }` or a typed refusal.

It is a separate file from the registry, on the grounds that the registry says what a tool **is**
and the executor says what happens **around a call**. Keeping billing out of the registry is what
lets a body run against the in-memory store in a unit test or an eval with no ledger.

### The hold

`holds` is what makes one executor serve every surface without double-charging. Absent (or
`"self"`), the executor reserves and settles for itself, which is what a direct route, an MCP call
or an API call wants. `"caller"` means the enclosing turn already holds credits, which is how the
chat agent's sub-tools run: one reservation per turn, settled for the reply and every tool it ran.

`onHeld` fires once the credits are held and before the body runs. A streaming route
(`streamRun` in `services/api/middleware.ts`) waits for it before opening the SSE body, so a
refusal is still a status rather than a line smuggled down a 200.

### The patch

`apply` decides whether the patches a body yields persist. True (the default) is what every
delegated call wants: the change lands in the draft or the target as it is yielded. False is the
chat agent's `confirm: "after"` policy: the patches are collected onto a card and land only when
the user presses it, through `apply-patch`.

### What each surface is

- **agent**: the toolset is `offeredTo(ctx)`, the catalog's `agent` surface filtered by what the
  context holds (`needs` / `without`). Adding a tool to the catalog and implementing it is the
  whole job.
- **direct**: the routes keep their URLs and their own body schemas at the HTTP boundary, as
  `check:validation` requires, and hand the call to the executor. `POST /ai/turn { tool, input }`
  streams any tool on the surface; the JSON one-shots name theirs.
- **mcp** and **api**: `tools/list` from the `mcp` surface, with JSON Schema derived from the same
  zod schema that validates the call; `tools/call` and the REST vocabulary both go through
  `services/core/delegated.ts` and then the executor.

### Keeping it unified

`pnpm check:tools` asserts, planting a violation first so a quiet run is a failure:

- no file under `services/api/` imports a tool body (a type-only import of a result shape is not a
  body),
- no file outside the executor calls `reserve` with a tool id; the script's `ALLOW` is empty,
- every tool reachable by the agent declares a confirm policy,
- every tool reachable on a non-internal surface resolves to a scope,
- every tool that is **live** on the `mcp` surface has an implementation,
- every `mcp` tool name is at most 64 characters, the Claude directory's limit.

A `TOOL_SPEC` entry is not checked here because `implement()` already throws at import for a
reachable tool without one, which is earlier and louder than a guard.

## The tool surface

The `mcp` surface is 29 tools, and the `api` surface is the same 29, because what an external AI
client may do and what an integration may do are the same list: the difference between them is how
they authenticated, not what they are allowed to reach. `OVER_MCP` in `model/tools.ts` is
`["agent", "direct", "mcp", "api"]`, so the delegated surfaces move together by construction.

Five reads let a client find its way around (`find-artifacts`, `read-artifact`, `show-sections`,
`find-templates`, `list-workspaces`, the last two `public` or account-level). The **generation's
tools** are all here (`start-generation`, `plan-outline`, `revise-brief`, `revise-outline`,
`steer-generation`, `write-beat`, `write-beats`, `pick-version`, `read-generation`,
`finish-generation`), so an external client can run the studio's flow, beat by beat, with the
person steering between calls; `generate-artifact` is the same flow in one call for a client that
wants the piece whole. The content edits (`add-section`, `rewrite-section`, `edit-artifact`,
`revise-element`, the structure tools) and the workspace verbs (`create-artifact`, `rename-`,
`move-`, `trash-`, `restore-artifact`) complete it.

The writes are gated by scope rather than by absence: a token granted `artifacts:read` still sees
them in `tools/list` and is told what to step up to, which is what makes the read-only case
genuinely read-only rather than merely undiscoverable.

Off the surface by decision: `apply-patch` (a delegated caller's changes land through the tools
that make them, not through a raw patch), `ask-assistant` (a client brings its own model),
`share-artifact` and `export-artifact` (both route to guarded UI), `duplicate-artifact`,
`create-folder`, the media and speech calls (a client's own picture pipeline is not Galleo's to
bill), `read-file`, `refine-prompt`, `search-context`, `rewrite-passage` and `reimage` (the last
two target by a find string the agent copies, which needs the agent).

Two fields on `ToolMeta` carry the review annotations: **`effect`** (`read` / `write` /
`destructive`, absent meaning `write`) becomes `readOnlyHint` and `destructiveHint`; **`public`**
marks a tool that runs with no account and no workspace, today `find-templates` alone.

**Output schemas.** Every tool on the `mcp` and `api` surfaces declares an `output` zod schema in
`TOOL_SPEC` beside its `input`, structural rather than exhaustive: a section or an artifact is
described to its envelope and the element tree inside stays open, the way the section schema
leaves `data` open. `tools/list` publishes it as `outputSchema`, wrapped in the same
`{ workspace?, artifact?, result }` envelope `structuredContent` carries; `GET /api/v1/tools`
publishes the same schemas as JSON Schema beside the scope each tool takes. Both surfaces check an
answer against the declared shape and report a mismatch as a server fault rather than failing the
call, since the contract broken is ours. `check:tools` fails a tool published to either surface
without one.

## The effect path

An external caller has no browser. The product's own surfaces hold the document in the browser
and apply patches there, which keeps the AI server stateless for an artifact; a delegated caller
needs the server to do that for it.

`services/core/delegated.ts` is the one function both delegated surfaces call. It decides the
workspace a call lands in, runs the tool through the executor, and turns the outcome's `patches`
into an effect: for a tool acting on an artifact it loads the stored tree (`loadContent`) and
lands the patch with `commitPatch`, which writes it as the section ops the REST route writes
(`toSectionOps` in `@model/ai`: apply the patch, diff, and the ops fall out), in the same
transaction that bumps `artifacts.seq`, and publishes those ops to the room, so someone editing
live sees the change arrive as ops rather than as a resync. A patch that names a section the
stored document no longer has is a conflict, answered as a refusal rather than an overwrite. It
performs a `WorkspaceAction` rather than describing one. `create-artifact` (`CREATES`) commits a piece that
did not exist before with `commitNew`. A generation needs none of that: the executor applied its
patches through the `GenerationStore` as they were yielded, so a `write-beat` over MCP has already
landed in the draft by the time the outcome comes back, and `read-generation` reads the same row
the studio would.

`INSPECTS` marks a read that needs the tree handed to its body (`show-sections`), and `RENDERS` a
result worth painting rather than describing, which is what the component below is for.

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

1. ~~The executor.~~ Built, and every route runs through it: `/ai/turn` streams any tool, and
   `/ai/suggest`, `/ai/element`, `/ai/text`, `/ai/refine`, `/ai/notes`, `/ai/theme`, the media,
   narration, voice and context routes call `runTool` rather than a tool body beside their own
   `reserve`. `check:tools` enforces both halves and its ALLOW list is empty.
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
8. ~~The widget entry, the two component templates, the `ui://` resources.~~ Built:
   `ui://galleo/artifact` paints a section stack with the real engine, and `ui://galleo/list` paints
   either a library grid (`find-artifacts`) or a section carousel (`show-sections`). One script
   serves both, since everything around the two paints is identical and a second entry would ship
   the layout engine twice.
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
- **Whether MCP is plan-gated.** Decided: it is not. `apiAccess` gates one thing, minting a workspace
  machine credential, which stays Premium. Inheriting it on the connector path would have made a store
  listing useless as an acquisition channel, since a new user would install the app and hit an upgrade
  wall. The connector path relies on the credit meter instead, which already exists.
- **Whether a headless credential should default to every scope.** `machineGrant` grants all of
  `TOOL_SCOPES` when a `client_credentials` exchange names none, and the settings UI offers no scope
  picker, so a key minted there can delete. That is the opposite of the browser path, which
  advertises `artifacts:read` alone and makes everything else a step-up. Not decided.
