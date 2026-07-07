import type { TurnEvent, TurnRequest, TurnKind, Beat as PlanBeat, GenerateInput } from "@model/ai";
import type { Section } from "@model/artifact";
import { generateObject } from "ai";
import { resolveModel } from "./provider";
import { defaultModelFor } from "./models";
import { outlineParts, sectionParts } from "./prompts/generate";
import { zOutline, zSection } from "./schema";
import type { Outline, Beat } from "./schema";

// The turn runtime — the real AI backend. `runTurn` dispatches a TurnRequest to its capability, each an
// async generator that yields the honest TurnEvent stream the client renders (turn.start → phase → plan →
// per-section status/narration/patch → turn.done). Pure of IO except the model calls; the route
// (services/api/ai) handles auth, credit metering, and SSE framing by consuming the generator. `generate`
// is live — a two-phase outline→section flow (prompts in services/ai/prompts); edit/section/chat are the
// next capabilities to fill in behind the same seam. Same protocol as the simulator, so the client is one
// path whether the events come from a fixture or the model.

const clip = (s: string, n: number): string =>
    s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s;

const slug = (s: string): string =>
    s
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 48) || "img";

// Descriptive image `src` (the model writes an art-director phrase, not a URL) → a deterministic placeholder
// so the section shows an image immediately. Real image generation (Gemini via services/media/generate)
// plugs in here later, swapping the placeholder for a stored asset during the `image` step.
function resolveImages(section: Section): Section {
    const fix = (src: unknown): string =>
        typeof src === "string" && src.startsWith("http")
            ? src
            : `https://picsum.photos/seed/${slug(String(src ?? ""))}/1100/760`;
    const cells = { ...section.cells };
    for (const key of Object.keys(cells)) {
        const el = cells[key]?.element;
        if (!el) continue;
        const data = el.data as { src?: unknown; type?: string };
        if (el.type === "image" && data.src !== undefined) {
            cells[key] = { element: { ...el, data: { ...data, src: fix(data.src) } } };
        }
    }
    const bg = section.background;
    const background = bg?.kind === "image" && bg.image ? { ...bg, image: fix(bg.image) } : bg;
    return { ...section, cells, background };
}

const toPlanBeat = (b: Beat): PlanBeat => ({
    id: b.id,
    label: b.label,
    role: b.role,
    grid: b.grid,
    image: b.image,
});

export interface RunOpts {
    signal?: AbortSignal;
}

// Dispatch a turn to its capability — each kind is an async generator of the shared TurnEvent stream.
// `generate` is live; the rest report "not yet" until built, all behind this one seam.
export async function* runTurn(req: TurnRequest, opts: RunOpts = {}): AsyncGenerator<TurnEvent> {
    switch (req.kind) {
        case "generate":
            yield* runGenerate(req.input, opts);
            return;
        case "edit":
            yield* unimplemented("edit", "Editing the whole artifact");
            return;
        case "section":
            yield* unimplemented("section", "Regenerating a section");
            return;
        case "chat":
            yield* unimplemented("chat", "Chat");
            return;
    }
}

// generate — a full artifact from a brief: outline (the plan), then one section written per beat, in order.
async function* runGenerate(input: GenerateInput, opts: RunOpts = {}): AsyncGenerator<TurnEvent> {
    const { signal } = opts;
    yield { type: "turn.start", kind: "generate" };
    yield { type: "phase", name: "intake" };
    yield { type: "narration", text: "Reading the brief", sub: clip(input.prompt, 90) };

    // --- 1. outline (the plan) ---
    yield { type: "phase", name: "outline" };
    yield { type: "narration", text: "Planning the story arc" };
    const op = outlineParts(input);
    const { object: outlineObj } = await generateObject({
        model: resolveModel(defaultModelFor("outline")),
        schema: zOutline,
        system: op.system,
        prompt: op.prompt,
        abortSignal: signal,
    });
    const outline: Outline = outlineObj;
    const beats = outline.beats;
    const planBeats = beats.map(toPlanBeat);
    yield {
        type: "narration",
        text: `Planned “${clip(outline.title, 48)}”`,
        mono: ` · ${beats.length} sections`,
        sub: beats.map((b) => b.role).join("  →  "),
    };
    yield { type: "plan", beats: planBeats };

    // --- 2. build: one section per beat, in order ---
    yield { type: "phase", name: "build" };
    const n = beats.length;
    for (let i = 0; i < n; i++) {
        const beat = beats[i]!;
        yield { type: "section.status", id: beat.id, status: "active" };
        yield { type: "narration", text: `Writing “${beat.label}”`, mono: ` · ${beat.role}` };
        yield { type: "section.status", id: beat.id, status: "writing" };

        const sp = sectionParts(input, beat, outline);
        const { object: sectionObj } = await generateObject({
            model: resolveModel(defaultModelFor("section")),
            schema: zSection,
            system: sp.system,
            prompt: sp.prompt,
            abortSignal: signal,
        });
        // bind the returned section to its planned slot id, then resolve its images
        let section = { ...(sectionObj as unknown as Section), id: beat.id };
        if (beat.image) {
            yield { type: "section.status", id: beat.id, status: "image" };
            yield { type: "narration", text: `Sourcing an image for “${beat.label}”` };
        }
        section = resolveImages(section);

        yield { type: "patch", ops: [{ op: "addSection", section }] };
        yield { type: "section.status", id: beat.id, status: "done" };
        yield {
            type: "narration",
            text: `“${beat.label}” placed`,
            mono: ` ✓ ${i + 1}/${n}`,
        };
    }

    // --- 3. done ---
    yield { type: "phase", name: "compose" };
    yield { type: "phase", name: "done" };
    yield { type: "turn.done", summary: `Composed ${n} sections — “${clip(outline.title, 48)}”` };
}

// Placeholder for capabilities whose runtime isn’t built yet — emits a turn that immediately reports the
// gap, so the client’s error path handles it uniformly. Replace each with a real generator as it ships.
async function* unimplemented(kind: TurnKind, what: string): AsyncGenerator<TurnEvent> {
    yield { type: "turn.start", kind };
    yield { type: "error", message: `${what} isn’t available yet.` };
}
