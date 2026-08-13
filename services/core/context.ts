import { and, cosineDistance, desc, eq, inArray, isNull, notInArray, sql } from "drizzle-orm";
import type { ArtifactContent } from "@model/artifact";
import { TEMPLATE_INDEX } from "@model/templates";
import { db } from "../db/client";
import { schema } from "../db/schema";
import { chunkText, assemblePack, type RetrievedChunk } from "./context-text";
import { embedTexts, type Embedder } from "./ai/embed";
import { extractArtifactText } from "./ai/run";
import { templateBody } from "./templates";
import { fetchWebpage } from "../utils/webpage";

// The context library: reusable, workspace-shared grounding built from files, links, artifacts,
// and pasted text — one ingestion path (extract → chunk → embed) whatever the source, and one
// retrieval path back out. `embed` is injectable so the database paths test without a model call.

export type ContextItemKind = "file" | "link" | "artifact" | "template" | "text";

export interface ContextSummary {
    id: string;
    name: string;
    description: string | null;
    items: number;
    clusters: number[]; // chunk count per source, newest first — the list card's constellation
    updatedAt: string;
}

export interface ContextItemMeta {
    id: string;
    kind: ContextItemKind;
    title: string;
    ref: string | null;
    chars: number;
    chunks: number;
    createdAt: string;
}

// one item can't swallow the store (~50 chunks at the default size); extraction shares the budget
export const BODY_CAP = 200_000;

const CLUSTER_CAP = 12; // a list card draws at most this many source clusters

export async function listContexts(workspaceId: string): Promise<ContextSummary[]> {
    const rows = await db
        .select({
            id: schema.contexts.id,
            name: schema.contexts.name,
            description: schema.contexts.description,
            updatedAt: schema.contexts.updatedAt,
            items: sql<number>`count(${schema.contextItems.id})::int`,
        })
        .from(schema.contexts)
        .leftJoin(schema.contextItems, eq(schema.contextItems.contextId, schema.contexts.id))
        .where(eq(schema.contexts.workspaceId, workspaceId))
        .groupBy(schema.contexts.id)
        .orderBy(desc(schema.contexts.updatedAt));
    const clusters = new Map<string, number[]>();
    if (rows.length) {
        const perItem = await db
            .select({
                contextId: schema.contextItems.contextId,
                chunks: sql<number>`count(${schema.chunks.id})::int`,
            })
            .from(schema.contextItems)
            .leftJoin(schema.chunks, eq(schema.chunks.refId, schema.contextItems.id))
            .where(
                inArray(
                    schema.contextItems.contextId,
                    rows.map((r) => r.id),
                ),
            )
            .groupBy(schema.contextItems.id, schema.contextItems.contextId)
            .orderBy(desc(schema.contextItems.createdAt));
        for (const row of perItem) {
            const list = clusters.get(row.contextId) ?? [];
            if (list.length < CLUSTER_CAP) list.push(row.chunks);
            clusters.set(row.contextId, list);
        }
    }
    return rows.map((r) => ({
        ...r,
        clusters: clusters.get(r.id) ?? [],
        updatedAt: r.updatedAt.toISOString(),
    }));
}

export async function createContext(
    workspaceId: string,
    userId: string,
    name: string,
    description?: string,
): Promise<{ id: string }> {
    const [row] = await db
        .insert(schema.contexts)
        .values({ workspaceId, name, description: description ?? null, createdBy: userId })
        .returning({ id: schema.contexts.id });
    return { id: row!.id };
}

async function ownedContext(workspaceId: string, contextId: string): Promise<void> {
    const [row] = await db
        .select({ id: schema.contexts.id })
        .from(schema.contexts)
        .where(
            and(eq(schema.contexts.id, contextId), eq(schema.contexts.workspaceId, workspaceId)),
        );
    if (!row) throw new Error("no such context");
}

export async function getContextItems(
    workspaceId: string,
    contextId: string,
): Promise<ContextItemMeta[]> {
    await ownedContext(workspaceId, contextId);
    const rows = await db
        .select({
            id: schema.contextItems.id,
            kind: schema.contextItems.kind,
            title: schema.contextItems.title,
            ref: schema.contextItems.ref,
            chars: schema.contextItems.chars,
            chunks: sql<number>`count(${schema.chunks.id})::int`,
            createdAt: schema.contextItems.createdAt,
        })
        .from(schema.contextItems)
        .leftJoin(schema.chunks, eq(schema.chunks.refId, schema.contextItems.id))
        .where(eq(schema.contextItems.contextId, contextId))
        .groupBy(schema.contextItems.id)
        .orderBy(desc(schema.contextItems.createdAt));
    return rows.map((r) => ({
        ...r,
        kind: r.kind as ContextItemKind,
        createdAt: r.createdAt.toISOString(),
    }));
}

export async function updateContext(
    workspaceId: string,
    contextId: string,
    patch: { name?: string; description?: string | null },
): Promise<void> {
    await ownedContext(workspaceId, contextId);
    const set: { name?: string; description?: string | null; updatedAt: Date } = {
        updatedAt: new Date(),
    };
    if (patch.name !== undefined) set.name = patch.name.trim().slice(0, 120) || "Untitled";
    if (patch.description !== undefined)
        set.description = patch.description?.trim().slice(0, 500) || null;
    await db.update(schema.contexts).set(set).where(eq(schema.contexts.id, contextId));
}

export async function deleteContext(workspaceId: string, contextId: string): Promise<void> {
    await ownedContext(workspaceId, contextId);
    const items = await db
        .select({ id: schema.contextItems.id })
        .from(schema.contextItems)
        .where(eq(schema.contextItems.contextId, contextId));
    if (items.length)
        await db.delete(schema.chunks).where(
            inArray(
                schema.chunks.refId,
                items.map((i) => i.id),
            ),
        );
    await db.delete(schema.contexts).where(eq(schema.contexts.id, contextId)); // items cascade
}

async function indexItem(
    workspaceId: string,
    itemId: string,
    body: string,
    embed: Embedder,
): Promise<number> {
    const pieces = chunkText(body);
    const vectors = await embed(pieces, "doc");
    await db.delete(schema.chunks).where(eq(schema.chunks.refId, itemId));
    if (pieces.length)
        await db.insert(schema.chunks).values(
            pieces.map((text, seq) => ({
                workspaceId,
                scope: "context",
                refId: itemId,
                seq,
                text,
                embedding: vectors[seq]!,
            })),
        );
    return pieces.length;
}

interface NewItem {
    kind: ContextItemKind;
    title: string;
    ref?: string;
    body: string;
}

async function insertItem(
    workspaceId: string,
    contextId: string,
    userId: string,
    item: NewItem,
    embed: Embedder,
): Promise<ContextItemMeta> {
    const body = item.body.trim().slice(0, BODY_CAP);
    if (!body) throw new Error("there was no text to add");
    const [row] = await db
        .insert(schema.contextItems)
        .values({
            contextId,
            kind: item.kind,
            title: item.title.trim().slice(0, 200) || "Untitled",
            ref: item.ref ?? null,
            body,
            chars: body.length,
            addedBy: userId,
        })
        .returning({ id: schema.contextItems.id, createdAt: schema.contextItems.createdAt });
    const chunks = await indexItem(workspaceId, row!.id, body, embed);
    await db
        .update(schema.contexts)
        .set({ updatedAt: new Date() })
        .where(eq(schema.contexts.id, contextId));
    return {
        id: row!.id,
        kind: item.kind,
        title: item.title,
        ref: item.ref ?? null,
        chars: body.length,
        chunks,
        createdAt: row!.createdAt.toISOString(),
    };
}

/** File uploads and pasted text: the client already extracted the text, exactly like the intake. */
export async function addTextItem(
    workspaceId: string,
    contextId: string,
    userId: string,
    kind: "file" | "text",
    title: string,
    body: string,
    embed: Embedder = embedTexts,
): Promise<ContextItemMeta> {
    await ownedContext(workspaceId, contextId);
    return insertItem(workspaceId, contextId, userId, { kind, title, body }, embed);
}

/** A link: fetched SSRF-safely, reduced to page text, snapshotted at add time. */
export async function addLinkItem(
    workspaceId: string,
    contextId: string,
    userId: string,
    url: string,
    embed: Embedder = embedTexts,
): Promise<ContextItemMeta> {
    await ownedContext(workspaceId, contextId);
    const page = await fetchWebpage(url);
    return insertItem(
        workspaceId,
        contextId,
        userId,
        { kind: "link", title: page.title, ref: page.finalUrl, body: page.text },
        embed,
    );
}

async function artifactBody(
    workspaceId: string,
    artifactId: string,
): Promise<{ title: string; body: string }> {
    const [row] = await db
        .select({
            title: schema.artifacts.title,
            draftContent: schema.artifacts.draftContent,
        })
        .from(schema.artifacts)
        .where(
            and(
                eq(schema.artifacts.id, artifactId),
                eq(schema.artifacts.workspaceId, workspaceId),
                isNull(schema.artifacts.trashedAt),
            ),
        );
    if (!row) throw new Error("no such artifact in this workspace");
    const body = extractArtifactText(row.draftContent as ArtifactContent);
    return { title: row.title, body: `${row.title}\n\n${body}` };
}

/** A library artifact: its text extracted the same way search indexing extracts it. */
export async function addArtifactItem(
    workspaceId: string,
    contextId: string,
    userId: string,
    artifactId: string,
    embed: Embedder = embedTexts,
): Promise<ContextItemMeta> {
    await ownedContext(workspaceId, contextId);
    const { title, body } = await artifactBody(workspaceId, artifactId);
    return insertItem(
        workspaceId,
        contextId,
        userId,
        { kind: "artifact", title, ref: artifactId, body },
        embed,
    );
}

function templateText(templateId: string): { title: string; body: string } {
    const entry = TEMPLATE_INDEX.find((t) => t.id === templateId);
    const content = templateBody(templateId);
    if (!entry || !content) throw new Error("no such template");
    return { title: entry.name, body: `${entry.name}\n\n${extractArtifactText(content)}` };
}

/** A starter template: same extraction as an artifact, but resolved from the curated catalog. */
export async function addTemplateItem(
    workspaceId: string,
    contextId: string,
    userId: string,
    templateId: string,
    embed: Embedder = embedTexts,
): Promise<ContextItemMeta> {
    await ownedContext(workspaceId, contextId);
    const { title, body } = templateText(templateId);
    return insertItem(
        workspaceId,
        contextId,
        userId,
        { kind: "template", title, ref: templateId, body },
        embed,
    );
}

async function ownedItem(
    workspaceId: string,
    contextId: string,
    itemId: string,
): Promise<{ kind: ContextItemKind; ref: string | null }> {
    await ownedContext(workspaceId, contextId);
    const [row] = await db
        .select({ kind: schema.contextItems.kind, ref: schema.contextItems.ref })
        .from(schema.contextItems)
        .where(
            and(eq(schema.contextItems.id, itemId), eq(schema.contextItems.contextId, contextId)),
        );
    if (!row) throw new Error("no such item");
    return { kind: row.kind as ContextItemKind, ref: row.ref };
}

/** The stored original text, for the human-facing viewer — chunks are the machine's view of it. */
export async function getItemBody(
    workspaceId: string,
    contextId: string,
    itemId: string,
): Promise<string> {
    await ownedContext(workspaceId, contextId);
    const [row] = await db
        .select({ body: schema.contextItems.body })
        .from(schema.contextItems)
        .where(
            and(eq(schema.contextItems.id, itemId), eq(schema.contextItems.contextId, contextId)),
        );
    if (!row) throw new Error("no such item");
    return row.body;
}

export async function removeItem(
    workspaceId: string,
    contextId: string,
    itemId: string,
): Promise<void> {
    await ownedItem(workspaceId, contextId, itemId);
    await db.delete(schema.chunks).where(eq(schema.chunks.refId, itemId));
    await db.delete(schema.contextItems).where(eq(schema.contextItems.id, itemId));
}

/** Re-snapshot a link or artifact item from its source; file/text items have nothing to re-read. */
export async function resyncItem(
    workspaceId: string,
    contextId: string,
    itemId: string,
    embed: Embedder = embedTexts,
): Promise<void> {
    const item = await ownedItem(workspaceId, contextId, itemId);
    let next: { title: string; body: string } | null = null;
    if (item.kind === "link" && item.ref) {
        const page = await fetchWebpage(item.ref);
        next = { title: page.title, body: page.text };
    } else if (item.kind === "artifact" && item.ref) {
        next = await artifactBody(workspaceId, item.ref);
    } else if (item.kind === "template" && item.ref) {
        next = templateText(item.ref);
    }
    if (!next) return;
    const body = next.body.trim().slice(0, BODY_CAP);
    await db
        .update(schema.contextItems)
        .set({ title: next.title.trim().slice(0, 200) || "Untitled", body, chars: body.length })
        .where(eq(schema.contextItems.id, itemId));
    await indexItem(workspaceId, itemId, body, embed);
}

const RETRIEVE_K = 12;

/** Top-k chunks across the given contexts for one query, best-first, workspace-scoped. */
export async function retrieveContext(
    workspaceId: string,
    contextIds: string[],
    query: string,
    embed: Embedder = embedTexts,
): Promise<RetrievedChunk[]> {
    if (!contextIds.length || !query.trim()) return [];
    const [vector] = await embed([query.slice(0, 2000)], "query");
    if (!vector) return [];
    const distance = cosineDistance(schema.chunks.embedding, vector);
    const rows = await db
        .select({
            title: schema.contextItems.title,
            kind: schema.contextItems.kind,
            text: schema.chunks.text,
        })
        .from(schema.chunks)
        .innerJoin(schema.contextItems, eq(schema.contextItems.id, schema.chunks.refId))
        .where(
            and(
                eq(schema.chunks.workspaceId, workspaceId),
                eq(schema.chunks.scope, "context"),
                inArray(schema.contextItems.contextId, contextIds),
            ),
        )
        .orderBy(distance)
        .limit(RETRIEVE_K);
    return rows;
}

export interface ContextRetriever {
    pack: (query: string) => Promise<string | null>;
}

/** The turn-level seam: routes build one per request; run.ts calls pack() per outline/section. */
export function makeContextRetriever(
    workspaceId: string,
    contextIds: string[],
    embed: Embedder = embedTexts,
): ContextRetriever | null {
    if (!contextIds.length) return null;
    return {
        pack: async (query) =>
            assemblePack(await retrieveContext(workspaceId, contextIds, query, embed)),
    };
}

// ---- Conversation memory: the chat thread's durable, retrievable record ----

const RECENT_SKIP = 16; // the client replays the newest turns verbatim; recall covers what's older
const RECALL_K = 6;

export async function recordChatExchange(
    workspaceId: string,
    artifactId: string | null,
    turns: { role: "user" | "assistant"; text: string }[],
    embed: Embedder = embedTexts,
): Promise<void> {
    for (const turn of turns) {
        const text = turn.text.trim().slice(0, 20_000);
        if (!text) continue;
        const [row] = await db
            .insert(schema.chatMessages)
            .values({ workspaceId, artifactId, role: turn.role, text })
            .returning({ id: schema.chatMessages.id });
        const pieces = chunkText(text);
        const vectors = await embed(pieces, "doc");
        if (pieces.length)
            await db.insert(schema.chunks).values(
                pieces.map((t, seq) => ({
                    workspaceId,
                    scope: "chat",
                    refId: row!.id,
                    seq,
                    text: t,
                    embedding: vectors[seq]!,
                })),
            );
    }
}

/** Relevant exchanges from OLDER conversation than the client's verbatim window. */
export async function recallConversation(
    workspaceId: string,
    artifactId: string | null,
    query: string,
    embed: Embedder = embedTexts,
): Promise<string | null> {
    const key = artifactId
        ? eq(schema.chatMessages.artifactId, artifactId)
        : isNull(schema.chatMessages.artifactId);
    const recent = await db
        .select({ id: schema.chatMessages.id })
        .from(schema.chatMessages)
        .where(and(eq(schema.chatMessages.workspaceId, workspaceId), key))
        .orderBy(desc(schema.chatMessages.createdAt))
        .limit(RECENT_SKIP);
    const [vector] = await embed([query.slice(0, 2000)], "query");
    if (!vector) return null;
    const distance = cosineDistance(schema.chunks.embedding, vector);
    const rows = await db
        .select({
            role: schema.chatMessages.role,
            text: schema.chunks.text,
        })
        .from(schema.chunks)
        .innerJoin(schema.chatMessages, eq(schema.chatMessages.id, schema.chunks.refId))
        .where(
            and(
                eq(schema.chunks.workspaceId, workspaceId),
                eq(schema.chunks.scope, "chat"),
                key,
                recent.length
                    ? notInArray(
                          schema.chunks.refId,
                          recent.map((r) => r.id),
                      )
                    : undefined,
            ),
        )
        .orderBy(distance)
        .limit(RECALL_K);
    if (!rows.length) return null;
    return rows.map((r) => `${r.role === "user" ? "They said" : "You said"}: ${r.text}`).join("\n");
}
