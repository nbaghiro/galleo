import type { Component } from "solid-js";
import { For, Show, createResource, createSignal } from "solid-js";
import type { ModelSpan } from "@model/ai";
import type { EvalCheck, EvalRun } from "@model/eval";
import { spansForStep, stepsOf, tokensOf } from "@model/eval";
import { api, setTraceTurns, traceTurns } from "../api";

// Deliberately unstyled: this is the eval playground's plain form, so the data and the wiring can be
// exercised before any layout work happens.

const ms = (n: number): string => (n < 1000 ? `${n}ms` : `${(n / 1000).toFixed(1)}s`);

const Checks: Component<{ checks: EvalCheck[]; target: string }> = (props) => {
    const mine = (): EvalCheck[] => props.checks.filter((c) => c.target === props.target);
    return (
        <Show when={mine().length}>
            <ul>
                <For each={mine()}>
                    {(c) => (
                        <li>
                            {c.pass ? "PASS" : "FAIL"} · {c.id} ({c.dimension})
                            <Show when={c.detail}>{(d) => <> — {d()}</>}</Show>
                        </li>
                    )}
                </For>
            </ul>
        </Show>
    );
};

const SpanDetail: Component<{ span: ModelSpan }> = (props) => (
    <div>
        <p>
            {props.span.modelId} · {props.span.input} in / {props.span.output} out ·{" "}
            {ms(props.span.ms)}
            <Show when={props.span.temperature !== undefined}>
                {" "}
                · temp {props.span.temperature}
            </Show>
            <Show when={props.span.finishReason}>{(r) => <> · {r()}</>}</Show>
        </p>
        <Show when={props.span.system}>
            {(t) => (
                <>
                    <h4>System prompt</h4>
                    <pre>{t()}</pre>
                </>
            )}
        </Show>
        <Show when={props.span.prompt}>
            {(t) => (
                <>
                    <h4>User prompt</h4>
                    <pre>{t()}</pre>
                </>
            )}
        </Show>
        <Show when={props.span.response}>
            {(t) => (
                <>
                    <h4>Response</h4>
                    <pre>{t()}</pre>
                </>
            )}
        </Show>
    </div>
);

const RunDetail: Component<{ id: string; onClose: () => void }> = (props) => {
    const [run] = createResource(
        () => props.id,
        async (id) => (await api.getEvalRun(id)).run,
    );
    const [step, setStep] = createSignal<string | null>(null);
    return (
        <Show when={run()} fallback={<p>Loading run…</p>}>
            {(r: () => EvalRun) => (
                <section>
                    <button onClick={props.onClose}>← back to runs</button>
                    <h2>{r().config.meta.prompt || "(no prompt)"}</h2>
                    <p>
                        {r().config.kind} · {r().config.meta.surface} · {r().config.meta.length} ·{" "}
                        {r().status} · {ms(r().ms)} · {r().tokensIn} in / {r().tokensOut} out
                    </p>
                    <Show when={r().error}>{(e) => <p>Error: {e()}</p>}</Show>

                    <h3>Models</h3>
                    <ul>
                        <For each={Object.entries(r().config.meta.models)}>
                            {([task, model]) => (
                                <li>
                                    {task}: {model}
                                </li>
                            )}
                        </For>
                    </ul>

                    <h3>Checks (artifact)</h3>
                    <Checks checks={r().checks} target="artifact" />

                    <h3>Steps</h3>
                    <ul>
                        <For each={stepsOf(r().spans)}>
                            {(s) => {
                                const calls = (): ModelSpan[] => spansForStep(r().spans, s);
                                const t = (): { input: number; output: number } =>
                                    tokensOf(calls());
                                return (
                                    <li>
                                        <button onClick={() => setStep(step() === s ? null : s)}>
                                            {s}
                                        </button>{" "}
                                        · {calls().length} call{calls().length === 1 ? "" : "s"} ·{" "}
                                        {t().input} in / {t().output} out
                                        <Show when={step() === s}>
                                            <For each={calls()}>
                                                {(sp) => <SpanDetail span={sp} />}
                                            </For>
                                            {/* write-section stamps the beat id onto the section,
                                                so a "section:<id>" step and its checks share a key */}
                                            <Checks checks={r().checks} target={s} />
                                        </Show>
                                    </li>
                                );
                            }}
                        </For>
                    </ul>
                </section>
            )}
        </Show>
    );
};

export const EvalView: Component = () => {
    const [page] = createResource(() => api.listEvalRuns());
    const [open, setOpen] = createSignal<string | null>(null);

    const [tracing, setTracing] = createSignal(traceTurns());
    const toggle = (): void => {
        const next = !tracing();
        setTraceTurns(next);
        setTracing(next);
    };

    return (
        <main>
            <h1>Eval runs</h1>
            <p>
                <label>
                    <input type="checkbox" checked={tracing()} onChange={toggle} /> Trace my
                    generations
                </label>{" "}
                — records every model call of a run. Generate from the studio as usual; runs show up
                here.
            </p>
            <Show
                when={!open()}
                fallback={<RunDetail id={open()!} onClose={() => setOpen(null)} />}
            >
                <Show when={page()} fallback={<p>Loading…</p>}>
                    {(p) => (
                        <Show when={p().runs.length} fallback={<p>No traced runs yet.</p>}>
                            <table>
                                <thead>
                                    <tr>
                                        <th>When</th>
                                        <th>Prompt</th>
                                        <th>Kind</th>
                                        <th>Status</th>
                                        <th>Checks</th>
                                        <th>Tokens</th>
                                        <th>Time</th>
                                        <th />
                                    </tr>
                                </thead>
                                <tbody>
                                    <For each={p().runs}>
                                        {(r) => (
                                            <tr>
                                                <td>{new Date(r.at).toLocaleString()}</td>
                                                <td>{r.config.meta.prompt.slice(0, 60)}</td>
                                                <td>{r.config.kind}</td>
                                                <td>{r.status}</td>
                                                <td>
                                                    {r.checksPassed}/{r.checksRun}
                                                </td>
                                                <td>
                                                    {r.tokensIn}/{r.tokensOut}
                                                </td>
                                                <td>{ms(r.ms)}</td>
                                                <td>
                                                    <button onClick={() => setOpen(r.id)}>
                                                        open
                                                    </button>
                                                </td>
                                            </tr>
                                        )}
                                    </For>
                                </tbody>
                            </table>
                        </Show>
                    )}
                </Show>
            </Show>
        </main>
    );
};
