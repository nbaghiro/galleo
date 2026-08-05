import type { Component } from "solid-js";
import { Show } from "solid-js";
import { Button, Eyebrow } from "@ui/button";
import { Modal } from "@ui/overlay";
import { appError, dismissError } from "../stores/errors";
import { go } from "../stores/navigate";
import { overlayThemeVars } from "../stores/theme";

// Every AI action reports here, so a failed turn says what happened instead of leaving the studio
// parked with nothing to read.
export const ErrorModal: Component = () => (
    <Show when={appError()}>
        {(err) => (
            <Modal
                size="sm"
                scrim="blur"
                vars={overlayThemeVars()}
                class="p-5"
                onClose={dismissError}
            >
                <h2 class="text-[15px] font-semibold text-ink">{err().title}</h2>
                <Show when={err().hint}>
                    <p class="mt-1.5 text-[12.5px] leading-relaxed text-soft">{err().hint}</p>
                </Show>
                <Show when={err().detail}>
                    {(detail) => (
                        <div class="mt-3">
                            <Eyebrow as="div" weight="normal" tracking="wide" class="mb-1">
                                What came back
                            </Eyebrow>
                            <p class="max-h-32 overflow-y-auto rounded-md bg-canvas p-2 font-mono text-[11px] leading-relaxed text-muted">
                                {detail()}
                            </p>
                        </div>
                    )}
                </Show>
                <div class="mt-4 flex items-center justify-end gap-2">
                    <Show when={err().upgrade}>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                                dismissError();
                                go("/pricing");
                            }}
                        >
                            See plans
                        </Button>
                    </Show>
                    <Button variant="primary" size="sm" onClick={dismissError}>
                        Close
                    </Button>
                </div>
            </Modal>
        )}
    </Show>
);
