import type { Component } from "solid-js";
import { createSignal, Show } from "solid-js";
import type { Template } from "@model/templates";
import { asFormat } from "@model/analytics";
import { capture } from "@ui/analytics";
import { Button, IconButton } from "@ui/button";
import { Icon } from "@ui/icons";
import { Segmented } from "@ui/inputs";
import { Modal } from "@ui/overlay";
import { PresentSurface } from "@ui/present";
import { canEditHere } from "@ui/viewport";
import { FORMATS } from "@app/stores/library";
import { appTheme } from "@app/stores/theme";
import { PreviewCanvas } from "./previews";

// Looking at a template before committing to it. One component because every door into the catalog
// owes the same look: the strip on the intake, the full gallery, and the Templates page.
//
// The format switcher is the point of previewing at all. A template is a set of sections, and the
// same sections read as a deck, a document, or a page; picking here is picking what it becomes, and
// `onUse` is handed that choice rather than the template's saved format.

export const TemplatePreview: Component<{
    template: Template;
    /** Non-null while the artifact is being created, so the action can say so and stay pressed. */
    busy?: boolean;
    /**
     * Wired where the preview sits over a list the viewer came from, which is every door except the
     * Templates page itself. Without it the only way out is the modal's own dismiss, and a preview
     * this full-bleed gives no hint that there is a catalog behind it.
     */
    onBack?: () => void;
    onClose: () => void;
    onUse: (format: string) => void;
}> = (props) => {
    const [format, setFormat] = createSignal(props.template.content.format);
    const artifact = (): Template["content"] => ({
        ...props.template.content,
        format: format(),
        theme: appTheme(),
    });
    const label = (): string => (props.busy ? "Creating…" : "Use template →");

    const switcher = (): ReturnType<typeof Segmented> => (
        <Segmented
            variant="accent"
            value={format()}
            options={FORMATS.map((f) => ({ label: f.label, value: f.id }))}
            onChange={(v) => {
                setFormat(v);
                capture("template_previewed", {
                    template_id: props.template.id,
                    category: props.template.category,
                    format: asFormat(v),
                });
            }}
        />
    );

    return (
        <Show
            when={canEditHere()}
            fallback={
                <PresentSurface artifact={artifact()} viewOnly onExit={() => props.onClose()}>
                    <div class="absolute inset-x-0 top-0 flex flex-col gap-2 bg-black/55 px-3 pb-2 pt-[calc(0.5rem+env(safe-area-inset-top))] backdrop-blur-md">
                        <div class="flex items-center gap-2">
                            <Show when={props.onBack}>
                                <IconButton
                                    size="sm"
                                    tone="onDark"
                                    title="Back to templates"
                                    onClick={() => props.onBack?.()}
                                >
                                    <Icon name="chevronLeft" size={14} />
                                </IconButton>
                            </Show>
                            <span class="min-w-0 flex-1 truncate text-[13px] font-semibold text-white">
                                {props.template.name}
                            </span>
                            <Button
                                variant="primary"
                                size="sm"
                                rounded="lg"
                                disabled={props.busy}
                                onClick={() => props.onUse(format())}
                            >
                                {props.busy ? "Creating…" : "Use →"}
                            </Button>
                        </div>
                        {switcher()}
                    </div>
                </PresentSurface>
            }
        >
            <Modal
                size="full"
                surface="canvas"
                scrim="dim"
                class="flex h-[94vh] w-[97vw] flex-col overflow-hidden"
                onClose={() => props.onClose()}
            >
                {/* phone: the switcher wraps to its own full-width row and the action shortens,
                    so the title keeps the room; desktop reads as one row, as before */}
                <header class="flex flex-none items-center gap-3 border-b border-line px-5 py-3 max-md:flex-wrap max-md:gap-y-2">
                    <Show when={props.onBack}>
                        <IconButton
                            size="sm"
                            tone="muted"
                            title="Back to templates"
                            onClick={() => props.onBack?.()}
                        >
                            <Icon name="chevronLeft" size={14} />
                        </IconButton>
                    </Show>
                    <div class="min-w-0 max-md:flex-1">
                        <div class="truncate text-[14px] font-semibold text-ink">
                            {props.template.name}
                        </div>
                        <div class="truncate text-[11px] text-muted">
                            {props.template.category} · {props.template.content.sections.length}{" "}
                            sections
                        </div>
                    </div>
                    <div class="ml-4 max-md:order-last max-md:ml-0 max-md:w-full">{switcher()}</div>
                    <div class="ml-auto flex items-center gap-2 max-md:pr-10">
                        <Button
                            variant="primary"
                            class="whitespace-nowrap"
                            disabled={props.busy}
                            onClick={() => props.onUse(format())}
                        >
                            <span class="max-md:hidden">{label()}</span>
                            <span class="md:hidden">{props.busy ? "Creating…" : "Use →"}</span>
                        </Button>
                    </div>
                </header>
                <div class="min-h-0 flex-1">
                    {/* the modal stands in for the published page, so it plays like one: menus
                        open, links move the pane, video runs */}
                    <PreviewCanvas live content={artifact()} format={format} />
                </div>
            </Modal>
        </Show>
    );
};
