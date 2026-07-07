import type { Component } from "solid-js";
import { createEffect, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { useNavigate } from "@solidjs/router";
import type { Section } from "@model/artifact";
import { resolveProfile } from "@engine/profile";
import { resolveTheme } from "@themes";
import { paint } from "@canvas/render/backends";
import { measureText, layoutSection } from "@canvas/render/commands";
import { appTheme } from "../../theme";
import {
    gen,
    startRealSession,
    resetSession,
    saveGenerated,
    placedSections,
    type SectionSlot,
    type Surface,
} from "../generate/session";

// EXPERIMENTAL generation studio (/app/studio) — a fresh "blueprint → proof" UI over the SAME real engine
// and the SAME session store the production flow uses. The plan seeds a typed blueprint frame per section
// (drawn from each beat's grid), then every section fills with a REAL engine-painted render (layoutSection +
// paint), one at a time, as its content lands. Styling is scoped under `.stu`, independent of the app chrome.

const reduced = (): boolean => matchMedia("(prefers-reduced-motion: reduce)").matches;
const PLACEHOLDER =
    "A launch deck for a calm operating system that helps solo studios handle projects, invoices, and cashflow in one place…";
const EXAMPLES = [
    "A launch deck for Meridian, a calm OS for solo studios",
    "A landing page for a whisper-quiet air purifier",
    "An annual climate report — one year measured in degrees",
    "A pitch for a maps API that developers actually enjoy",
];
type Fmt = "deck" | "doc" | "site";
const FMT_LABEL: Record<Fmt, string> = { deck: "Deck", doc: "Document", site: "Website" };
const toSurface = (f: Fmt): Surface => (f === "site" ? "web" : f);

// grid id → column fractions, so a blueprint frame shows the real planned layout before content exists
const GRID_COLS: Record<string, number[]> = {
    full: [1],
    "split-6040": [0.6, 0.4],
    "split-4060": [0.4, 0.6],
    "two-col": [0.5, 0.5],
    "three-up": [1 / 3, 1 / 3, 1 / 3],
};
const gridCols = (g: string): number[] => GRID_COLS[g] ?? [1];
const GRID_LABEL: Record<string, string> = {
    full: "FULL",
    "split-6040": "SPLIT 60·40",
    "split-4060": "SPLIT 40·60",
    "two-col": "TWO-COL",
    "three-up": "THREE-UP",
};
const gridLabel = (g: string): string => GRID_LABEL[g] ?? g.toUpperCase();

// The macro phase stepper — the backend's fine-grained turn phases collapsed into four user-facing steps.
const STEPS: { label: string; phases: string[] }[] = [
    { label: "Reading", phases: ["intake"] },
    { label: "Planning", phases: ["spine", "outline", "plan"] },
    { label: "Building", phases: ["build", "edit", "research"] },
    { label: "Ready", phases: ["compose", "done"] },
];
const stepIndex = (phase: string | null, done: boolean): number => {
    if (done) return STEPS.length - 1;
    if (!phase) return 0;
    const i = STEPS.findIndex((s) => s.phases.includes(phase));
    return i < 0 ? 0 : i;
};

// how wide a section lays out in the current format (mirrors the editor's geometry)
function geometry(
    section: Section,
    avail: number,
): { tk: ReturnType<typeof resolveTheme>["tokens"]; layoutW: number } {
    const tk = resolveTheme(gen.theme).tokens;
    const p = resolveProfile(gen.format);
    const web = p.id === "web";
    const contentW = Math.min(avail - 48, p.maxContentWidth ?? 1080);
    const bleed = (section.bleed ?? false) || web;
    return { tk, layoutW: Math.max(320, bleed ? avail - 48 : contentW) };
}

export const StudioView: Component = () => {
    const navigate = useNavigate();
    const [fmt, setFmt] = createSignal<Fmt>("deck");
    const [prompt, setPrompt] = createSignal("");
    const [ctx, setCtx] = createSignal<string[]>([]);
    let ctxN = 0;
    const CTX_SAMPLES: string[] = [
        "brand-guidelines.pdf",
        "meridian.app/about",
        "q2-metrics.xlsx",
        "founder-notes.md",
    ];

    onMount(resetSession);
    onCleanup(resetSession);

    const building = (): boolean => gen.phase !== "idle";
    const go = (): void => {
        void startRealSession({
            prompt: prompt().trim() || PLACEHOLDER,
            surface: toSurface(fmt()),
            theme: appTheme(),
            length: "Standard",
        });
    };
    const restart = (): void => {
        resetSession();
        setPrompt("");
        setCtx([]);
    };
    const openInEditor = async (): Promise<void> => {
        const id = await saveGenerated();
        if (id) navigate(`/edit/${id}`);
    };

    const total = (): number => gen.sections.length;
    const done = (): number => placedSections().length;
    const phaseText = (): string => {
        if (gen.phase === "done") return "Ready to edit";
        if (gen.phase === "error") return "Something went off-script";
        if (!gen.beats.length) return "Reading the brief";
        if (done() === 0) return "Planning the story";
        const a = gen.sections.find((s) => s.id === gen.activeSection);
        if (a?.status === "image") return "Sourcing image";
        return "Writing content";
    };

    return (
        <>
            <style>{STYLE}</style>
            <div class="stu">
                <header class="stu-bar">
                    <div class="stu-brand">
                        <b>GALLEO</b>
                        <span>studio</span>
                    </div>
                    <div
                        class="stu-readout"
                        classList={{
                            live: building() && gen.phase !== "done",
                            ok: gen.phase === "done",
                        }}
                    >
                        <i />
                        {building() ? (gen.phase === "done" ? "Complete" : "Generating") : "Ready"}
                    </div>
                    <div>
                        <Show when={building()}>
                            <button class="stu-ghost" onClick={restart}>
                                ↺ New brief
                            </button>
                        </Show>
                    </div>
                </header>

                <Show
                    when={!building()}
                    fallback={
                        <Build
                            phaseText={phaseText}
                            total={total}
                            done={done}
                            onOpen={openInEditor}
                            onRegen={go}
                            ctx={ctx}
                            fmt={fmt}
                        />
                    }
                >
                    {/* INTAKE */}
                    <section class="stu-intake">
                        <div class="stu-composer">
                            <p class="stu-kicker">Compose</p>
                            <h1>
                                What are we making <em>today?</em>
                            </h1>
                            <p class="stu-lede">
                                Describe it in a sentence or a paragraph. Galleo shapes the outline,
                                writes every section, and sources the images — you watch it come
                                together.
                            </p>
                            <div class="stu-field">
                                <textarea
                                    class="stu-ta"
                                    placeholder={PLACEHOLDER}
                                    value={prompt()}
                                    onInput={(e) => setPrompt(e.currentTarget.value)}
                                />
                                <div class="stu-tools">
                                    <div class="stu-seg">
                                        <For each={["deck", "doc", "site"] as Fmt[]}>
                                            {(f) => (
                                                <button
                                                    classList={{ on: fmt() === f }}
                                                    onClick={() => setFmt(f)}
                                                >
                                                    {FMT_LABEL[f]}
                                                </button>
                                            )}
                                        </For>
                                    </div>
                                    <button
                                        class="stu-addctx"
                                        onClick={() => {
                                            const s = CTX_SAMPLES[ctxN % CTX_SAMPLES.length]!;
                                            ctxN++;
                                            setCtx((c) => (c.includes(s) ? c : [...c, s]));
                                        }}
                                    >
                                        + Add context
                                    </button>
                                    <div style={{ flex: 1 }} />
                                    <button class="stu-go" onClick={go}>
                                        Generate →
                                    </button>
                                </div>
                            </div>
                            <div class="stu-chips">
                                <For each={ctx()}>
                                    {(c) => (
                                        <span class="stu-chip">
                                            {c}
                                            <i
                                                onClick={() =>
                                                    setCtx((arr) => arr.filter((x) => x !== c))
                                                }
                                            >
                                                ✕
                                            </i>
                                        </span>
                                    )}
                                </For>
                            </div>
                            <div class="stu-ex-lbl">Or start from an idea</div>
                            <div class="stu-ex">
                                <For each={EXAMPLES}>
                                    {(t) => <button onClick={() => setPrompt(t)}>{t}</button>}
                                </For>
                            </div>
                            <p class="stu-note">
                                ◆ We choose a theme that fits the content — swap it in one click
                                after.
                            </p>
                        </div>
                    </section>
                </Show>
            </div>
        </>
    );
};

// ---- build stage ----
const Build: Component<{
    phaseText: () => string;
    total: () => number;
    done: () => number;
    onOpen: () => void;
    onRegen: () => void;
    ctx: () => string[];
    fmt: () => Fmt;
}> = (props) => {
    let board!: HTMLDivElement;
    const [avail, setAvail] = createSignal(1000);
    onMount(() => {
        const ro = new ResizeObserver(() => setAvail(board.clientWidth));
        ro.observe(board);
        setAvail(board.clientWidth);
        onCleanup(() => ro.disconnect());
    });
    // keep the newest frame in view as sections land
    createEffect(() => {
        void placedSections().length;
        void gen.activeSection;
        queueMicrotask(() =>
            board?.scrollTo({ top: board.scrollHeight, behavior: reduced() ? "auto" : "smooth" }),
        );
    });

    return (
        <div class="stu-build">
            <aside class="stu-rail">
                <div>
                    <h2>The brief</h2>
                    <div class="stu-echo">{gen.brief?.prompt}</div>
                    <div class="stu-meta">
                        <span class="stu-tag">{FMT_LABEL[props.fmt()]}</span>
                        <For each={props.ctx()}>{(c) => <span class="stu-tag">{c}</span>}</For>
                    </div>
                </div>
                <div>
                    <h2>Outline</h2>
                    <Show
                        when={gen.beats.length}
                        fallback={<div class="stu-planning">planning…</div>}
                    >
                        <ul class="stu-beats">
                            <For each={gen.beats}>
                                {(b, i) => (
                                    <li
                                        classList={{
                                            active: b.status === "active",
                                            done: b.status === "done",
                                        }}
                                    >
                                        <span class="idx">{String(i() + 1).padStart(2, "0")}</span>
                                        <span class="glyph" />
                                        <span class="lbl">{b.label}</span>
                                        <span class="role">{b.role}</span>
                                    </li>
                                )}
                            </For>
                        </ul>
                    </Show>
                </div>
                <div class="stu-narr-wrap">
                    <h2>Progress</h2>
                    <div class="stu-narr">
                        <Show
                            when={gen.narration.length}
                            fallback={<div class="stu-planning">…</div>}
                        >
                            <For each={gen.narration.slice(-8)}>
                                {(line) => (
                                    <div class="stu-narr-line" classList={{ active: !line.done }}>
                                        <span class="ndot" />
                                        <span class="txt">
                                            {line.text}
                                            <Show when={line.mono}>
                                                <span class="mono">{line.mono}</span>
                                            </Show>
                                            <Show when={line.sub}>
                                                <span class="sub">{line.sub}</span>
                                            </Show>
                                        </span>
                                    </div>
                                )}
                            </For>
                        </Show>
                    </div>
                </div>
            </aside>

            <div class="stu-boardwrap">
                <div class="stu-marks">
                    <i class="tl" />
                    <i class="tr" />
                    <i class="bl" />
                    <i class="br" />
                </div>
                <div ref={board} class={`stu-board fmt-${props.fmt()}`}>
                    <Show when={!gen.beats.length}>
                        <div class="stu-boot">
                            <span class="spin" /> {props.phaseText()}…
                        </div>
                    </Show>
                    <For each={gen.sections}>
                        {(slot, i) => <Frame slot={slot} index={i()} avail={avail} />}
                    </For>
                </div>
            </div>

            <footer class="stu-foot" classList={{ done: gen.phase === "done" }}>
                <div class="stu-steps">
                    <For each={STEPS}>
                        {(s, i) => (
                            <div
                                class="stu-step"
                                classList={{
                                    active: i() === stepIndex(gen.turnPhase, gen.phase === "done"),
                                    done: i() < stepIndex(gen.turnPhase, gen.phase === "done"),
                                }}
                            >
                                <i /> {s.label}
                            </div>
                        )}
                    </For>
                </div>
                <Show
                    when={gen.phase === "done"}
                    fallback={
                        <>
                            <div class="stu-ticks">
                                <For each={gen.sections}>
                                    {(s) => (
                                        <i
                                            classList={{
                                                active: ["active", "writing", "image"].includes(
                                                    s.status,
                                                ),
                                                done: s.status === "done",
                                            }}
                                        />
                                    )}
                                </For>
                            </div>
                            <div class="stu-count">
                                {String(props.done()).padStart(2, "0")} /{" "}
                                {String(props.total()).padStart(2, "0")}
                            </div>
                        </>
                    }
                >
                    <div class="stu-donecta">
                        <span class="stu-count">{props.total()} sections</span>
                        <button class="stu-ghost" onClick={props.onRegen}>
                            Regenerate
                        </button>
                        <button class="stu-primary" onClick={props.onOpen}>
                            Open in editor →
                        </button>
                    </div>
                </Show>
            </footer>
        </div>
    );
};

// ---- one section frame: blueprint scaffold → real engine render ----
// Both layers stay mounted (so the paint target ref is stable); CSS shows the blueprint until the real
// section is painted, then swaps to the proof. The paint runs the SAME engine the editor uses.
const Frame: Component<{ slot: SectionSlot; index: number; avail: () => number }> = (props) => {
    let box!: HTMLDivElement;
    const [dim, setDim] = createSignal({ w: 0, h: 0 });
    const doneReady = (): boolean => props.slot.status === "done" && !!props.slot.section;
    const active = (): boolean => ["active", "writing", "image"].includes(props.slot.status);
    const cols = (): number[] => gridCols(props.slot.grid);
    const themeBg = (): string => resolveTheme(gen.theme).tokens.bg;

    createEffect(() => {
        if (!doneReady() || !box) return;
        const sec = props.slot.section as Section;
        const { tk, layoutW } = geometry(sec, props.avail());
        const out = layoutSection(sec, layoutW, measureText, tk, resolveProfile(gen.format));
        paint(out.commands, box);
        setDim({ w: layoutW, h: out.height });
        if (reduced()) return;
        box.animate([{ opacity: 0 }, { opacity: 1 }], {
            duration: 420,
            easing: "cubic-bezier(.2,.7,.2,1)",
            fill: "both",
        });
        box.animate([{ clipPath: "inset(0 0 100% 0)" }, { clipPath: "inset(0 0 0 0)" }], {
            duration: 560,
            easing: "cubic-bezier(.2,.7,.2,1)",
            fill: "both",
        });
        box.querySelectorAll("img").forEach((img) =>
            img.animate(
                [
                    { filter: "blur(14px)", opacity: 0.4 },
                    { filter: "blur(0)", opacity: 1 },
                ],
                { duration: 640, fill: "both" },
            ),
        );
    });

    return (
        <article class="stu-frame" classList={{ "is-active": active(), "is-done": doneReady() }}>
            <span class="stu-ftag">
                {String(props.index + 1).padStart(2, "0")} · {gridLabel(props.slot.grid)}
                {props.slot.image ? " · IMG" : ""}
            </span>
            <div class="stu-sk">
                <For each={cols()}>
                    {(frac, ci) => (
                        <div class="stu-col" style={{ flex: String(frac) }}>
                            <Show
                                when={
                                    props.slot.image &&
                                    cols().length > 1 &&
                                    ci() === cols().length - 1
                                }
                                fallback={
                                    <>
                                        <div
                                            class="stu-bar"
                                            style={{ width: "70%", height: "16px" }}
                                        />
                                        <div class="stu-bar" style={{ width: "90%" }} />
                                        <div class="stu-bar" style={{ width: "82%" }} />
                                        <div class="stu-bar" style={{ width: "60%" }} />
                                    </>
                                }
                            >
                                <div class="stu-imgsk">▦</div>
                            </Show>
                        </div>
                    )}
                </For>
                <Show when={active()}>
                    <div class="stu-scan" />
                    <div class="stu-status">
                        <span class="ping" />
                        {props.slot.status === "image" ? "Sourcing image…" : "Writing…"}
                    </div>
                </Show>
            </div>
            <div class="stu-proof" style={{ background: themeBg() }}>
                <div
                    ref={box}
                    style={{
                        position: "relative",
                        width: `${dim().w}px`,
                        height: `${dim().h}px`,
                        margin: "0 auto",
                    }}
                />
            </div>
        </article>
    );
};

const STYLE = `
.stu{position:fixed;inset:0;display:flex;flex-direction:column;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color:#e9edf4;
  background:radial-gradient(120% 80% at 50% -10%,#171b22,transparent 60%),#12151b;--blue:#6ea8ff;--amber:#ffb454;--teal:#46d6b0;--line:#2a3038;--line2:#39414e;--ink2:#aeb6c4;--ink3:#6e7787;--mono:ui-monospace,"SF Mono","JetBrains Mono",monospace;--serif:"Iowan Old Style","Palatino Linotype",Georgia,serif}
.stu::before{content:"";position:absolute;inset:0;background-image:linear-gradient(var(--line) 1px,transparent 1px),linear-gradient(90deg,var(--line) 1px,transparent 1px);background-size:34px 34px;opacity:.28;-webkit-mask-image:radial-gradient(120% 90% at 50% 30%,#000 40%,transparent 88%);mask-image:radial-gradient(120% 90% at 50% 30%,#000 40%,transparent 88%);pointer-events:none}
.stu button{font:inherit;cursor:pointer}
.stu :focus-visible{outline:2px solid var(--blue);outline-offset:2px;border-radius:6px}
.stu-bar{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:13px 22px;border-bottom:1px solid var(--line);position:relative;z-index:3;background:linear-gradient(#171b22,transparent)}
.stu-brand{display:flex;align-items:baseline;gap:9px}
.stu-brand b{font-family:var(--mono);font-size:12px;letter-spacing:.22em}
.stu-brand span{font-family:var(--serif);font-style:italic;font-size:14px;color:var(--ink2)}
.stu-readout{font-family:var(--mono);font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--ink3);display:flex;align-items:center;gap:9px}
.stu-readout i{width:6px;height:6px;border-radius:50%;background:var(--ink3)}
.stu-readout.live i{background:var(--amber);animation:stupulse 1.4s infinite}
.stu-readout.ok i{background:var(--teal)}
.stu-ghost{background:transparent;border:1px solid var(--line2);color:var(--ink2);padding:7px 12px;border-radius:8px;font-size:12.5px}
.stu-ghost:hover{border-color:var(--ink3);color:#e9edf4}
.stu-intake{flex:1;min-height:0;display:grid;place-items:center;padding:20px;position:relative;z-index:2;overflow:auto}
.stu-composer{width:min(720px,100%)}
.stu-kicker{font-family:var(--mono);font-size:11px;letter-spacing:.24em;text-transform:uppercase;color:var(--blue);margin:0 0 14px;display:flex;align-items:center;gap:10px}
.stu-kicker::before{content:"";width:22px;height:1px;background:var(--blue);opacity:.6}
.stu-composer h1{font-family:var(--serif);font-weight:500;font-size:clamp(30px,5vw,46px);line-height:1.04;letter-spacing:-.01em;margin:0 0 10px;text-wrap:balance}
.stu-composer h1 em{font-style:italic;color:var(--ink2)}
.stu-lede{color:var(--ink2);font-size:15.5px;line-height:1.5;max-width:56ch;margin:0 0 24px}
.stu-field{background:#1c2129;border:1px solid var(--line2);border-radius:14px;padding:6px;box-shadow:0 22px 60px -34px #000}
.stu-field:focus-within{border-color:var(--blue)}
.stu-ta{width:100%;border:0;background:transparent;color:#e9edf4;font:16px/1.5 system-ui;resize:none;padding:14px 14px 6px;min-height:92px}
.stu-ta:focus{outline:none}.stu-ta::placeholder{color:var(--ink3)}
.stu-tools{display:flex;align-items:center;gap:8px;padding:8px;flex-wrap:wrap}
.stu-seg{display:inline-flex;background:#171b22;border:1px solid var(--line);border-radius:9px;padding:3px;gap:2px}
.stu-seg button{border:0;background:transparent;color:var(--ink3);padding:6px 13px;border-radius:6px;font-size:12.5px}
.stu-seg button.on{background:#222834;color:#e9edf4;box-shadow:inset 0 0 0 1px var(--line2)}
.stu-addctx{border:1px dashed var(--line2);background:transparent;color:var(--ink3);border-radius:9px;padding:7px 12px;font-size:12.5px}
.stu-addctx:hover{border-color:var(--blue);color:var(--blue)}
.stu-go{border:0;background:#e9edf4;color:#12151b;font-weight:600;font-size:13.5px;padding:9px 18px;border-radius:9px}
.stu-go:hover{box-shadow:0 0 0 3px rgba(110,168,255,.16)}
.stu-go:active{transform:translateY(1px)}
.stu-chips{display:flex;flex-wrap:wrap;gap:7px;margin-top:12px;min-height:20px}
.stu-chip{font-size:12px;color:var(--ink2);background:#1c2129;border:1px solid var(--line);border-radius:999px;padding:5px 11px;display:inline-flex;gap:7px;align-items:center}
.stu-chip i{color:var(--ink3);cursor:pointer;font-style:normal}
.stu-chip i:hover{color:#ff6b6b}
.stu-ex-lbl{font-family:var(--mono);font-size:10.5px;letter-spacing:.18em;text-transform:uppercase;color:var(--ink3);margin:26px 0 10px}
.stu-ex{display:flex;flex-wrap:wrap;gap:8px}
.stu-ex button{text-align:left;border:1px solid var(--line);background:transparent;color:var(--ink2);border-radius:999px;padding:7px 13px;font-size:12.5px}
.stu-ex button:hover{border-color:var(--blue);color:#e9edf4;background:rgba(110,168,255,.1)}
.stu-note{margin-top:18px;font-size:12px;color:var(--ink3);display:flex;gap:8px;align-items:center}
.stu-note::first-letter{color:var(--blue)}
.stu-build{flex:1;min-height:0;position:relative;z-index:2;display:grid;grid-template-columns:288px 1fr;grid-template-rows:1fr auto}
.stu-rail{grid-row:1/3;border-right:1px solid var(--line);background:linear-gradient(#171b22,transparent);padding:20px 18px;overflow-y:auto;display:flex;flex-direction:column;gap:22px}
.stu-rail h2{font-family:var(--mono);font-size:10px;letter-spacing:.2em;text-transform:uppercase;color:var(--ink3);margin:0 0 10px}
.stu-echo{font-size:13px;line-height:1.5;color:var(--ink2);border-left:2px solid var(--line2);padding-left:12px}
.stu-meta{margin-top:10px;display:flex;gap:6px;flex-wrap:wrap}
.stu-tag{font-family:var(--mono);font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--ink3);border:1px solid var(--line);border-radius:5px;padding:3px 7px}
.stu-planning{font-family:var(--mono);font-size:11px;color:var(--ink3)}
.stu-beats{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:2px}
.stu-beats li{display:flex;align-items:center;gap:11px;padding:8px;border-radius:8px}
.stu-beats li.active{background:rgba(255,180,84,.16)}
.stu-beats .idx{font-family:var(--mono);font-size:10px;color:var(--ink3);width:16px;flex:none}
.stu-beats .glyph{width:13px;height:13px;flex:none;border-radius:50%;border:1.5px solid var(--line2);position:relative}
.stu-beats li.active .glyph{border-color:var(--amber);animation:stupulse 1.3s infinite}
.stu-beats li.done .glyph{border-color:var(--teal);background:var(--teal)}
.stu-beats li.done .glyph::after{content:"";position:absolute;left:3.4px;top:1px;width:3px;height:6px;border:solid #12151b;border-width:0 1.6px 1.6px 0;transform:rotate(45deg)}
.stu-beats .lbl{font-size:12.5px;color:var(--ink2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.stu-beats li.active .lbl,.stu-beats li.done .lbl{color:#e9edf4}
.stu-beats .role{margin-left:auto;font-family:var(--mono);font-size:9.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--ink3)}
.stu-boardwrap{position:relative;overflow:hidden;padding:24px 28px}
.stu-marks{position:absolute;inset:14px;pointer-events:none;color:var(--line2)}
.stu-marks i{position:absolute;width:16px;height:16px}
.stu-marks i::before,.stu-marks i::after{content:"";position:absolute;background:currentColor}
.stu-marks i::before{width:100%;height:1px;top:0}.stu-marks i::after{height:100%;width:1px;left:0}
.stu-marks .tl{top:0;left:0}.stu-marks .tr{top:0;right:0;transform:scaleX(-1)}.stu-marks .bl{bottom:0;left:0;transform:scaleY(-1)}.stu-marks .br{bottom:0;right:0;transform:scale(-1)}
.stu-board{height:100%;overflow-y:auto;display:flex;flex-direction:column;align-items:center;gap:16px;padding:4px 4px 40px;scroll-behavior:smooth}
.stu-boot{margin:auto;font-family:var(--mono);font-size:12px;letter-spacing:.1em;color:var(--ink2);display:flex;align-items:center;gap:10px}
.stu-boot .spin{width:12px;height:12px;border:2px solid var(--line2);border-top-color:var(--amber);border-radius:50%;animation:stuspin .7s linear infinite}
.stu-frame{position:relative;width:min(760px,100%);border-radius:10px}
.fmt-deck .stu-frame{width:min(700px,100%)}
.fmt-doc .stu-frame{width:min(600px,100%)}
.fmt-site .stu-frame{width:min(880px,100%)}
.stu-ftag{position:absolute;top:8px;left:10px;z-index:4;font-family:var(--mono);font-size:9px;letter-spacing:.14em;color:var(--blue);opacity:.8;transition:opacity .4s}
.stu-frame.is-done .stu-ftag{opacity:0}
.stu-frame:not(.is-done) .stu-proof{display:none}
.stu-frame.is-done .stu-sk{display:none}
.stu-sk{position:relative;border:1px solid rgba(110,168,255,.16);border-radius:10px;background:repeating-linear-gradient(-45deg,transparent 0 9px,rgba(110,168,255,.08) 9px 10px),#1c2129;padding:30px;display:flex;gap:20px;min-height:190px;overflow:hidden}
.fmt-deck .stu-sk{min-height:300px}
.stu-col{display:flex;flex-direction:column;gap:12px;justify-content:center;min-width:0}
.stu-bar{height:12px;border-radius:4px;background:rgba(110,168,255,.14);border:1px solid rgba(110,168,255,.22);position:relative;overflow:hidden}
.stu-imgsk{flex:1;display:grid;place-items:center;border:1px solid rgba(110,168,255,.22);border-radius:6px;background:rgba(110,168,255,.1);color:var(--blue);font-size:30px;opacity:.5}
.stu-frame.is-active .stu-bar::after{content:"";position:absolute;inset:0;background:linear-gradient(90deg,transparent,rgba(255,180,84,.2),transparent);transform:translateX(-100%);animation:stushim 1.25s infinite}
.stu-scan{position:absolute;left:0;right:0;height:56px;background:linear-gradient(rgba(255,180,84,.16),transparent);border-top:1px solid var(--amber);animation:stuscan 1.9s ease-in-out infinite;pointer-events:none}
.stu-frame.is-active .stu-sk{box-shadow:inset 0 0 0 1px var(--amber),0 0 30px -6px rgba(255,180,84,.16)}
.stu-status{position:absolute;bottom:14px;left:30px;display:flex;align-items:center;gap:8px;font-family:var(--mono);font-size:11px;text-transform:uppercase;letter-spacing:.12em;color:var(--amber)}
.stu-status .ping{width:6px;height:6px;border-radius:50%;background:var(--amber);animation:stuping 1.2s infinite}
.stu-proof{border:1px solid var(--line);border-radius:10px;overflow:hidden;box-shadow:0 30px 60px -40px #000}
.stu-foot{grid-column:2;border-top:1px solid var(--line);background:linear-gradient(transparent,#171b22);padding:12px 28px;display:flex;align-items:center;gap:20px}
.stu-phase{font-family:var(--mono);font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--ink2);display:flex;align-items:center;gap:9px;min-width:180px}
.stu-phase i{width:6px;height:6px;border-radius:50%;background:var(--amber);animation:stupulse 1.4s infinite}
.stu-foot.done .stu-phase i{background:var(--teal);animation:none}
.stu-steps{display:flex;gap:16px;align-items:center;min-width:230px;font-family:var(--mono);font-size:10px;letter-spacing:.1em;text-transform:uppercase}
.stu-step{display:flex;align-items:center;gap:6px;color:var(--ink3)}
.stu-step i{width:6px;height:6px;border-radius:50%;background:var(--line2);transition:background .3s}
.stu-step.active{color:var(--amber)}
.stu-step.active i{background:var(--amber);animation:stupulse 1.4s infinite}
.stu-step.done{color:var(--teal)}
.stu-step.done i{background:var(--teal)}
.stu-narr-wrap{min-height:0;display:flex;flex-direction:column;flex:1}
.stu-narr{display:flex;flex-direction:column;gap:8px;overflow-y:auto;padding-right:2px}
.stu-narr-line{display:flex;gap:8px;font-size:12px;line-height:1.4;color:var(--ink3);opacity:.7}
.stu-narr-line.active{color:var(--ink);opacity:1}
.stu-narr-line .ndot{width:5px;height:5px;border-radius:50%;background:var(--line2);margin-top:5px;flex:none}
.stu-narr-line.active .ndot{background:var(--amber);animation:stupulse 1.3s infinite}
.stu-narr-line .txt{min-width:0}
.stu-narr-line .mono{font-family:var(--mono);font-size:10.5px;color:var(--amber);margin-left:2px}
.stu-narr-line .sub{display:block;color:var(--ink3);font-size:11px;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.stu-ticks{display:flex;gap:4px;flex:1;flex-wrap:wrap}
.stu-ticks i{width:22px;height:4px;border-radius:2px;background:var(--line2)}
.stu-ticks i.active{background:var(--amber)}.stu-ticks i.done{background:var(--teal)}
.stu-count{font-family:var(--mono);font-size:12px;color:#e9edf4;font-variant-numeric:tabular-nums;letter-spacing:.05em}
.stu-donecta{display:flex;gap:10px;align-items:center;margin-left:auto}
.stu-primary{border:0;background:var(--teal);color:#06231c;font-weight:600;font-size:13px;padding:9px 18px;border-radius:9px}
.stu-primary:hover{box-shadow:0 0 0 3px rgba(70,214,176,.22)}
@keyframes stupulse{0%{box-shadow:0 0 0 0 rgba(255,180,84,.4)}70%{box-shadow:0 0 0 6px transparent}100%{box-shadow:0 0 0 0 transparent}}
@keyframes stushim{100%{transform:translateX(100%)}}
@keyframes stuscan{0%{top:-56px}100%{top:100%}}
@keyframes stuspin{100%{transform:rotate(360deg)}}
@keyframes stuping{0%{box-shadow:0 0 0 0 rgba(255,180,84,.4)}70%{box-shadow:0 0 0 5px transparent}100%{box-shadow:0 0 0 0 transparent}}
@media (max-width:820px){.stu-build{grid-template-columns:1fr}.stu-rail{display:none}.stu-foot{grid-column:1}}
@media (prefers-reduced-motion:reduce){.stu *{animation-duration:.001s!important}}
`;
