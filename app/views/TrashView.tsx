import type { Component } from "solid-js";
import { createSignal, For, onMount, Show } from "solid-js";
import { resolveTheme } from "@themes/library";
import { type ArtifactSummary } from "../data/api";
import { formatLabel, relativeTime } from "../data/format";
import { RestoreIcon, TrashIcon } from "../ui/icons";
import { emptyTrash, loadTrash, purgeArtifact, restoreFromTrash, trash } from "../data/library";
import { ConfirmModal } from "../ui/ConfirmModal";
import { Sidebar } from "../ui/Sidebar";

const DANGER = "#C0392B";

export const TrashView: Component = () => {
    const [loading, setLoading] = createSignal(true);
    // local confirm for the permanent (irreversible) actions only — restore is safe, no prompt
    const [confirm, setConfirm] = createSignal<{
        kind: "purge" | "empty";
        doc?: ArtifactSummary;
    } | null>(null);
    const [acting, setActing] = createSignal(false);

    onMount(() => {
        (async () => {
            await loadTrash();
            setLoading(false);
        })();
    });

    const runConfirm = async (): Promise<void> => {
        const c = confirm();
        if (!c) return;
        setActing(true);
        try {
            if (c.kind === "empty") emptyTrash();
            else if (c.doc) purgeArtifact(c.doc.id);
            setConfirm(null);
        } finally {
            setActing(false);
        }
    };

    const Row: Component<{ d: ArtifactSummary }> = (p) => {
        const tk = (): ReturnType<typeof resolveTheme>["tokens"] =>
            resolveTheme(p.d.themeId).tokens;
        return (
            <div class="group flex items-center gap-4 rounded-xl border border-line bg-panel/50 px-3.5 py-3 opacity-75 transition hover:opacity-100">
                {/* dimmed, desaturated cover — reads as "removed" */}
                <div
                    class="h-12 w-[84px] flex-none overflow-hidden rounded-lg border border-line"
                    style={{ background: tk().bg, filter: "grayscale(0.6)" }}
                >
                    <Show when={p.d.cover?.image}>
                        <div
                            class="h-full w-full"
                            style={{
                                "background-image": `url(${p.d.cover!.image})`,
                                "background-size": "cover",
                                "background-position": "center",
                            }}
                        />
                    </Show>
                    <Show when={!p.d.cover?.image}>
                        <div class="grid h-full w-full place-items-center">
                            <span
                                class="h-3.5 w-3.5 rounded-[3px]"
                                style={{ background: tk().accent, opacity: "0.7" }}
                            />
                        </div>
                    </Show>
                </div>
                <div class="min-w-0 flex-1">
                    <div class="truncate text-[14px] font-medium text-soft line-through decoration-line/70 decoration-1">
                        {p.d.title}
                    </div>
                    <div class="mt-0.5 flex items-center gap-2 font-mono text-[10.5px] text-muted">
                        <span class="uppercase tracking-[0.08em]">{formatLabel(p.d.formatId)}</span>
                        <span>·</span>
                        <span>{resolveTheme(p.d.themeId).name}</span>
                        <span>·</span>
                        <span>
                            trashed {p.d.trashedAt ? relativeTime(p.d.trashedAt) : "recently"}
                        </span>
                    </div>
                </div>
                <div class="flex flex-none items-center gap-1.5 opacity-0 transition group-hover:opacity-100">
                    <button
                        class="flex items-center gap-1.5 rounded-lg border border-line bg-canvas px-3 py-1.5 text-[12.5px] font-medium text-soft hover:text-ink"
                        onClick={() => restoreFromTrash(p.d.id)}
                    >
                        <RestoreIcon size={14} /> Restore
                    </button>
                    <button
                        class="grid h-8 w-8 place-items-center rounded-lg hover:bg-canvas"
                        style={{ color: DANGER }}
                        title="Delete forever"
                        onClick={() => setConfirm({ kind: "purge", doc: p.d })}
                    >
                        <TrashIcon size={15} />
                    </button>
                </div>
            </div>
        );
    };

    return (
        <div class="flex h-full">
            <Sidebar />
            <main class="flex-1 overflow-y-auto bg-canvas">
                <div class="border-b border-line px-9 py-6">
                    <div class="flex flex-wrap items-end justify-between gap-4">
                        <div>
                            <div class="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">
                                Removed
                            </div>
                            <h1 class="mt-0.5 font-display text-[26px] font-semibold text-ink">
                                Trash
                            </h1>
                            <p class="mt-0.5 text-[13px] text-muted">
                                {trash().length === 0
                                    ? "Nothing here."
                                    : `${trash().length} ${trash().length === 1 ? "item" : "items"} — restore them, or clear Trash to delete forever.`}
                            </p>
                        </div>
                        <Show when={trash().length}>
                            <button
                                class="flex items-center gap-2 rounded-lg border px-3.5 py-2 text-[12.5px] font-semibold"
                                style={{ "border-color": DANGER, color: DANGER }}
                                onClick={() => setConfirm({ kind: "empty" })}
                            >
                                <TrashIcon size={15} /> Empty trash
                            </button>
                        </Show>
                    </div>
                </div>

                <Show
                    when={!loading()}
                    fallback={
                        <div class="flex h-64 items-center justify-center text-[13px] text-muted">
                            Loading…
                        </div>
                    }
                >
                    <Show
                        when={trash().length}
                        fallback={
                            <div class="flex h-72 flex-col items-center justify-center gap-2 text-muted">
                                <span class="opacity-40">
                                    <TrashIcon size={30} />
                                </span>
                                <span class="text-[13px]">Trash is empty.</span>
                                <span class="text-[12px] opacity-70">
                                    Deleted artifacts land here before they're gone for good.
                                </span>
                            </div>
                        }
                    >
                        <div class="flex flex-col gap-2.5 px-9 py-6">
                            <For each={trash()}>{(d) => <Row d={d} />}</For>
                        </div>
                    </Show>
                </Show>
            </main>

            <Show when={confirm()}>
                {(c) => (
                    <ConfirmModal
                        title={c().kind === "empty" ? "Empty trash?" : "Delete forever?"}
                        body={
                            c().kind === "empty" ? (
                                <>
                                    All {trash().length} {trash().length === 1 ? "item" : "items"}{" "}
                                    in Trash will be permanently deleted. This can’t be undone.
                                </>
                            ) : (
                                <>
                                    “{c().doc?.title}” will be permanently deleted. This can’t be
                                    undone.
                                </>
                            )
                        }
                        confirmLabel={c().kind === "empty" ? "Empty trash" : "Delete forever"}
                        danger
                        busy={acting()}
                        onConfirm={() => runConfirm()}
                        onCancel={() => setConfirm(null)}
                    />
                )}
            </Show>
        </div>
    );
};
