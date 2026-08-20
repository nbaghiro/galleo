import type { Component, JSX } from "solid-js";
import { createEffect, createSignal, For, Index, onCleanup, onMount, Show } from "solid-js";
import { createStore, produce } from "solid-js/store";
import type { ElementAddress } from "@model/artifact";
import { elementRegionId } from "@model/artifact";
import { getElementAt, updateDataAt } from "@elements/ops";
import { getElement } from "@elements/spec";
import { renderToCanvas } from "@canvas/render/backends";
import { layout } from "@engine/layout";
import { measureText } from "@canvas/render/commands";
import { diagramColors, diagramSupportsIcons } from "@elements/diagram/utils";
import { ICON_LIBRARY } from "@elements/media/vector";
import { paintedNodeFor } from "@editor/core/leaf";
import { canvasContentWidth, commit, editor, editorTokens, regions } from "@editor/core/store";
import { claimLease, elementRefFor, leaseHolder, releaseLease, say } from "@editor/core/collab";
import { Badge, Button } from "@ui/button";
import { Icon } from "@ui/icons";
import { CellInput } from "@ui/inputs";
import { Modal } from "@ui/overlay";
import { ColorField, SchemaFields } from "./SharedControlFields";
import {
    dataShapeFor,
    parseModel,
    removeHierNode,
    serializeModel,
    invalidNumber,
    itemLimit,
    limitNote,
    usesItemValue,
    DATA_KEYS,
    type DataModel,
    type GraphModel,
    type HierModel,
    type Kind,
    type KvModel,
    type ListModel,
    type MatrixModel,
    type PointsModel,
    type ScalarModel,
    type SeriesModel,
    type Shape,
} from "@editor/core/infographic";

const TH =
    "sticky top-0 z-[1] whitespace-nowrap border-b border-line bg-canvas px-2.5 py-2 text-left text-[12px] font-semibold text-soft";
const CELL = "border-b border-r border-line/50";
// still used by the cell-embedded native <select>s
const IN =
    "w-full min-w-18 bg-transparent px-2.5 py-2 text-[13px] text-ink outline-none focus:bg-canvas";
const DEL = "px-2 text-[13px] text-muted transition-colors hover:text-accent";
const numRing = (v: string): string =>
    invalidNumber(v) ? "rounded-sm bg-rose-500/5 ring-1 ring-inset ring-rose-400/70" : "";

export const DataGrid: Component<{ address: ElementAddress; compact?: boolean }> = (props) => {
    const addr = props.address;
    const inst0 = getElementAt(editor.artifact, addr);
    const spec = inst0 ? getElement(inst0.type) : undefined;
    const data0 = (inst0?.data ?? {}) as Record<string, unknown>;
    const kind: Kind = spec?.category === "diagram" ? "diagram" : "chart";
    const type = String(data0.type ?? "");
    const shape: Shape = dataShapeFor(spec?.category ?? "", type) ?? "series";
    const rowAxis = type === "radar" ? "Axis" : "Category";

    const [model, setModel] = createStore<DataModel>(parseModel(kind, shape, data0));

    const limit = itemLimit(kind, type);
    const valued = usesItemValue(kind, type);
    const withIcons = kind === "diagram" && diagramSupportsIcons(type);
    // what the ramp gives row i of n when no override is set; the color swatch shows it as Auto
    const rampColor = (i: number, n: number): string =>
        diagramColors(editorTokens(), n)[i] ?? editorTokens().accent;

    interface MetaRow {
        icon: string;
        color: string;
        emphasis: boolean;
    }
    const metaHeads = (): JSX.Element => (
        <>
            <Show when={withIcons}>
                <th class={`${TH} min-w-26`}>Icon</th>
            </Show>
            <th class={TH}>Color</th>
            <th class={`${TH} text-center`}>Emphasis</th>
        </>
    );
    const metaCells = (
        row: () => MetaRow,
        write: (patch: Partial<MetaRow>, suffix: string) => void,
        ramp: string,
    ): JSX.Element => (
        <>
            <Show when={withIcons}>
                <td class={CELL}>
                    <select
                        class={`${IN} cursor-pointer`}
                        value={row().icon}
                        onChange={(e) => write({ icon: e.currentTarget.value }, "icon")}
                    >
                        <option value="">—</option>
                        <For each={Object.keys(ICON_LIBRARY)}>
                            {(k) => <option value={k}>{k}</option>}
                        </For>
                    </select>
                </td>
            </Show>
            <td class={`${CELL} px-2`}>
                <ColorField
                    value={row().color || undefined}
                    effective={ramp}
                    onChange={(v) => write({ color: v ?? "" }, "color")}
                    allowClear
                />
            </td>
            <td class={`${CELL} text-center`}>
                <input
                    type="checkbox"
                    class="size-3.5 accent-accent"
                    checked={row().emphasis}
                    onChange={(e) => write({ emphasis: e.currentTarget.checked }, "emph")}
                />
            </td>
        </>
    );
    const overLimit = (): boolean =>
        limit !== undefined && model.shape === "list" && model.items.length >= limit;

    const currentData = (): Record<string, unknown> =>
        (getElementAt(editor.artifact, addr)?.data ?? {}) as Record<string, unknown>;

    // edits under one field coalesce into one undo step; a new field or structural op starts another
    function apply(coalesceSuffix: string): void {
        commit(
            updateDataAt(editor.artifact, addr, {
                ...currentData(),
                ...serializeModel(kind, model),
            }),
            { coalesce: `data:${elementRegionId(addr)}:${coalesceSuffix}` },
        );
    }
    const edit = (mut: (m: DataModel) => void, suffix: string): void => {
        setModel(produce(mut));
        apply(suffix);
    };

    // produce() hands the mutator the whole union, so each grid branch pairs its mutator with the
    // variant it edits. The runtime tag check is what makes the narrowing real: the store holds one
    // variant at a time, and an edit aimed at another one is skipped rather than asserted through.
    const editSeries = (mut: (m: SeriesModel) => void, suffix: string): void =>
        edit((d) => {
            if (d.shape === "series") mut(d);
        }, suffix);
    const editKv = (mut: (m: KvModel) => void, suffix: string): void =>
        edit((d) => {
            if (d.shape === "labelValue") mut(d);
        }, suffix);
    const editPoints = (mut: (m: PointsModel) => void, suffix: string): void =>
        edit((d) => {
            if (d.shape === "points") mut(d);
        }, suffix);
    const editMatrix = (mut: (m: MatrixModel) => void, suffix: string): void =>
        edit((d) => {
            if (d.shape === "matrix") mut(d);
        }, suffix);
    const editScalar = (mut: (m: ScalarModel) => void, suffix: string): void =>
        edit((d) => {
            if (d.shape === "scalar") mut(d);
        }, suffix);
    const editList = (mut: (m: ListModel) => void, suffix: string): void =>
        edit((d) => {
            if (d.shape === "list") mut(d);
        }, suffix);
    const editHier = (mut: (m: HierModel) => void, suffix: string): void =>
        edit((d) => {
            if (d.shape === "hierarchy") mut(d);
        }, suffix);
    const editGraph = (mut: (m: GraphModel) => void, suffix: string): void =>
        edit((d) => {
            if (d.shape === "graph") mut(d);
        }, suffix);

    const options = (labels: string[]): JSX.Element => (
        <>
            <option value="">— (root)</option>
            <For each={labels}>{(l) => <option value={l}>{l}</option>}</For>
        </>
    );

    const grid = (): JSX.Element => {
        if (model.shape === "series") {
            const m = model;
            return (
                <table class="w-full border-collapse">
                    <thead>
                        <tr>
                            <th class={TH}>{rowAxis}</th>
                            <Index each={m.series}>
                                {(sr, si) => (
                                    <th class={TH}>
                                        <div class="flex items-center">
                                            <CellInput
                                                class="font-semibold"
                                                value={sr().name}
                                                onChange={(v) =>
                                                    editSeries((draft) => {
                                                        draft.series[si]!.name = v;
                                                    }, `sname${si}`)
                                                }
                                            />
                                            <button
                                                class={DEL}
                                                title="Remove series"
                                                onClick={() =>
                                                    editSeries((draft) => {
                                                        draft.series.splice(si, 1);
                                                    }, "struct")
                                                }
                                            >
                                                <Icon name="close" size={11} />
                                            </button>
                                        </div>
                                    </th>
                                )}
                            </Index>
                            <th class={TH} />
                        </tr>
                    </thead>
                    <tbody>
                        <Index each={m.categories}>
                            {(cat, ci) => (
                                <tr>
                                    <td class={CELL}>
                                        <CellInput
                                            class="font-medium text-soft"
                                            value={cat()}
                                            onChange={(v) =>
                                                editSeries((draft) => {
                                                    draft.categories[ci] = v;
                                                }, `cat${ci}`)
                                            }
                                        />
                                    </td>
                                    <Index each={m.series}>
                                        {(_sr, si) => (
                                            <td class={CELL}>
                                                <CellInput
                                                    numeric
                                                    class={numRing(m.series[si]!.values[ci] ?? "")}
                                                    value={m.series[si]!.values[ci] ?? ""}
                                                    onChange={(v) =>
                                                        editSeries((draft) => {
                                                            draft.series[si]!.values[ci] = v;
                                                        }, `v${si}-${ci}`)
                                                    }
                                                />
                                            </td>
                                        )}
                                    </Index>
                                    <td class="border-b border-line/50 text-center">
                                        <button
                                            class={DEL}
                                            title="Remove row"
                                            onClick={() =>
                                                editSeries((draft) => {
                                                    const s = draft;
                                                    s.categories.splice(ci, 1);
                                                    s.series.forEach((x) => x.values.splice(ci, 1));
                                                }, "struct")
                                            }
                                        >
                                            <Icon name="close" size={11} />
                                        </button>
                                    </td>
                                </tr>
                            )}
                        </Index>
                    </tbody>
                </table>
            );
        }
        if (model.shape === "labelValue") {
            const m = model;
            return (
                <table class="w-full border-collapse">
                    <thead>
                        <tr>
                            <th class={`${TH} w-full`}>Label</th>
                            <th class={TH}>Value</th>
                            <th class={TH} />
                        </tr>
                    </thead>
                    <tbody>
                        <Index each={m.items}>
                            {(it, i) => (
                                <tr>
                                    <td class={CELL}>
                                        <CellInput
                                            value={it().label}
                                            onChange={(v) =>
                                                editKv((draft) => {
                                                    draft.items[i]!.label = v;
                                                }, `lbl${i}`)
                                            }
                                        />
                                    </td>
                                    <td class={CELL}>
                                        <CellInput
                                            numeric
                                            class={numRing(it().value)}
                                            value={it().value}
                                            onChange={(v) =>
                                                editKv((draft) => {
                                                    draft.items[i]!.value = v;
                                                }, `val${i}`)
                                            }
                                        />
                                    </td>
                                    <td class="border-b border-line/50 text-center">
                                        <button
                                            class={DEL}
                                            onClick={() =>
                                                editKv((draft) => {
                                                    draft.items.splice(i, 1);
                                                }, "struct")
                                            }
                                        >
                                            <Icon name="close" size={11} />
                                        </button>
                                    </td>
                                </tr>
                            )}
                        </Index>
                    </tbody>
                </table>
            );
        }
        if (model.shape === "points") {
            const m = model;
            return (
                <table class="w-full border-collapse">
                    <thead>
                        <tr>
                            <th class={`${TH} w-8 text-center`}>#</th>
                            <th class={TH}>X</th>
                            <th class={TH}>Y</th>
                            <Show when={m.dims === 3}>
                                <th class={TH}>Size</th>
                            </Show>
                            <th class={TH} />
                        </tr>
                    </thead>
                    <tbody>
                        <Index each={m.points}>
                            {(pt, i) => (
                                <tr>
                                    <td class="border-b border-r border-line/50 px-2 text-center font-mono text-[11px] text-muted">
                                        {i + 1}
                                    </td>
                                    <td class={CELL}>
                                        <CellInput
                                            numeric
                                            class={numRing(pt().x)}
                                            value={pt().x}
                                            onChange={(v) =>
                                                editPoints((draft) => {
                                                    draft.points[i]!.x = v;
                                                }, `x${i}`)
                                            }
                                        />
                                    </td>
                                    <td class={CELL}>
                                        <CellInput
                                            numeric
                                            class={numRing(pt().y)}
                                            value={pt().y}
                                            onChange={(v) =>
                                                editPoints((draft) => {
                                                    draft.points[i]!.y = v;
                                                }, `y${i}`)
                                            }
                                        />
                                    </td>
                                    <Show when={m.dims === 3}>
                                        <td class={CELL}>
                                            <CellInput
                                                numeric
                                                class={numRing(pt().size)}
                                                value={pt().size}
                                                onChange={(v) =>
                                                    editPoints((draft) => {
                                                        draft.points[i]!.size = v;
                                                    }, `z${i}`)
                                                }
                                            />
                                        </td>
                                    </Show>
                                    <td class="border-b border-line/50 text-center">
                                        <button
                                            class={DEL}
                                            onClick={() =>
                                                editPoints((draft) => {
                                                    draft.points.splice(i, 1);
                                                }, "struct")
                                            }
                                        >
                                            <Icon name="close" size={11} />
                                        </button>
                                    </td>
                                </tr>
                            )}
                        </Index>
                    </tbody>
                </table>
            );
        }
        if (model.shape === "matrix") {
            const m = model;
            return (
                <table class="w-full border-collapse">
                    <thead>
                        <tr>
                            <th class={`${TH} bg-panel`} />
                            <Index each={m.cols}>
                                {(col, ci) => (
                                    <th class={TH}>
                                        <CellInput
                                            class="font-semibold"
                                            value={col()}
                                            onChange={(v) =>
                                                editMatrix((draft) => {
                                                    draft.cols[ci] = v;
                                                }, `col${ci}`)
                                            }
                                        />
                                    </th>
                                )}
                            </Index>
                        </tr>
                    </thead>
                    <tbody>
                        <Index each={m.rows}>
                            {(row, ri) => (
                                <tr>
                                    <td class={`${CELL} bg-canvas`}>
                                        <CellInput
                                            class="font-medium text-soft"
                                            value={row()}
                                            onChange={(v) =>
                                                editMatrix((draft) => {
                                                    draft.rows[ri] = v;
                                                }, `row${ri}`)
                                            }
                                        />
                                    </td>
                                    <Index each={m.cols}>
                                        {(_c, ci) => (
                                            <td class={CELL}>
                                                <CellInput
                                                    numeric
                                                    class={numRing(m.cells[ri]?.[ci] ?? "")}
                                                    value={m.cells[ri]?.[ci] ?? ""}
                                                    onChange={(v) =>
                                                        editMatrix((draft) => {
                                                            draft.cells[ri]![ci] = v;
                                                        }, `c${ri}-${ci}`)
                                                    }
                                                />
                                            </td>
                                        )}
                                    </Index>
                                </tr>
                            )}
                        </Index>
                    </tbody>
                </table>
            );
        }
        if (model.shape === "scalar") {
            const m = model;
            const field = (label: string, key: "value" | "max"): JSX.Element => (
                <label class="flex items-center justify-between gap-3">
                    <span class="text-[13px] text-soft">{label}</span>
                    <input
                        class={`w-28 rounded-lg border bg-canvas px-3 py-2 text-right font-mono text-[14px] text-ink outline-none focus:border-accent ${invalidNumber(m[key]) ? "border-rose-400/70 ring-1 ring-rose-400/70" : "border-line"}`}
                        value={m[key]}
                        onInput={(e) =>
                            editScalar((draft) => {
                                draft[key] = e.currentTarget.value;
                            }, key)
                        }
                    />
                </label>
            );
            return (
                <div class="flex max-w-sm flex-col gap-4 py-2">
                    <p class="text-[13px] text-muted">A gauge shows one value against a maximum.</p>
                    {field("Value", "value")}
                    {field("Maximum", "max")}
                </div>
            );
        }
        if (model.shape === "list") {
            const m = model;
            return (
                <table class="w-full border-collapse">
                    <thead>
                        <tr>
                            <th class={`${TH} w-8 text-center`}>#</th>
                            <th class={`${TH} w-2/5`}>Item</th>
                            <th class={`${TH} w-full`}>Detail</th>
                            <Show when={valued}>
                                <th class={`${TH} w-20`}>Value</th>
                            </Show>
                            {metaHeads()}
                            <th class={TH} />
                        </tr>
                    </thead>
                    <tbody>
                        <Index each={m.items}>
                            {(it, i) => (
                                <tr>
                                    <td class="border-b border-r border-line/50 px-2 text-center font-mono text-[11px] text-muted">
                                        {i + 1}
                                    </td>
                                    <td class={CELL}>
                                        <CellInput
                                            value={it().label}
                                            onChange={(v) =>
                                                editList((draft) => {
                                                    draft.items[i]!.label = v;
                                                }, `item${i}`)
                                            }
                                        />
                                    </td>
                                    <td class={CELL}>
                                        <CellInput
                                            value={it().body}
                                            onChange={(v) =>
                                                editList((draft) => {
                                                    draft.items[i]!.body = v;
                                                }, `body${i}`)
                                            }
                                        />
                                    </td>
                                    <Show when={valued}>
                                        <td class={CELL}>
                                            <CellInput
                                                class={numRing(it().value)}
                                                value={it().value}
                                                onChange={(v) =>
                                                    editList((draft) => {
                                                        draft.items[i]!.value = v;
                                                    }, `value${i}`)
                                                }
                                            />
                                        </td>
                                    </Show>
                                    {metaCells(
                                        it,
                                        (patch, sfx) =>
                                            editList((draft) => {
                                                Object.assign(draft.items[i]!, patch);
                                            }, `${sfx}${i}`),
                                        rampColor(i, m.items.length),
                                    )}
                                    <td class="border-b border-line/50 text-center">
                                        <button
                                            class={DEL}
                                            onClick={() =>
                                                editList((draft) => {
                                                    draft.items.splice(i, 1);
                                                }, "struct")
                                            }
                                        >
                                            <Icon name="close" size={11} />
                                        </button>
                                    </td>
                                </tr>
                            )}
                        </Index>
                    </tbody>
                </table>
            );
        }
        if (model.shape === "hierarchy") {
            const m = model;
            return (
                <table class="w-full border-collapse">
                    <thead>
                        <tr>
                            <th class={`${TH} w-8 text-center`}>#</th>
                            <th class={`${TH} w-2/5`}>Node</th>
                            <th class={`${TH} w-full`}>Detail</th>
                            <th class={`${TH} min-w-35`}>Reports to</th>
                            {metaHeads()}
                            <th class={TH} />
                        </tr>
                    </thead>
                    <tbody>
                        <Index each={m.nodes}>
                            {(nd, i) => (
                                <tr>
                                    <td class="border-b border-r border-line/50 px-2 text-center font-mono text-[11px] text-muted">
                                        {i + 1}
                                    </td>
                                    <td class={CELL}>
                                        <CellInput
                                            value={nd().label}
                                            onChange={(val) =>
                                                editHier((draft) => {
                                                    const h = draft;
                                                    const old = h.nodes[i]!.label;
                                                    h.nodes[i]!.label = val;
                                                    h.nodes.forEach((x) => {
                                                        if (x.parent === old) x.parent = val;
                                                    });
                                                }, `node${i}`)
                                            }
                                        />
                                    </td>
                                    <td class={CELL}>
                                        <CellInput
                                            value={nd().body}
                                            onChange={(v) =>
                                                editHier((draft) => {
                                                    draft.nodes[i]!.body = v;
                                                }, `body${i}`)
                                            }
                                        />
                                    </td>
                                    <td class={CELL}>
                                        <select
                                            class={`${IN} cursor-pointer`}
                                            value={nd().parent}
                                            onChange={(e) =>
                                                editHier((draft) => {
                                                    draft.nodes[i]!.parent = e.currentTarget.value;
                                                }, `parent${i}`)
                                            }
                                        >
                                            {options(
                                                m.nodes
                                                    .map((x) => x.label)
                                                    .filter((_l, j) => j !== i),
                                            )}
                                        </select>
                                    </td>
                                    {metaCells(
                                        nd,
                                        (patch, sfx) =>
                                            editHier((draft) => {
                                                Object.assign(draft.nodes[i]!, patch);
                                            }, `${sfx}${i}`),
                                        rampColor(i, m.nodes.length),
                                    )}
                                    <td class="border-b border-line/50 text-center">
                                        <button
                                            class={DEL}
                                            onClick={() =>
                                                editHier(
                                                    (draft) => removeHierNode(draft, i),
                                                    "struct",
                                                )
                                            }
                                        >
                                            <Icon name="close" size={11} />
                                        </button>
                                    </td>
                                </tr>
                            )}
                        </Index>
                    </tbody>
                </table>
            );
        }
        if (model.shape !== "graph") return null;
        const m = model;
        return (
            <div class="flex flex-col gap-6">
                <div>
                    <div class="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
                        Nodes
                    </div>
                    <table class="w-full border-collapse">
                        <tbody>
                            <Index each={m.nodes}>
                                {(nd, i) => (
                                    <tr>
                                        <td class={CELL}>
                                            <CellInput
                                                value={nd()}
                                                onChange={(v) =>
                                                    editGraph((draft) => {
                                                        draft.nodes[i] = v;
                                                    }, `gn${i}`)
                                                }
                                            />
                                        </td>
                                        <td class="border-b border-line/50 text-center">
                                            <button
                                                class={DEL}
                                                onClick={() =>
                                                    editGraph((draft) => {
                                                        draft.nodes.splice(i, 1);
                                                    }, "struct")
                                                }
                                            >
                                                <Icon name="close" size={11} />
                                            </button>
                                        </td>
                                    </tr>
                                )}
                            </Index>
                        </tbody>
                    </table>
                    <Button
                        variant="tool"
                        size="sm"
                        class="mt-2"
                        onClick={() =>
                            editGraph((draft) => {
                                draft.nodes.push("New");
                            }, "struct")
                        }
                    >
                        ＋ Node
                    </Button>
                </div>
                <div>
                    <div class="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
                        Edges
                    </div>
                    <table class="w-full border-collapse">
                        <thead>
                            <tr>
                                <th class={`${TH} min-w-30`}>From</th>
                                <th class={`${TH} min-w-30`}>To</th>
                                <th class={`${TH} w-full`}>Label</th>
                                <th class={TH} />
                            </tr>
                        </thead>
                        <tbody>
                            <Index each={m.edges}>
                                {(eg, i) => (
                                    <tr>
                                        <td class={CELL}>
                                            <select
                                                class={`${IN} cursor-pointer`}
                                                value={eg().from}
                                                onChange={(e) =>
                                                    editGraph((draft) => {
                                                        draft.edges[i]!.from =
                                                            e.currentTarget.value;
                                                    }, `ef${i}`)
                                                }
                                            >
                                                {options(m.nodes)}
                                            </select>
                                        </td>
                                        <td class={CELL}>
                                            <select
                                                class={`${IN} cursor-pointer`}
                                                value={eg().to}
                                                onChange={(e) =>
                                                    editGraph((draft) => {
                                                        draft.edges[i]!.to = e.currentTarget.value;
                                                    }, `et${i}`)
                                                }
                                            >
                                                {options(m.nodes)}
                                            </select>
                                        </td>
                                        <td class={CELL}>
                                            <CellInput
                                                value={eg().label}
                                                onChange={(v) =>
                                                    editGraph((draft) => {
                                                        draft.edges[i]!.label = v;
                                                    }, `el${i}`)
                                                }
                                            />
                                        </td>
                                        <td class="border-b border-line/50 text-center">
                                            <button
                                                class={DEL}
                                                onClick={() =>
                                                    editGraph((draft) => {
                                                        draft.edges.splice(i, 1);
                                                    }, "struct")
                                                }
                                            >
                                                <Icon name="close" size={11} />
                                            </button>
                                        </td>
                                    </tr>
                                )}
                            </Index>
                        </tbody>
                    </table>
                    <Button
                        variant="tool"
                        size="sm"
                        class="mt-2"
                        onClick={() =>
                            editGraph((draft) => {
                                const g = draft;
                                g.edges.push({
                                    from: g.nodes[0] ?? "",
                                    to: g.nodes[1] ?? "",
                                    label: "",
                                });
                            }, "struct")
                        }
                    >
                        ＋ Edge
                    </Button>
                </div>
            </div>
        );
    };

    const addRow = (): void =>
        edit((d) => {
            if (d.shape === "series") {
                d.categories.push("New");
                d.series.forEach((x) => x.values.push("0"));
            } else if (d.shape === "labelValue") d.items.push({ label: "New", value: "0" });
            else if (d.shape === "points") d.points.push({ x: "0", y: "0", size: "0" });
            else if (d.shape === "matrix") {
                d.rows.push("New");
                d.cells.push(d.cols.map(() => "0"));
            } else if (d.shape === "list") {
                const items = d.items;
                if (limit === undefined || items.length < limit)
                    items.push({
                        label: "New",
                        body: "",
                        value: "",
                        icon: "",
                        color: "",
                        emphasis: false,
                    });
            } else if (d.shape === "hierarchy") {
                const m = d;
                m.nodes.push({
                    label: "New",
                    body: "",
                    value: "",
                    parent: m.nodes[0]?.label ?? "",
                    icon: "",
                    color: "",
                    emphasis: false,
                });
            }
        }, "struct");
    const addSeries = (): void =>
        editSeries((draft) => {
            const m = draft;
            m.series.push({
                name: `Series ${m.series.length + 1}`,
                values: m.categories.map(() => "0"),
            });
        }, "struct");
    const addCol = (): void =>
        editMatrix((draft) => {
            const m = draft;
            m.cols.push("New");
            m.cells.forEach((r) => r.push("0"));
        }, "struct");

    const rowWord =
        shape === "series"
            ? "Category"
            : shape === "hierarchy"
              ? "Node"
              : shape === "matrix"
                ? "Row"
                : shape === "list"
                  ? "Item"
                  : "Row";

    return (
        <div
            class={props.compact ? "flex min-w-0 flex-col" : "flex min-h-0 min-w-0 flex-1 flex-col"}
        >
            <Show when={shape !== "scalar" && shape !== "graph"}>
                <div
                    class={`flex items-center gap-2 border-b border-line ${props.compact ? "px-2 py-2" : "px-4 py-2.5"}`}
                >
                    <Button variant="tool" size="sm" disabled={overLimit()} onClick={addRow}>
                        ＋ {rowWord}
                    </Button>
                    <Show when={shape === "series"}>
                        <Button variant="tool" size="sm" onClick={addSeries}>
                            ＋ Series
                        </Button>
                    </Show>
                    <Show when={shape === "matrix"}>
                        <Button variant="tool" size="sm" onClick={addCol}>
                            ＋ Column
                        </Button>
                    </Show>
                </div>
            </Show>
            <div class={props.compact ? "max-h-80 overflow-auto p-2" : "flex-1 overflow-auto p-4"}>
                <Show when={limit !== undefined}>
                    <div
                        class="mb-3 rounded-lg border px-3 py-2 text-[12px]"
                        classList={{
                            "border-line bg-canvas text-muted": !overLimit(),
                            "border-accent/50 bg-accent/10 text-accent": overLimit(),
                        }}
                    >
                        {limitNote(type)}
                    </div>
                </Show>
                {grid()}
            </div>
        </div>
    );
};

const [target, setTarget] = createSignal<ElementAddress | null>(null);
// The grid writes the same element a text session would, so it takes the same lease.
export function openDataEditor(address: ElementAddress): void {
    const holder = leaseHolder(address);
    if (holder) {
        say(`${holder.user.name || "Someone"} is editing this`);
        return;
    }
    const ref = elementRefFor(address);
    if (ref) claimLease(ref);
    setTarget(address);
}
function close(): void {
    const open = target();
    const ref = open && elementRefFor(open);
    if (ref) releaseLease(ref);
    setTarget(null);
}

const Body: Component<{ address: ElementAddress }> = (props) => {
    const addr = props.address;
    const inst0 = getElementAt(editor.artifact, addr);
    const spec = inst0 ? getElement(inst0.type) : undefined;
    const kind: Kind = spec?.category === "diagram" ? "diagram" : "chart";

    let cv: HTMLCanvasElement | undefined;
    const currentData = (): Record<string, unknown> =>
        (getElementAt(editor.artifact, addr)?.data ?? {}) as Record<string, unknown>;

    // The grid commits every keystroke, so the artifact already holds the edit: recompose the
    // element exactly as the canvas paints it (token ramp, container restyling, contrast swap),
    // lay it out at its painted box, and scale the result to fit — never re-lay-out at the
    // panel's width, which would wrap a process into a stack the canvas doesn't show.
    function drawPreview(): void {
        if (!cv) return;
        const pw = cv.clientWidth || 280;
        const ph = 168;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        cv.width = Math.round(pw * dpr);
        cv.height = Math.round(ph * dpr);
        cv.style.height = `${ph}px`;
        const cx = cv.getContext("2d");
        if (!cx) return;
        const sec = editor.artifact.sections.find((x) => x.id === addr.section);
        // the backdrop the element actually sits on: the section's own background, else the surface
        const bg =
            sec?.background?.kind === "color" && sec.background.color
                ? sec.background.color
                : sec?.background?.kind === "gradient" && sec.background.gradient
                  ? sec.background.gradient.from
                  : sec?.background?.kind === "image"
                    ? "#141414"
                    : editorTokens().surface;
        try {
            const node = paintedNodeFor(addr);
            if (!node) return;
            const box = regions().find((r) => r.id === elementRegionId(addr))?.box;
            const d = currentData();
            const w = box?.w ?? Math.min(960, canvasContentWidth() || 800);
            const h =
                box?.h ?? (typeof d.height === "number" ? d.height : kind === "chart" ? 240 : 260);
            const { commands } = layout(node, { x: 0, y: 0, w, h }, measureText);
            const s = Math.min(pw / w, ph / h);
            void renderToCanvas(commands, w, h, bg, dpr * s).then((img) => {
                cx.setTransform(1, 0, 0, 1, 0, 0);
                cx.fillStyle = bg;
                cx.fillRect(0, 0, cv!.width, cv!.height);
                cx.drawImage(
                    img,
                    (cv!.width - w * s * dpr) / 2,
                    (cv!.height - h * s * dpr) / 2,
                    w * s * dpr,
                    h * s * dpr,
                );
            });
        } catch {
            /* malformed intermediate value — skip this frame */
        }
    }
    createEffect(() => {
        currentData();
        void regions(); // the painted box follows canvas repaints (height drags, column resizes)
        drawPreview();
    });

    onMount(() => {
        const onKey = (e: KeyboardEvent): void => {
            if (e.key === "Escape") close();
        };
        window.addEventListener("keydown", onKey);
        onCleanup(() => window.removeEventListener("keydown", onKey));
    });

    // `type` stays in the config so SchemaFields' visibleWhen snapshot can gate per-type toggles.
    const configControls = (spec?.controls ?? []).filter((c) => !DATA_KEYS.has(c.key));
    const cfgRead = (k: string): unknown => currentData()[k];
    const cfgWrite = (k: string, v: unknown): void => {
        const ctrl = configControls.find((c) => c.key === k)?.control;
        const coalesce = ctrl === "slider" || ctrl === "color" ? `cfg:${k}` : undefined;
        commit(updateDataAt(editor.artifact, addr, { ...currentData(), [k]: v }), { coalesce });
    };

    return (
        <Modal
            scrim="blur"
            size="full"
            class="flex h-190 max-h-[90vh] w-[min(1140px,96vw)] flex-col overflow-hidden"
            onClose={close}
        >
            <div class="flex items-center gap-3 border-b border-line px-5 py-3">
                <div class="text-[15px] font-semibold">Edit data</div>
                <Badge tone="outline" size="md" weight="medium">
                    {spec?.label ?? "Element"}
                </Badge>
            </div>

            <div class="flex min-h-0 flex-1">
                <aside class="flex w-80 flex-none flex-col gap-4 overflow-y-auto border-r border-line p-4">
                    <div class="rounded-xl border border-line bg-canvas p-2.5">
                        <canvas ref={cv} class="block w-full rounded-md" />
                        <div class="mt-2 px-1 text-[10px] font-medium uppercase tracking-wider text-muted">
                            Live preview
                        </div>
                    </div>
                    <Show when={configControls.length > 0}>
                        <SchemaFields controls={configControls} read={cfgRead} write={cfgWrite} />
                    </Show>
                </aside>

                <DataGrid address={addr} />
            </div>

            <div class="flex items-center gap-2 border-t border-line px-5 py-3">
                <span class="text-[12px] text-muted">
                    Edits save to the element and update the canvas live.
                </span>
                <div class="flex-1" />
                <Button variant="primary" size="md" onClick={close}>
                    Done
                </Button>
            </div>
        </Modal>
    );
};

export const DataEditor: Component = () => (
    <Show when={target()} keyed>
        {(addr) => (
            // re-parse the grid on a type switch: a different type may have a different shape
            <Show
                when={
                    String(
                        (getElementAt(editor.artifact, addr)?.data as Record<string, unknown>)
                            ?.type ?? "",
                    ) || "?"
                }
                keyed
            >
                <Body address={addr} />
            </Show>
        )}
    </Show>
);
