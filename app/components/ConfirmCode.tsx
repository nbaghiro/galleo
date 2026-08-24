import type { Component } from "solid-js";
import { createSignal, Show } from "solid-js";
import { DEV_CONFIRM_CODE, VERIFY_CODE_LENGTH, verifyCodeError } from "@model/workspace";
import { Button } from "@ui/button";
import { TextField } from "@ui/inputs";
import { confirmEmail } from "@app/stores/auth";

// The one place a confirmation code is typed. Three surfaces need it (the onboarding step, the banner
// an account from before the gate sees, and the account settings row), and the submit rule is the part
// worth having once: six digits go on their own, so nobody presses a button after the last one.
type Layout = "step" | "inline";

const FIELD: Record<Layout, string> = {
    step: "h-12 w-full sm:w-56 px-3.5 rounded-lg bg-panel text-center font-mono text-[22px] tracking-[0.32em] indent-[0.32em] text-ink placeholder:text-muted",
    inline: "h-7 w-24 px-2 rounded-md text-center font-mono text-[13px] tracking-[0.2em] indent-[0.2em] text-ink placeholder:text-muted",
};

export const ConfirmCodeField: Component<{
    layout: Layout;
    withButton?: boolean;
    onError?: (message: string | null) => void;
}> = (props) => {
    const [code, setCode] = createSignal("");
    const [busy, setBusy] = createSignal(false);
    const [error, setError] = createSignal<string | null>(null);

    const fail = (message: string | null): void => {
        setError(message);
        props.onError?.(message);
    };

    const submit = async (entered: string): Promise<void> => {
        const bad = verifyCodeError(entered);
        if (bad) {
            fail(bad);
            return;
        }
        setBusy(true);
        fail(null);
        try {
            // opens the gate: whatever was waiting behind it renders in place, in the same tab
            await confirmEmail(entered);
        } catch (e) {
            fail(e instanceof Error ? e.message : "Could not confirm that code.");
            setCode("");
        } finally {
            setBusy(false);
        }
    };

    const onCode = (raw: string): void => {
        const digits = raw.replace(/\D/g, "").slice(0, VERIFY_CODE_LENGTH);
        setCode(digits);
        fail(null);
        if (digits.length === VERIFY_CODE_LENGTH) void submit(digits);
    };

    return (
        <div class="flex flex-col gap-2">
            <div
                class={
                    props.layout === "step"
                        ? "flex flex-col gap-3 sm:flex-row sm:items-center"
                        : "flex items-center gap-2"
                }
            >
                <TextField
                    type="text"
                    inputmode="numeric"
                    autocomplete="one-time-code"
                    autofocus={props.layout === "step"}
                    disabled={busy()}
                    maxLength={VERIFY_CODE_LENGTH}
                    aria-label="Confirmation code"
                    placeholder="000000"
                    class={FIELD[props.layout]}
                    value={code()}
                    onChange={onCode}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") void submit(code());
                    }}
                />
                <Show when={props.withButton}>
                    <Button
                        size="lg"
                        class="px-6 py-3.5"
                        loading={busy()}
                        disabled={code().length < VERIFY_CODE_LENGTH}
                        onClick={() => void submit(code())}
                    >
                        Confirm
                    </Button>
                </Show>
            </div>
            <Show when={props.layout === "step" && error()}>
                {(msg) => <p class="text-[13px] text-danger">{msg()}</p>}
            </Show>
            {/* import.meta.env.DEV is false in any built bundle, so this cannot reach a deployed app */}
            <Show when={props.layout === "step" && import.meta.env.DEV}>
                <p class="text-[12px] text-muted">
                    Dev build: {DEV_CONFIRM_CODE} confirms without an email.
                </p>
            </Show>
        </div>
    );
};
