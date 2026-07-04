import type { AgentEvent, GenerateInput, PatchOp } from "@model/agent";
import type { ArtifactContent } from "@model/artifact";
import { eq } from "drizzle-orm";
import { db, schema } from "../data/client";
import { runGenerate, type GenerateResult } from "./pipeline";
import type { Quality } from "./models";

// The turn runtime that bridges the pipeline (a synchronous event emitter) to a stream (SSE) + the DB.
// A generate turn creates a blank artifact upfront (agent_turns.artifact_id is NOT NULL, and it gives the
// client something to navigate to); the pipeline's patches build it up, saved on completion.

// A tiny async queue: the pipeline `push`es events synchronously; the SSE handler `drain`s them as they
// arrive, and the loop ends when the pipeline `close`s the queue.
class EventQueue<T> {
    private items: T[] = [];
    private waiters: Array<(r: IteratorResult<T>) => void> = [];
    private closed = false;

    push(item: T): void {
        const w = this.waiters.shift();
        if (w) w({ value: item, done: false });
        else this.items.push(item);
    }
    close(): void {
        this.closed = true;
        let w: ((r: IteratorResult<T>) => void) | undefined;
        while ((w = this.waiters.shift())) w({ value: undefined as never, done: true });
    }
    async *drain(): AsyncGenerator<T> {
        for (;;) {
            if (this.items.length) {
                yield this.items.shift()!;
                continue;
            }
            if (this.closed) return;
            const next = await new Promise<IteratorResult<T>>((res) => this.waiters.push(res));
            if (next.done) return;
            yield next.value;
        }
    }
}

const clip = (s: string, n: number): string =>
    s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s;

// Create the blank artifact + the turn row it belongs to. Returns both ids for the client to navigate.
export async function createGenerateTurn(
    input: GenerateInput,
    workspaceId: string,
    createdBy: string,
): Promise<{ turnId: string; artifactId: string }> {
    const blank: ArtifactContent = { format: input.surface, theme: input.theme, sections: [] };
    const [art] = await db
        .insert(schema.artifacts)
        .values({
            workspaceId,
            title: clip(input.prompt, 64),
            formatId: input.surface,
            themeId: input.theme,
            draftContent: blank,
            createdBy,
        })
        .returning({ id: schema.artifacts.id });
    const artifactId = art!.id;
    const [turn] = await db
        .insert(schema.agentTurns)
        .values({ artifactId, kind: "generate", input, status: "running", createdBy })
        .returning({ id: schema.agentTurns.id });
    return { turnId: turn!.id, artifactId };
}

// Run the pipeline, persisting every event (for replay/resume) and yielding it for the live SSE stream;
// on completion, save the composed artifact + finalize the turn.
export async function* streamGenerateTurn(
    turnId: string,
    artifactId: string,
    input: GenerateInput,
    quality?: Quality,
): AsyncGenerator<{ seq: number; event: AgentEvent }> {
    const queue = new EventQueue<AgentEvent>();
    const out: { result: GenerateResult | null } = { result: null };
    const run = runGenerate(input, (e) => queue.push(e), { quality })
        .then((r) => {
            out.result = r;
            queue.close();
        })
        .catch((err: unknown) => {
            queue.push({ type: "error", message: String((err as Error)?.message ?? err) });
            queue.close();
        });

    let seq = 0;
    const ops: PatchOp[] = [];
    let status = "done";
    let error: string | null = null;
    for await (const event of queue.drain()) {
        seq += 1;
        if (event.type === "patch") ops.push(...event.ops);
        if (event.type === "error") {
            status = "error";
            error = event.message;
        }
        await db.insert(schema.agentEvents).values({ turnId, seq, type: event.type, data: event });
        yield { seq, event };
    }
    await run;

    if (out.result) {
        await db
            .update(schema.artifacts)
            .set({
                draftContent: out.result.content,
                title: out.result.title,
                updatedAt: new Date(),
            })
            .where(eq(schema.artifacts.id, artifactId));
    }
    await db
        .update(schema.agentTurns)
        .set({ status, error, patch: ops, updatedAt: new Date() })
        .where(eq(schema.agentTurns.id, turnId));
}
