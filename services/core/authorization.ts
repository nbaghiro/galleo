import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { and, desc, eq, isNull, lt, or } from "drizzle-orm";
import type { ToolScope } from "@model/tools";
import type { ConnectedApp } from "@model/workspace";
import { isToolScope, TOOL_SCOPES } from "@model/tools";
import { db } from "@services/db/client";
import { schema } from "@services/db/schema";
import { digest } from "@services/utils/auth";
import { capture } from "@services/utils/analytics";

// Galleo as an OAuth 2.1 authorization server, for the MCP endpoint. `services/api/oauth.ts` is the
// opposite direction (Galleo as a client of Google), which is why neither file reuses the other's
// vocabulary.

// The scope vocabulary is the tool catalog's, not this file's: what a token may do is stated per
// tool in @model/tools, so a tool joining a surface declares its permission in the same diff.
export const SCOPES = TOOL_SCOPES;
export type Scope = ToolScope;

// The minimum a client needs for basic functionality; the rest is asked for through the step-up
// flow, which is what keeps a read-only client from holding write permission it never uses.
export const BASE_SCOPES: Scope[] = ["artifacts:read"];

const CODE_TTL_MS = 10 * 60 * 1000;
// how stale `last_used_at` may get; it answers "is this connection live", not "when exactly"
const USED_AT_GRANULARITY_MS = 60 * 1000;
const ACCESS_TTL_MS = 60 * 60 * 1000;
const REFRESH_TTL_MS = 90 * 24 * 60 * 60 * 1000;

const token = (): string => randomBytes(32).toString("base64url");
const s256 = (v: string): string => createHash("sha256").update(v).digest("base64url");

export const isScope = isToolScope;
// `offline_access` is a client's way of asking for a refresh token rather than a permission over
// anything here, so it parses away rather than being stored.
export const parseScopes = (raw: string | undefined): Scope[] =>
    (raw ?? "").split(/\s+/).filter((s): s is Scope => isToolScope(s));

export interface OAuthClient {
    clientId: string;
    name: string;
    redirectUris: string[];
}

export async function registerClient(input: {
    name: string;
    redirectUris: string[];
    source: "dynamic" | "metadata" | "static";
    clientId?: string;
}): Promise<OAuthClient> {
    const clientId = input.clientId ?? `galleo-${randomBytes(16).toString("hex")}`;
    const [row] = await db
        .insert(schema.oauthClients)
        .values({
            clientId,
            name: input.name,
            redirectUris: input.redirectUris,
            source: input.source,
        })
        .onConflictDoNothing({ target: schema.oauthClients.clientId })
        .returning();
    return row
        ? { clientId: row.clientId, name: row.name, redirectUris: row.redirectUris }
        : ((await findClient(clientId)) as OAuthClient);
}

//
// A client identifies itself by an https URL that serves its own metadata, instead of registering a
// row here first. The spec now prefers this over dynamic registration, and the practical reason is
// visible in Claude's own connector dialog: DCR writes a client row per user who connects, while a
// metadata document is one URL shared by all of them and portable across authorization servers.
//
// The document is fetched from a URL the caller chose, so this is a request-forgery surface. It is
// narrowed to https with a path, no redirects followed, a deadline, a size cap, and no hostname
// that could name something inside our own network.

const CIMD_TIMEOUT_MS = 5_000;
const CIMD_MAX_BYTES = 64 * 1024;
const CIMD_DEFAULT_TTL_MS = 15 * 60_000;
const CIMD_MAX_TTL_MS = 24 * 60 * 60_000;

const PRIVATE_HOST =
    /^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[|0\.)|\.local$|\.internal$/i;

/** An https URL with a path component, which is what the spec says a metadata client id looks like. */
export function isMetadataClientId(id: string): boolean {
    let url: URL;
    try {
        url = new URL(id);
    } catch {
        return false;
    }
    return url.protocol === "https:" && url.pathname.length > 1 && !url.hash && !url.search;
}

interface Cached {
    client: OAuthClient;
    until: number;
}
const cimdCache = new Map<string, Cached>();

// respects the document's own cache header, which the spec asks for, inside our own ceiling
function ttlFrom(header: string | null): number {
    const max = /max-age=(\d+)/i.exec(header ?? "")?.[1];
    if (!max) return CIMD_DEFAULT_TTL_MS;
    return Math.min(Math.max(Number(max) * 1000, 0), CIMD_MAX_TTL_MS);
}

async function fetchMetadataClient(clientId: string): Promise<OAuthClient | null> {
    const hit = cimdCache.get(clientId);
    if (hit && hit.until > Date.now()) return hit.client;
    if (PRIVATE_HOST.test(new URL(clientId).hostname)) return null;

    let res: Response;
    try {
        res = await fetch(clientId, {
            headers: { accept: "application/json" },
            redirect: "error", // a redirect could point back inside the network this runs in
            signal: AbortSignal.timeout(CIMD_TIMEOUT_MS),
        });
    } catch {
        return null;
    }
    if (!res.ok) return null;
    const body = await res.text().catch(() => "");
    if (!body || body.length > CIMD_MAX_BYTES) return null;

    let doc: unknown;
    try {
        doc = JSON.parse(body);
    } catch {
        return null;
    }
    const d = doc as { client_id?: unknown; client_name?: unknown; redirect_uris?: unknown };
    // the three the spec requires, and the identity check that makes the document belong to its url
    if (d.client_id !== clientId) return null;
    if (typeof d.client_name !== "string" || !d.client_name) return null;
    if (!Array.isArray(d.redirect_uris) || !d.redirect_uris.length) return null;
    const redirectUris = d.redirect_uris.filter((u): u is string => typeof u === "string");
    if (!redirectUris.length) return null;

    const client: OAuthClient = {
        clientId,
        name: d.client_name.slice(0, 80),
        redirectUris,
    };
    cimdCache.set(clientId, {
        client,
        until: Date.now() + ttlFrom(res.headers.get("cache-control")),
    });
    return client;
}

/**
 * The client behind an id, however it identified itself: a metadata document it hosts, or a row it
 * registered. Every caller resolves through here so the two are indistinguishable downstream.
 */
export async function resolveClient(clientId: string): Promise<OAuthClient | null> {
    return isMetadataClientId(clientId) ? fetchMetadataClient(clientId) : findClient(clientId);
}

export async function findClient(clientId: string): Promise<OAuthClient | null> {
    const [row] = await db
        .select()
        .from(schema.oauthClients)
        .where(eq(schema.oauthClients.clientId, clientId));
    return row ? { clientId: row.clientId, name: row.name, redirectUris: row.redirectUris } : null;
}

export interface ConsentGrant {
    clientId: string;
    userId: string;
    workspaceIds: string[];
    defaultWorkspaceId: string;
    scopes: Scope[];
    resource: string;
    codeChallenge: string;
    redirectUri: string;
}

export async function issueCode(grant: ConsentGrant): Promise<string> {
    const code = token();
    await db.insert(schema.oauthAuthorizations).values({
        codeHash: digest(code),
        clientId: grant.clientId,
        userId: grant.userId,
        workspaceIds: grant.workspaceIds,
        defaultWorkspaceId: grant.defaultWorkspaceId,
        scopes: grant.scopes,
        resource: grant.resource,
        codeChallenge: grant.codeChallenge,
        redirectUri: grant.redirectUri,
        expiresAt: new Date(Date.now() + CODE_TTL_MS),
    });
    return code;
}

export interface IssuedTokens {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
    scopes: Scope[];
}

async function mint(row: {
    clientId: string;
    userId: string;
    workspaceIds: string[];
    defaultWorkspaceId: string;
    scopes: Scope[];
    resource: string;
    familyId?: string;
    // A machine credential is itself the durable secret, so rotating a refresh token beside it would
    // be a second thing to look after for no gain.
    refresh?: boolean;
    // Which door the token came through. Every token is minted here, so a grant type added later is
    // reported without the endpoint having to remember to say so.
    via: "authorization_code" | "refresh_token" | "client_credentials";
}): Promise<IssuedTokens> {
    const accessToken = token();
    const refreshToken = row.refresh === false ? "" : token();
    await db.insert(schema.oauthTokens).values({
        clientId: row.clientId,
        userId: row.userId,
        workspaceIds: row.workspaceIds,
        defaultWorkspaceId: row.defaultWorkspaceId,
        scopes: row.scopes,
        resource: row.resource,
        // absent on a first mint, so the column default opens a new family
        ...(row.familyId ? { familyId: row.familyId } : {}),
        accessHash: digest(accessToken),
        refreshHash: refreshToken ? digest(refreshToken) : null,
        expiresAt: new Date(Date.now() + ACCESS_TTL_MS),
    });
    capture({ userId: row.userId, workspaceId: row.defaultWorkspaceId }, "connector_token_issued", {
        client_id: row.clientId,
        grant: row.via,
        scopes: row.scopes,
        workspace_count: row.workspaceIds.length,
    });
    return { accessToken, refreshToken, expiresIn: ACCESS_TTL_MS / 1000, scopes: row.scopes };
}

const sameString = (a: string, b: string): boolean => {
    const x = Buffer.from(a);
    const y = Buffer.from(b);
    return x.length === y.length && timingSafeEqual(x, y);
};

export type ExchangeError = "invalid_grant" | "invalid_client";

export async function exchangeCode(input: {
    code: string;
    verifier: string;
    clientId: string;
    redirectUri: string;
}): Promise<IssuedTokens | ExchangeError> {
    const [row] = await db
        .select()
        .from(schema.oauthAuthorizations)
        .where(eq(schema.oauthAuthorizations.codeHash, digest(input.code)));
    if (!row || row.consumedAt || row.expiresAt.getTime() < Date.now()) return "invalid_grant";
    if (row.clientId !== input.clientId) return "invalid_client";
    if (row.redirectUri !== input.redirectUri) return "invalid_grant";
    if (!sameString(s256(input.verifier), row.codeChallenge)) return "invalid_grant";
    // consumed before the tokens are minted, so a replay racing the first exchange loses
    const claimed = await db
        .update(schema.oauthAuthorizations)
        .set({ consumedAt: new Date() })
        .where(
            and(
                eq(schema.oauthAuthorizations.id, row.id),
                isNull(schema.oauthAuthorizations.consumedAt),
            ),
        )
        .returning({ id: schema.oauthAuthorizations.id });
    if (!claimed.length) return "invalid_grant";
    return mint({
        clientId: row.clientId,
        userId: row.userId,
        workspaceIds: row.workspaceIds,
        defaultWorkspaceId: row.defaultWorkspaceId,
        scopes: row.scopes.filter(isScope),
        resource: row.resource,
        via: "authorization_code",
    });
}

export async function refreshTokens(
    refreshToken: string,
    clientId: string,
): Promise<IssuedTokens | ExchangeError> {
    const [row] = await db
        .select()
        .from(schema.oauthTokens)
        .where(eq(schema.oauthTokens.refreshHash, digest(refreshToken)));
    if (!row) return "invalid_grant";
    if (row.clientId !== clientId) return "invalid_client";
    // A spent refresh token being presented again is not a mistake a well-behaved client makes: the
    // one that rotated it holds the successor. So the whole family goes, and both the thief and the
    // legitimate client are forced back through consent, which is the only way to tell them apart.
    if (row.revokedAt) {
        await revokeFamily(row.familyId);
        return "invalid_grant";
    }
    // the access token's own expiry is short; this is the outer bound on the pair as a whole
    if (row.createdAt.getTime() + REFRESH_TTL_MS < Date.now()) return "invalid_grant";
    // rotation: the old pair dies with the new one's birth, so a stolen refresh token is single use
    await db
        .update(schema.oauthTokens)
        .set({ revokedAt: new Date() })
        .where(eq(schema.oauthTokens.id, row.id));
    return mint({
        clientId: row.clientId,
        userId: row.userId,
        workspaceIds: row.workspaceIds,
        defaultWorkspaceId: row.defaultWorkspaceId,
        scopes: row.scopes.filter(isScope),
        resource: row.resource,
        familyId: row.familyId,
        via: "refresh_token",
    });
}

/** Every live token minted from one consent, dead at once. */
export async function revokeFamily(familyId: string): Promise<void> {
    await db
        .update(schema.oauthTokens)
        .set({ revokedAt: new Date() })
        .where(
            and(eq(schema.oauthTokens.familyId, familyId), isNull(schema.oauthTokens.revokedAt)),
        );
}

export interface AccessGrant {
    userId: string;
    workspaceIds: string[];
    defaultWorkspaceId: string;
    scopes: Scope[];
}

// A token is a credential for one audience. Presenting it somewhere else is what resource
// indicators exist to stop, so the check is here rather than at the transport: every reader of a
// token gets it. A machine token carries "" (services/api/v1.ts mints it that way, there being no
// MCP endpoint it was bound to) and is accepted.
export async function verifyAccessToken(
    raw: string,
    resource: string,
): Promise<AccessGrant | null> {
    const [row] = await db
        .select()
        .from(schema.oauthTokens)
        .where(eq(schema.oauthTokens.accessHash, digest(raw)));
    if (!row || row.revokedAt || row.expiresAt.getTime() < Date.now()) return null;
    if (row.resource && row.resource !== resource) return null;
    // one write per token per minute rather than one per call: this records that a connection is
    // live, and a connected-apps list cannot tell the difference
    if (!row.lastUsedAt || Date.now() - row.lastUsedAt.getTime() > USED_AT_GRANULARITY_MS)
        await db
            .update(schema.oauthTokens)
            .set({ lastUsedAt: new Date() })
            .where(eq(schema.oauthTokens.id, row.id));
    return {
        userId: row.userId,
        workspaceIds: row.workspaceIds,
        defaultWorkspaceId: row.defaultWorkspaceId,
        scopes: row.scopes.filter(isScope),
    };
}

// One row per client rather than per token, because a client that has been running for a month has
// rotated its pair dozens of times and none of that is the person's business.
export async function appsFor(userId: string): Promise<ConnectedApp[]> {
    const rows = await db
        .select({
            clientId: schema.oauthTokens.clientId,
            scopes: schema.oauthTokens.scopes,
            workspaceIds: schema.oauthTokens.workspaceIds,
            lastUsedAt: schema.oauthTokens.lastUsedAt,
            createdAt: schema.oauthTokens.createdAt,
            name: schema.oauthClients.name,
        })
        .from(schema.oauthTokens)
        .leftJoin(
            schema.oauthClients,
            eq(schema.oauthClients.clientId, schema.oauthTokens.clientId),
        )
        .where(and(eq(schema.oauthTokens.userId, userId), isNull(schema.oauthTokens.revokedAt)))
        .orderBy(desc(schema.oauthTokens.createdAt));
    const byClient = new Map<string, ConnectedApp>();
    for (const r of rows) {
        const seen = byClient.get(r.clientId);
        if (seen) {
            // the newest row carries the current grant; older ones only widen what it has reached
            for (const s of r.scopes.filter(isScope))
                if (!seen.scopes.includes(s)) seen.scopes.push(s);
            if (r.lastUsedAt && (!seen.lastUsedAt || r.lastUsedAt.toISOString() > seen.lastUsedAt))
                seen.lastUsedAt = r.lastUsedAt.toISOString();
            seen.connectedAt = r.createdAt.toISOString();
            continue;
        }
        byClient.set(r.clientId, {
            clientId: r.clientId,
            name: r.name ?? "Unknown client",
            scopes: r.scopes.filter(isScope),
            workspaceIds: r.workspaceIds,
            lastUsedAt: r.lastUsedAt?.toISOString() ?? null,
            connectedAt: r.createdAt.toISOString(),
        });
    }
    return [...byClient.values()];
}

/** Disconnects one client from this account. False when there was nothing live to disconnect. */
export async function revokeApp(userId: string, clientId: string): Promise<boolean> {
    const gone = await db
        .update(schema.oauthTokens)
        .set({ revokedAt: new Date() })
        .where(
            and(
                eq(schema.oauthTokens.userId, userId),
                eq(schema.oauthTokens.clientId, clientId),
                isNull(schema.oauthTokens.revokedAt),
            ),
        )
        .returning({ id: schema.oauthTokens.id });
    if (gone.length)
        capture({ userId }, "connector_disconnected", { client_id: clientId, from: "settings" });
    return gone.length > 0;
}

/**
 * RFC 7009: a client handing back a credential it is done with. Either half of the pair names the
 * row, and revoking one revokes the family, because a client disconnecting means all of it.
 */
export async function revokeToken(raw: string, clientId: string): Promise<void> {
    const [row] = await db
        .select({
            familyId: schema.oauthTokens.familyId,
            clientId: schema.oauthTokens.clientId,
            userId: schema.oauthTokens.userId,
        })
        .from(schema.oauthTokens)
        .where(
            or(
                eq(schema.oauthTokens.accessHash, digest(raw)),
                eq(schema.oauthTokens.refreshHash, digest(raw)),
            ),
        );
    // an unknown or someone else's token answers 200 all the same: the endpoint must not be a way
    // to ask whether a token exists
    if (!row || row.clientId !== clientId) return;
    await revokeFamily(row.familyId);
    capture({ userId: row.userId }, "connector_disconnected", {
        client_id: clientId,
        from: "client",
    });
}

/**
 * Codes and tokens that can never be used again. Run from the connected-apps read rather than a
 * cron, which is the same shape the credit window uses: there is one natural moment a person looks
 * at this data, and that is when it is worth tidying.
 */
export async function purgeSpent(): Promise<void> {
    const now = new Date();
    await db
        .delete(schema.oauthAuthorizations)
        .where(
            or(
                lt(schema.oauthAuthorizations.expiresAt, now),
                lt(schema.oauthAuthorizations.consumedAt, new Date(now.getTime() - CODE_TTL_MS)),
            ),
        );
    await db
        .delete(schema.oauthTokens)
        .where(lt(schema.oauthTokens.createdAt, new Date(now.getTime() - REFRESH_TTL_MS)));
}

//
// The browser flow cannot serve an integration: there is nobody at a consent screen. A machine
// credential is issued once by a workspace admin and authenticates with a secret, which is the
// `client_credentials` grant. Fixing the workspace and the actor at issue is what makes it safe:
// the token that comes out has exactly the shape a browser grant produces, so nothing downstream
// has to know which door it came through, and the ledger attributes to a real member.

export interface MachineCredential {
    clientId: string;
    secret: string; // returned once, at creation, and never again
    name: string;
}

export async function createMachineClient(input: {
    name: string;
    workspaceId: string;
    actorId: string;
}): Promise<MachineCredential> {
    const clientId = `galleo-api-${randomBytes(12).toString("hex")}`;
    const secret = token();
    await db.insert(schema.oauthClients).values({
        clientId,
        name: input.name.slice(0, 80),
        redirectUris: [], // never redirects: there is no browser in this flow
        source: "machine",
        secretHash: digest(secret),
        workspaceId: input.workspaceId,
        actorId: input.actorId,
    });
    capture({ userId: input.actorId, workspaceId: input.workspaceId }, "api_credential_created", {
        client_id: clientId,
        credential_count_after: (await machineClientsFor(input.workspaceId)).length,
    });
    return { clientId, secret, name: input.name };
}

export interface MachineSummary {
    clientId: string;
    name: string;
    createdAt: Date;
    lastUsedAt: Date | null;
}

export async function machineClientsFor(workspaceId: string): Promise<MachineSummary[]> {
    const rows = await db
        .select()
        .from(schema.oauthClients)
        .where(
            and(
                eq(schema.oauthClients.workspaceId, workspaceId),
                eq(schema.oauthClients.source, "machine"),
                isNull(schema.oauthClients.revokedAt),
            ),
        );
    return rows.map((r) => ({
        clientId: r.clientId,
        name: r.name,
        createdAt: r.createdAt,
        lastUsedAt: r.lastUsedAt,
    }));
}

export async function revokeMachineClient(
    workspaceId: string,
    clientId: string,
    actorId: string,
): Promise<boolean> {
    const [row] = await db
        .update(schema.oauthClients)
        .set({ revokedAt: new Date() })
        .where(
            and(
                eq(schema.oauthClients.clientId, clientId),
                eq(schema.oauthClients.workspaceId, workspaceId),
                // one revocation per credential: a second call has nothing left to turn off, and
                // would otherwise report the credential dying twice
                isNull(schema.oauthClients.revokedAt),
            ),
        )
        .returning({
            createdAt: schema.oauthClients.createdAt,
            lastUsedAt: schema.oauthClients.lastUsedAt,
        });
    if (!row) return false;
    // its live tokens die with it, or a revoked credential would keep working for an hour
    await db
        .update(schema.oauthTokens)
        .set({ revokedAt: new Date() })
        .where(eq(schema.oauthTokens.clientId, clientId));
    capture({ userId: actorId, workspaceId }, "api_credential_revoked", {
        client_id: clientId,
        days_active: Math.round((Date.now() - row.createdAt.getTime()) / (24 * 3_600_000)),
        ever_used: !!row.lastUsedAt,
    });
    return true;
}

/** The `client_credentials` grant: a secret in, a token out, no person in the middle. */
export async function machineGrant(
    clientId: string,
    secret: string,
    wanted: Scope[],
): Promise<IssuedTokens | ExchangeError> {
    const [row] = await db
        .select()
        .from(schema.oauthClients)
        .where(eq(schema.oauthClients.clientId, clientId));
    if (!row || row.source !== "machine" || row.revokedAt) return "invalid_client";
    if (!row.secretHash || !row.workspaceId || !row.actorId) return "invalid_client";
    if (!sameString(digest(secret), row.secretHash)) return "invalid_client";
    await db
        .update(schema.oauthClients)
        .set({ lastUsedAt: new Date() })
        .where(eq(schema.oauthClients.id, row.id));
    // no refresh token: the credential itself is the durable thing, so a rotation would be a second
    // secret to look after for no gain
    return mint({
        clientId,
        userId: row.actorId,
        workspaceIds: [row.workspaceId],
        defaultWorkspaceId: row.workspaceId,
        scopes: wanted.length ? wanted : [...SCOPES],
        resource: "",
        refresh: false,
        via: "client_credentials",
    });
}
