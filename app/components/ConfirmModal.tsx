import type { Component, JSX } from "solid-js";
import { overlayThemeVars } from "../theme/overlay-theme";

// Shared confirm / destructive dialog — a centered card over a dimmed backdrop. Rendered inside the
// themed app tree so it inherits the active theme tokens (the artifact theme when over the editor, the
// app theme elsewhere). The caller owns the <Show> that mounts it and passes the copy + handlers;
// `danger` paints the primary button red, `busy` locks it while acting.
export const ConfirmModal: Component<{
    title: string;
    body: JSX.Element;
    confirmLabel: string;
    onConfirm: () => void;
    onCancel: () => void;
    danger?: boolean;
    busy?: boolean;
}> = (props) => {
    const themeVars = overlayThemeVars(); // stamped once at open (snapshot)
    return (
        <div
            class="fixed inset-0 z-[60] grid place-items-center bg-black/50 p-4"
            style={themeVars}
            onClick={() => !props.busy && props.onCancel()}
        >
            <div
                class="w-[400px] max-w-[92vw] rounded-2xl border border-line bg-panel p-6 shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                <h2 class="font-display text-[18px] font-semibold text-ink">{props.title}</h2>
                <p class="mt-2 text-[13.5px] leading-relaxed text-soft">{props.body}</p>
                <div class="mt-5 flex justify-end gap-2.5">
                    <button
                        class="rounded-lg border border-line px-3.5 py-2 text-[13px] font-medium text-soft hover:text-ink disabled:opacity-50"
                        disabled={props.busy}
                        onClick={() => props.onCancel()}
                    >
                        Cancel
                    </button>
                    <button
                        class="rounded-lg px-3.5 py-2 text-[13px] font-semibold disabled:opacity-60"
                        style={{
                            background: props.danger ? "#C0392B" : "var(--color-accent)",
                            color: props.danger ? "#fff" : "var(--color-onaccent)",
                        }}
                        disabled={props.busy}
                        onClick={() => props.onConfirm()}
                    >
                        {props.busy ? "Working…" : props.confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
};
