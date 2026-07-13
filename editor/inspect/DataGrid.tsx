import type { Component, JSX } from "solid-js";
import { For, Index, Show } from "solid-js";
import { createStore, produce } from "solid-js/store";
import type { ElementAddress } from "@model/target";
import { elementRegionId } from "@model/target";
import { getElementAt, updateDataAt } from "@elements/ops";
import { getElement } from "@elements/spec";
import { commit, editor } from "../editor";
import { Button } from "@ui/button";
import { CellInput } from "@ui/inputs";
import {
    dataShapeFor,
    parseModel,
    serializeModel,
    invalidNumber,
    itemLimit,
    limitNote,
    type DataModel,
    type GraphModel,
    type HierModel,
    type Kind,
    type KvModel,
    type MatrixModel,
    type PointsModel,
    type ScalarModel,
    type SeriesModel,
    type Shape,
} from "./data-model";

const TH =
    "sticky top-0 z-[1] whitespace-nowrap border-b border-line bg-canvas px-2.5 py-2 text-left text-[12px] font-semibold text-soft";
const CELL = "border-b border-r border-line/50";
// Still used by the cell-embedded native <select>s (which stay bespoke).
const IN =
    "w-full min-w-[72px] bg-transparent px-2.5 py-2 text-[13px] text-ink outline-none focus:bg-canvas";
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
    const overLimit = (): boolean =>
        limit !== undefined &&
        shape === "list" &&
        (model as { items: string[] }).items.length >= limit;

    const currentData = (): Record<string, unknown> =>
        (getElementAt(editor.artifact, addr)?.data ?? {}) as Record<string, unknown>;

    // Edits under one field coalesce into a single undo step; a new field/structural op starts a new one.
    function apply(coalesceSuffix: string): void {
        commit(
            updateDataAt(editor.artifact, addr, {
                ...currentData(),
                ...serializeModel(kind, shape, model),
            }),
            { coalesce: `data:${elementRegionId(addr)}:${coalesceSuffix}` },
        );
    }
    const edit = (mut: (m: DataModel) => void, suffix: string): void => {
        setModel(produce(mut));
        apply(suffix);
    };

    const options = (labels: string[]): JSX.Element => (
        <>
            <option value="">— (root)</option>
            <For each={labels}>{(l) => <option value={l}>{l}</option>}</For>
        </>
    );

    const grid = (): JSX.Element => {
        if (shape === "series") {
            const m = model as SeriesModel;
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
                                                    edit((d) => {
                                                        (d as SeriesModel).series[si]!.name = v;
                                                    }, `sname${si}`)
                                                }
                                            />
                                            <button
                                                class={DEL}
                                                title="Remove series"
                                                onClick={() =>
                                                    edit((d) => {
                                                        (d as SeriesModel).series.splice(si, 1);
                                                    }, "struct")
                                                }
                                            >
                                                ✕
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
                                                edit((d) => {
                                                    (d as SeriesModel).categories[ci] = v;
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
                                                        edit((d) => {
                                                            (d as SeriesModel).series[si]!.values[
                                                                ci
                                                            ] = v;
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
                                                edit((d) => {
                                                    const s = d as SeriesModel;
                                                    s.categories.splice(ci, 1);
                                                    s.series.forEach((x) => x.values.splice(ci, 1));
                                                }, "struct")
                                            }
                                        >
                                            ✕
                                        </button>
                                    </td>
                                </tr>
                            )}
                        </Index>
                    </tbody>
                </table>
            );
        }
        if (shape === "labelValue") {
            const m = model as KvModel;
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
                                                edit((d) => {
                                                    (d as KvModel).items[i]!.label = v;
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
                                                edit((d) => {
                                                    (d as KvModel).items[i]!.value = v;
                                                }, `val${i}`)
                                            }
                                        />
                                    </td>
                                    <td class="border-b border-line/50 text-center">
                                        <button
                                            class={DEL}
                                            onClick={() =>
                                                edit((d) => {
                                                    (d as KvModel).items.splice(i, 1);
                                                }, "struct")
                                            }
                                        >
                                            ✕
                                        </button>
                                    </td>
                                </tr>
                            )}
                        </Index>
                    </tbody>
                </table>
            );
        }
        if (shape === "points") {
            const m = model as PointsModel;
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
                                                edit((d) => {
                                                    (d as PointsModel).points[i]!.x = v;
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
                                                edit((d) => {
                                                    (d as PointsModel).points[i]!.y = v;
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
                                                    edit((d) => {
                                                        (d as PointsModel).points[i]!.size = v;
                                                    }, `z${i}`)
                                                }
                                            />
                                        </td>
                                    </Show>
                                    <td class="border-b border-line/50 text-center">
                                        <button
                                            class={DEL}
                                            onClick={() =>
                                                edit((d) => {
                                                    (d as PointsModel).points.splice(i, 1);
                                                }, "struct")
                                            }
                                        >
                                            ✕
                                        </button>
                                    </td>
                                </tr>
                            )}
                        </Index>
                    </tbody>
                </table>
            );
        }
        if (shape === "matrix") {
            const m = model as MatrixModel;
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
                                                edit((d) => {
                                                    (d as MatrixModel).cols[ci] = v;
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
                                                edit((d) => {
                                                    (d as MatrixModel).rows[ri] = v;
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
                                                        edit((d) => {
                                                            (d as MatrixModel).cells[ri]![ci] = v;
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
        if (shape === "scalar") {
            const m = model as ScalarModel;
            const field = (label: string, key: "value" | "max"): JSX.Element => (
                <label class="flex items-center justify-between gap-3">
                    <span class="text-[13px] text-soft">{label}</span>
                    <input
                        class={`w-28 rounded-lg border bg-canvas px-3 py-2 text-right font-mono text-[14px] text-ink outline-none focus:border-accent ${invalidNumber(m[key]) ? "border-rose-400/70 ring-1 ring-rose-400/70" : "border-line"}`}
                        value={m[key]}
                        onInput={(e) =>
                            edit((d) => {
                                (d as ScalarModel)[key] = e.currentTarget.value;
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
        if (shape === "list") {
            const m = model as { items: string[] };
            return (
                <table class="w-full border-collapse">
                    <thead>
                        <tr>
                            <th class={`${TH} w-8 text-center`}>#</th>
                            <th class={`${TH} w-full`}>Item</th>
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
                                            value={it()}
                                            onChange={(v) =>
                                                edit((d) => {
                                                    (d as { items: string[] }).items[i] = v;
                                                }, `item${i}`)
                                            }
                                        />
                                    </td>
                                    <td class="border-b border-line/50 text-center">
                                        <button
                                            class={DEL}
                                            onClick={() =>
                                                edit((d) => {
                                                    (d as { items: string[] }).items.splice(i, 1);
                                                }, "struct")
                                            }
                                        >
                                            ✕
                                        </button>
                                    </td>
                                </tr>
                            )}
                        </Index>
                    </tbody>
                </table>
            );
        }
        if (shape === "hierarchy") {
            const m = model as HierModel;
            return (
                <table class="w-full border-collapse">
                    <thead>
                        <tr>
                            <th class={`${TH} w-full`}>Node</th>
                            <th class={`${TH} min-w-[140px]`}>Reports to</th>
                            <th class={TH} />
                        </tr>
                    </thead>
                    <tbody>
                        <Index each={m.nodes}>
                            {(nd, i) => (
                                <tr>
                                    <td class={CELL}>
                                        <CellInput
                                            value={nd().label}
                                            onChange={(val) =>
                                                edit((d) => {
                                                    const h = d as HierModel;
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
                                        <select
                                            class={`${IN} cursor-pointer`}
                                            value={nd().parent}
                                            onChange={(e) =>
                                                edit((d) => {
                                                    (d as HierModel).nodes[i]!.parent =
                                                        e.currentTarget.value;
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
                                    <td class="border-b border-line/50 text-center">
                                        <button
                                            class={DEL}
                                            onClick={() =>
                                                edit((d) => {
                                                    (d as HierModel).nodes.splice(i, 1);
                                                }, "struct")
                                            }
                                        >
                                            ✕
                                        </button>
                                    </td>
                                </tr>
                            )}
                        </Index>
                    </tbody>
                </table>
            );
        }
        const m = model as GraphModel;
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
                                                    edit((d) => {
                                                        (d as GraphModel).nodes[i] = v;
                                                    }, `gn${i}`)
                                                }
                                            />
                                        </td>
                                        <td class="border-b border-line/50 text-center">
                                            <button
                                                class={DEL}
                                                onClick={() =>
                                                    edit((d) => {
                                                        (d as GraphModel).nodes.splice(i, 1);
                                                    }, "struct")
                                                }
                                            >
                                                ✕
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
                            edit((d) => {
                                (d as GraphModel).nodes.push("New");
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
                                <th class={`${TH} min-w-[120px]`}>From</th>
                                <th class={`${TH} min-w-[120px]`}>To</th>
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
                                                    edit((d) => {
                                                        (d as GraphModel).edges[i]!.from =
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
                                                    edit((d) => {
                                                        (d as GraphModel).edges[i]!.to =
                                                            e.currentTarget.value;
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
                                                    edit((d) => {
                                                        (d as GraphModel).edges[i]!.label = v;
                                                    }, `el${i}`)
                                                }
                                            />
                                        </td>
                                        <td class="border-b border-line/50 text-center">
                                            <button
                                                class={DEL}
                                                onClick={() =>
                                                    edit((d) => {
                                                        (d as GraphModel).edges.splice(i, 1);
                                                    }, "struct")
                                                }
                                            >
                                                ✕
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
                            edit((d) => {
                                const g = d as GraphModel;
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
            if (shape === "series") {
                const m = d as SeriesModel;
                m.categories.push("New");
                m.series.forEach((x) => x.values.push("0"));
            } else if (shape === "labelValue")
                (d as KvModel).items.push({ label: "New", value: "0" });
            else if (shape === "points")
                (d as PointsModel).points.push({ x: "0", y: "0", size: "0" });
            else if (shape === "matrix") {
                const m = d as MatrixModel;
                m.rows.push("New");
                m.cells.push(m.cols.map(() => "0"));
            } else if (shape === "list") {
                const items = (d as { items: string[] }).items;
                if (limit === undefined || items.length < limit) items.push("New");
            } else if (shape === "hierarchy") {
                const m = d as HierModel;
                m.nodes.push({ label: "New", parent: m.nodes[0]?.label ?? "" });
            }
        }, "struct");
    const addSeries = (): void =>
        edit((d) => {
            const m = d as SeriesModel;
            m.series.push({
                name: `Series ${m.series.length + 1}`,
                values: m.categories.map(() => "0"),
            });
        }, "struct");
    const addCol = (): void =>
        edit((d) => {
            const m = d as MatrixModel;
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
            <div
                class={
                    props.compact ? "max-h-[320px] overflow-auto p-2" : "flex-1 overflow-auto p-4"
                }
            >
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
