import { and, eq, sql } from "drizzle-orm";
import type { ChatThread, ChatThreadMessage, ProposalMark, TurnEvent } from "@model/ai";
import { db } from "@services/db/client";
import { schema } from "@services/db/schema";

// The chat thread a person sees, kept per subject. `chat_messages` beside it is the recall index
// over the same words; this is what the dock reopens, cards included.

const MAX_MESSAGES = 200;

// What a turn streamed, without the parts a replay does not need: text deltas fold into one,
// thinking labels keep their last state, tool shells keep only their close, and the live paint of a
// section (partials, statuses, nested progress) is dropped since the card carries the section.
export function compactEvents(events: readonly TurnEvent[]): TurnEvent[] {
    const out: TurnEvent[] = [];
    const steps: string[] = [];
    let thinking = false;
    const flushThinking = (): void => {
        if (!thinking) return;
        for (const label of steps) out.push({ type: "chat.thinking", label });
        steps.length = 0;
        thinking = false;
    };
    for (const ev of events) {
        switch (ev.type) {
            case "chat.thinking":
                thinking = true;
                if (ev.label) steps.push(ev.label);
                break;
            case "chat.text": {
                flushThinking();
                const last = out[out.length - 1];
                if (last?.type === "chat.text") last.delta += ev.delta;
                else out.push({ type: "chat.text", delta: ev.delta });
                break;
            }
            case "chat.tool":
                flushThinking();
                // one closed shell per call: the open is implied
                if (ev.done && !out.some((e) => e.type === "chat.tool" && e.blockId === ev.blockId))
                    out.push({ ...ev, done: true });
                break;
            case "chat.block":
            case "error":
                flushThinking();
                out.push(ev);
                break;
            default:
                break;
        }
    }
    flushThinking();
    return out;
}

type Row = typeof schema.chatThreads.$inferSelect;

const toThread = (r: Row): ChatThread => ({
    id: r.id,
    key: r.key,
    messages: r.messages,
    marks: r.marks,
});

const owned = (workspaceId: string, userId: string, key: string) =>
    and(
        eq(schema.chatThreads.workspaceId, workspaceId),
        eq(schema.chatThreads.userId, userId),
        eq(schema.chatThreads.key, key),
    );

export async function loadThread(
    workspaceId: string,
    userId: string,
    key: string,
): Promise<ChatThread | null> {
    const [row] = await db
        .select()
        .from(schema.chatThreads)
        .where(owned(workspaceId, userId, key));
    return row ? toThread(row) : null;
}

/** One exchange: what the person said and what the assistant streamed back, appended in order. */
export async function appendExchange(
    workspaceId: string,
    userId: string,
    key: string,
    message: string,
    events: readonly TurnEvent[],
): Promise<void> {
    const at = new Date().toISOString();
    const added: ChatThreadMessage[] = [
        { role: "user", text: message, at },
        { role: "assistant", events: compactEvents(events), at },
    ];
    await db.transaction(async (tx) => {
        const [row] = await tx
            .select({ id: schema.chatThreads.id, messages: schema.chatThreads.messages })
            .from(schema.chatThreads)
            .where(owned(workspaceId, userId, key))
            .for("update");
        if (!row) {
            await tx
                .insert(schema.chatThreads)
                .values({ workspaceId, userId, key, messages: added });
            return;
        }
        // the newest turns are the thread; a very old one falls off rather than growing forever
        const messages = [...row.messages, ...added].slice(-MAX_MESSAGES);
        await tx
            .update(schema.chatThreads)
            .set({ messages, updatedAt: new Date() })
            .where(eq(schema.chatThreads.id, row.id));
    });
}

/** What the person did with a card, so a reopened thread shows it retired. */
export async function markProposal(
    workspaceId: string,
    userId: string,
    key: string,
    proposal: string,
    mark: ProposalMark,
): Promise<void> {
    await db
        .update(schema.chatThreads)
        .set({
            marks: sql`${schema.chatThreads.marks} || ${JSON.stringify({ [proposal]: mark })}::jsonb`,
            updatedAt: new Date(),
        })
        .where(owned(workspaceId, userId, key));
}

export async function clearThread(workspaceId: string, userId: string, key: string): Promise<void> {
    await db.delete(schema.chatThreads).where(owned(workspaceId, userId, key));
}
