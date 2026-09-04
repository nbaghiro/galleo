// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Generation, TurnEvent } from "@model/ai";
import type { ToolId } from "@model/tools";

// The seam is the tool stream: everything above it is the real store, so what this proves is how
// the mirror behaves against what the server sends, not a restatement of the store.
const streamTool = vi.fn();

vi.mock("@app/api", () => ({
    streamTool,
    api: {},
    ApiError: class extends Error {
        constructor(
            public status: number,
            message = "",
            public remedies: Record<string, unknown> = {},
        ) {
            super(message);
        }
    },
}));
vi.mock("@app/stores/billing", () => ({ loadBilling: vi.fn() }));
vi.mock("@app/stores/chat", () => ({
    bindChatTarget: vi.fn(() => () => undefined),
    loadThread: vi.fn(async () => undefined),
    setGenerationHost: vi.fn(),
}));
vi.mock("@app/stores/library", () => ({ loadLibrary: vi.fn(async () => undefined) }));
vi.mock("@ui/analytics", () => ({ capture: vi.fn(), setRequestId: vi.fn() }));
vi.mock("@app/stores/theme", () => ({ appTheme: () => "aurora" }));

const { buildSectionNow, gen, nextReveal, startSession, startBuild, pauseBuild } =
    await import("@app/stores/generate");

type Call = { tool: ToolId; input: Record<string, unknown> };
type Emit = (e: TurnEvent) => void;

const BEATS = [
    { id: "s1", label: "Open", role: "scene" },
    { id: "s2", label: "Proof", role: "proof" },
    { id: "s3", label: "Close", role: "close" },
];

const section = (id: string) => ({
    id,
    root: { type: "text", data: { text: `${id} copy`, style: "h1" } },
});

const opened = (): Generation => ({
    id: "gen-1",
    createdAt: "2026-09-01T00:00:00.000Z",
    workspaceId: "ws",
    artifactId: "art-1",
    stage: "briefed",
    brief: {
        prompt: "a scripted piece",
        surface: "deck",
        theme: "aurora",
        set: { prompt: "user" },
    },
    briefVersion: 0,
    outline: null,
    plannedAgainst: null,
    steer: "",
    clarify: null,
    beats: {},
    seq: 0,
});

// what the server streams for each tool: the start hands back the generation, the plan echoes the
// outline patch, and a write echoes one landing patch per beat
const START: TurnEvent[] = [
    { type: "turn.start", tool: "start-generation" },
    { type: "turn.done", result: opened() },
];
const PLAN: TurnEvent[] = [
    { type: "turn.start", tool: "plan-outline" },
    { type: "patch", patch: { generation: [{ op: "setStage", stage: "planning" }] }, seq: 1 },
    { type: "plan", beats: BEATS, title: "Three beats" },
    {
        type: "patch",
        patch: { generation: [{ op: "setOutline", title: "Three beats", beats: BEATS }] },
        seq: 2,
    },
    { type: "turn.done" },
];
// the server's landing patch: the section on the page, the take on the beat, and the stage moved
// to writing by the first section
const landed = (id: string, afterId: string | null, seq: number): TurnEvent[] => [
    { type: "section.status", id, status: "writing" },
    {
        type: "patch",
        patch: {
            artifact: [{ op: "addSection", afterId, section: section(id) }],
            generation: [
                { op: "setStage", stage: "writing" },
                { op: "pushVersion", id, section: section(id) },
            ],
        },
        seq,
    },
    { type: "section.status", id, status: "done" },
];

describe("the studio as a mirror of the generation", () => {
    beforeEach(() => {
        streamTool.mockReset(); // a block, not an expression: a returned function is teardown
    });

    it("starts, plans, and writes every beat through the tools, with the failed one left on the board", async () => {
        const calls: Call[] = [];
        streamTool.mockImplementation(
            async (tool: ToolId, input: Record<string, unknown>, onEvent: Emit) => {
                calls.push({ tool, input });
                if (tool === "start-generation") START.forEach(onEvent);
                else if (tool === "plan-outline") PLAN.forEach(onEvent);
                else if (tool === "write-beats") {
                    onEvent({ type: "turn.start", tool });
                    onEvent({
                        type: "patch",
                        patch: { generation: [{ op: "setStage", stage: "writing" }] },
                        seq: 3,
                    });
                    landed("s1", null, 4).forEach(onEvent);
                    onEvent({
                        type: "patch",
                        patch: { generation: [{ op: "setBeat", id: "s2", status: "failed" }] },
                        seq: 5,
                    });
                    landed("s3", "s1", 6).forEach(onEvent);
                    onEvent({
                        type: "turn.done",
                        result: { written: ["s1", "s3"], failed: ["s2"] },
                    });
                }
            },
        );

        await startSession({
            prompt: "a scripted piece",
            surface: "deck",
            theme: "aurora",
            shapeTemplateId: "startup-pitch",
        });
        expect(gen.stage).toBe("outlined");
        expect(gen.beats.map((b) => b.id)).toEqual(["s1", "s2", "s3"]);
        expect(gen.generation?.id).toBe("gen-1");

        startBuild();
        await vi.waitFor(() => expect(gen.writing).toBe(false));

        // the brief travelled once, on the start; every later call names the generation instead
        expect(calls[0]).toMatchObject({
            tool: "start-generation",
            input: { shapeTemplateId: "startup-pitch" },
        });
        expect(calls.slice(1).map((c) => c.tool)).toEqual(["plan-outline", "write-beats"]);
        for (const c of calls.slice(1)) expect(c.input.generationId).toBe("gen-1");

        expect(gen.content.sections.map((s) => s.id)).toEqual(["s1", "s3"]);
        expect(gen.slots.find((s) => s.id === "s2")?.status).toBe("failed");
        expect(gen.slots.find((s) => s.id === "s1")?.versions).toHaveLength(1);
        // a failed beat leaves the run open, with its Write button, rather than in the error stage
        expect(gen.stage).toBe("writing");
        expect(gen.error).toBe("");
    });

    it("writes one beat on its own and parks the run, so the queue does not run away", async () => {
        streamTool.mockImplementation(
            async (tool: ToolId, _input: Record<string, unknown>, onEvent: Emit) => {
                if (tool === "start-generation") START.forEach(onEvent);
                else if (tool === "plan-outline") PLAN.forEach(onEvent);
                else if (tool === "write-beat") {
                    onEvent({ type: "turn.start", tool });
                    landed("s2", null, 3).forEach(onEvent);
                    onEvent({ type: "turn.done" });
                }
            },
        );
        await startSession({ prompt: "a scripted piece", surface: "deck", theme: "aurora" });
        await buildSectionNow("s2");
        expect(gen.paused).toBe(true);
        expect(gen.stage).toBe("writing");
        expect(gen.content.sections.map((s) => s.id)).toEqual(["s2"]);
        expect(gen.slots.find((s) => s.id === "s1")?.status).toBe("queued");
    });

    it("a pause closes the write stream and the mirror waits on the row for the beat in flight", async () => {
        let abort: AbortSignal | undefined;
        streamTool.mockImplementation(
            async (
                tool: ToolId,
                _input: Record<string, unknown>,
                onEvent: Emit,
                opts?: { signal?: AbortSignal },
            ) => {
                if (tool === "start-generation") START.forEach(onEvent);
                else if (tool === "plan-outline") PLAN.forEach(onEvent);
                else if (tool === "write-beats") {
                    abort = opts?.signal;
                    onEvent({ type: "turn.start", tool });
                    landed("s1", null, 3).forEach(onEvent);
                    await new Promise<void>((_, reject) =>
                        abort?.addEventListener("abort", () =>
                            reject(new DOMException("aborted", "AbortError")),
                        ),
                    );
                } else if (tool === "read-generation") {
                    onEvent({
                        type: "turn.done",
                        result: {
                            generation: {
                                ...opened(),
                                stage: "writing",
                                outline: { title: "Three beats", beats: BEATS },
                                beats: {
                                    s1: { status: "done", versions: [section("s1")], active: 0 },
                                    s2: { status: "done", versions: [section("s2")], active: 0 },
                                },
                                seq: 6,
                            },
                            content: {
                                format: "deck",
                                theme: "aurora",
                                sections: [section("s1"), section("s2")],
                            },
                            writing: false,
                        },
                    });
                }
            },
        );
        await startSession({ prompt: "a scripted piece", surface: "deck", theme: "aurora" });
        startBuild();
        await vi.waitFor(() => expect(gen.content.sections).toHaveLength(1));
        pauseBuild();
        await vi.waitFor(() => expect(gen.paused).toBe(true));
        // the beat that was in flight when the stream closed arrives through the read
        await vi.waitFor(() => expect(gen.content.sections).toHaveLength(2), { timeout: 3000 });
        expect(gen.slots.find((s) => s.id === "s2")?.status).toBe("done");
        expect(gen.stage).toBe("writing");
    });
});

describe("nextReveal", () => {
    it("advances one section at a time while the plan streams, and drains the rest once it lands", () => {
        expect(nextReveal(0, 3, true)).toEqual({ at: 1, wait: 190 });
        expect(nextReveal(3, 3, true)).toEqual({ at: 3, wait: 190 });
        expect(nextReveal(1, 3, false)).toEqual({ at: 2, wait: 90 });
        expect(nextReveal(3, 3, false)).toBeNull();
    });
});

describe("an out-of-credits start", () => {
    beforeEach(() => {
        streamTool.mockReset();
    });

    it("returns to the intake with the brief intact instead of stranding an empty run", async () => {
        const { ApiError } = await import("@app/api");
        streamTool.mockImplementationOnce(() => {
            throw new (ApiError as new (s: number, m: string) => Error)(402, "out of AI credits");
        });
        await startSession({ prompt: "a launch deck", surface: "deck", theme: "aurora" });
        expect(gen.stage).toBe("intake");
        expect(gen.brief.prompt).toBe("a launch deck");
    });

    it("any other start failure still lands on the error stage, where retry lives", async () => {
        streamTool.mockImplementationOnce(() => {
            throw new Error("the provider hung up");
        });
        await startSession({ prompt: "a launch deck", surface: "deck", theme: "aurora" });
        expect(gen.stage).toBe("error");
    });

    // the drain race: the gate passed at the start, the balance emptied before the plan
    it("a plan refused right after the start also backs out to the intake", async () => {
        const { ApiError } = await import("@app/api");
        streamTool.mockImplementation(
            async (tool: ToolId, _input: Record<string, unknown>, onEvent: Emit) => {
                if (tool === "start-generation") START.forEach(onEvent);
                else if (tool === "plan-outline")
                    throw new (ApiError as new (s: number, m: string) => Error)(
                        402,
                        "out of AI credits",
                    );
            },
        );
        await startSession({ prompt: "a scripted piece", surface: "deck", theme: "aurora" });
        expect(gen.stage).toBe("intake");
        // the brief the server recorded on the start, which is what the intake rehydrates from
        expect(gen.brief.prompt).toBe("a scripted piece");
    });
});

describe("what the board sees while a beat is being written", () => {
    beforeEach(() => {
        streamTool.mockReset();
    });

    it("holds the card in the writing state, with no take and no preview, until the words arrive", async () => {
        let release: () => void = () => undefined;
        const midway = new Promise<void>((r) => {
            release = r;
        });
        let seen: { status?: string; preview: boolean; versions: number } | null = null;
        streamTool.mockImplementation(
            async (tool: ToolId, _input: Record<string, unknown>, onEvent: Emit) => {
                if (tool === "start-generation") START.forEach(onEvent);
                else if (tool === "plan-outline") PLAN.forEach(onEvent);
                else if (tool === "write-beats") {
                    onEvent({ type: "turn.start", tool });
                    onEvent({
                        type: "patch",
                        patch: { generation: [{ op: "setStage", stage: "writing" }] },
                        seq: 3,
                    });
                    // the server opens the beat ahead of the model call
                    onEvent({ type: "section.status", id: "s1", status: "active" });
                    onEvent({ type: "section.status", id: "s1", status: "writing" });
                    const slot = gen.slots.find((s) => s.id === "s1");
                    seen = {
                        status: slot?.status,
                        preview: !!slot?.preview,
                        versions: slot?.versions.length ?? 0,
                    };
                    await midway;
                    landed("s1", null, 4).forEach(onEvent);
                    onEvent({ type: "turn.done", result: { written: ["s1"], failed: [] } });
                }
            },
        );
        await startSession({ prompt: "a scripted piece", surface: "deck", theme: "aurora" });
        startBuild();
        await vi.waitFor(() => expect(seen).not.toBeNull());
        // this is the state the frame dims on: active, and nothing to show but the plan's words
        expect(seen).toEqual({ status: "writing", preview: false, versions: 0 });
        release();
        await vi.waitFor(() => expect(gen.writing).toBe(false));
        expect(gen.slots.find((s) => s.id === "s1")?.status).toBe("done");
    });
});
