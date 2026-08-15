import type { Component } from "solid-js";
import { createSignal, For, onMount, Show } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { Button } from "@ui/button";
import { TextArea } from "@ui/inputs";
import { Icon } from "@ui/icons";
import { Dropdown } from "@ui/select";
import { appTheme } from "@app/stores/theme";
import { isCoarsePointer } from "@ui/viewport";
import { Credits } from "@app/components/credits";
import { artifactSearchText } from "@model/artifact";
import { api } from "@app/api";
import { closeGenerate, planCost, startSession, type Surface } from "@app/stores/generate";
import { createBlank, formatLabel } from "@app/stores/library";
import { reportError } from "@app/stores/errors";
import { IMAGE_SOURCES, LENGTHS, PLACEHOLDER, SURFACES } from "./prompts";
import { setPreviewFormat } from "./shared";
import { TemplateGallery } from "@app/components/TemplateGallery";
import {
    AttachMenu,
    AttachmentChips,
    ContextChips,
    createAttachSources,
    type SourcePick,
} from "@app/components/context-attach";
import { ContextsPane } from "./ContextsPane";
import { TemplateRow } from "./TemplateRow";
import { VoiceInput } from "@app/components/VoiceInput";
import {
    mergeAttachments,
    nextAttachmentId,
    readAttachment,
    SOURCE_LIMIT,
    sourceLength,
    type Attachment,
} from "@app/components/attachments";

// module-level so the studio shell can size the dialog: the prompt is compact, but "Browse all"
// and the contexts pane swap in full-height surfaces that want the wide modal
const [browsing, setBrowsing] = createSignal(false);
const [managing, setManaging] = createSignal(false);
export const intakeExpanded = (): boolean => browsing() || managing();

export const Intake: Component = () => {
    let field!: HTMLTextAreaElement;
    const [prompt, setPrompt] = createSignal("");
    const [fmt, setFmt] = createSignal<Surface>("deck");
    const [length, setLength] = createSignal("Standard");
    const [imageSource, setImageSource] = createSignal("stock");
    const [items, setItems] = createSignal<Attachment[]>([]);
    const [dropping, setDropping] = createSignal(false);
    const [fileError, setFileError] = createSignal("");
    const [ctxIds, setCtxIds] = createSignal<string[]>([]);

    const addFiles = async (files: FileList | null): Promise<void> => {
        if (!files?.length) return;
        setFileError("");
        for (const file of Array.from(files)) {
            const { attachment, error } = await readAttachment(file);
            if (error) setFileError(error);
            if (attachment) setItems((cur) => [...cur, attachment]);
        }
    };

    // fetched server-side (SSRF-vetted), reduced to page text, attached like any other material
    const fetchLink = async (target: string): Promise<boolean> => {
        setFileError("");
        try {
            const page = await api.fetchWebpage(target);
            setItems((cur) => [
                ...cur,
                {
                    id: nextAttachmentId(),
                    name: page.title,
                    kind: "link",
                    ref: page.url,
                    text: page.text,
                },
            ]);
            return true;
        } catch (e) {
            setFileError(e instanceof Error ? e.message : "Couldn’t fetch that page.");
            return false;
        }
    };

    // a library piece needs one read for its content; a template's body is already in the cache
    const attachPick = async (pick: SourcePick): Promise<void> => {
        setFileError("");
        try {
            const content =
                pick.kind === "template"
                    ? pick.content
                    : (await api.getArtifact(pick.id)).artifact.draftContent;
            const text = artifactSearchText(content);
            if (!text.trim()) {
                setFileError(`${pick.title} has no text to build from.`);
                return;
            }
            setItems((cur) => [
                ...cur,
                { id: nextAttachmentId(), name: pick.title, kind: "artifact", text },
            ]);
        } catch {
            setFileError(`Couldn’t read ${pick.title}.`);
        }
    };

    const remove = (id: string): void => {
        setItems((cur) => cur.filter((a) => a.id !== id));
    };

    const attach = createAttachSources({
        onFiles: (files) => void addFiles(files),
        onPaste: (text) =>
            setItems((cur) => [
                ...cur,
                { id: nextAttachmentId(), name: "Pasted text", kind: "paste", text },
            ]),
        onLink: fetchLink,
        onPick: (pick) => void attachPick(pick),
    });

    const overLimit = (): number => Math.max(0, sourceLength(items()) - SOURCE_LIMIT);
    const ready = (): boolean => !!prompt().trim() || items().length > 0;

    const touch = isCoarsePointer;
    const navigate = useNavigate();
    const [blanking, setBlanking] = createSignal(false);
    // a fresh open starts on the prompt, never on a pane left over from the last session
    onMount(() => {
        setBrowsing(false);
        setManaging(false);
    });

    // the quiet third exit: an empty artifact in that format, straight into the editor
    const startBlank = async (formatId: string): Promise<void> => {
        if (blanking()) return;
        setBlanking(true);
        const id = await createBlank(formatId);
        setBlanking(false);
        if (!id) {
            reportError(new Error("blank create failed"), "Couldn’t create a blank artifact");
            return;
        }
        closeGenerate();
        navigate(`/edit/${id}`);
    };

    const launch = (): void => {
        if (!ready()) return;
        setPreviewFormat(fmt());
        void startSession({
            prompt: prompt().trim() || PLACEHOLDER,
            surface: fmt(),
            theme: appTheme(),
            length: length(),
            imageSource: imageSource() === "ai" ? "ai" : "stock",
            source: mergeAttachments(items()),
            contextIds: ctxIds(),
        });
    };

    return (
        <Show
            when={!browsing()}
            fallback={
                <div class="h-dvh min-h-0 md:h-[85vh]">
                    <GalleryPane onBack={() => setBrowsing(false)} />
                </div>
            }
        >
            <Show
                when={!managing()}
                fallback={
                    <div class="h-dvh min-h-0 md:h-[85vh]">
                        <ContextsPane onBack={() => setManaging(false)} />
                    </div>
                }
            >
                {/* the dialog hugs this content; past the viewport cap, this is what scrolls */}
                <div
                    class="flex h-full max-h-full overflow-y-auto px-4 py-6 md:px-6 md:py-8"
                    onDragOver={(e) => {
                        e.preventDefault();
                        setDropping(true);
                    }}
                    onDragLeave={() => setDropping(false)}
                    onDrop={(e) => {
                        e.preventDefault();
                        setDropping(false);
                        void addFiles(e.dataTransfer?.files ?? null);
                    }}
                >
                    {/* min-w-0: a grid item can't shrink below min-content without it, and the
                    template strip's min-content would otherwise pin the column past small screens */}
                    {/* auto margins center when there's spare height (fullscreen phone, tall
                    desktop) and collapse to top-aligned scrolling when content overflows */}
                    <div class="m-auto w-full min-w-0 max-w-150">
                        <h1
                            class="text-center font-serif text-[25px] leading-tight md:text-[30px]"
                            style={{ "font-family": "var(--font-display)" }}
                        >
                            What are we making?
                        </h1>
                        <p class="mt-1.5 text-center text-[13px] leading-relaxed text-muted">
                            Describe it in a sentence, or just enough for a template to catch it.
                        </p>

                        {/* relative: the VoiceInput transcript overlay anchors here, spanning the composer */}
                        <div
                            class="relative mt-6 rounded-2xl border bg-panel shadow-xl transition-colors"
                            classList={{
                                "border-accent ring-2 ring-accent/25": dropping(),
                                "border-line": !dropping(),
                            }}
                        >
                            <TextArea
                                ref={field}
                                rounded="xl"
                                rows={4}
                                class="border-0 bg-transparent text-[15px] leading-relaxed placeholder:text-muted"
                                placeholder={PLACEHOLDER}
                                value={prompt()}
                                onChange={setPrompt}
                                onKeyDown={(e: KeyboardEvent) => {
                                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) launch();
                                }}
                            />

                            <Show when={items().length || ctxIds().length}>
                                <div class="flex flex-wrap gap-1.5 px-3 pb-2">
                                    <ContextChips
                                        ids={ctxIds()}
                                        title="Attached context, which sections write from"
                                        onRemove={(id) =>
                                            setCtxIds((cur) => cur.filter((c) => c !== id))
                                        }
                                    />
                                    <AttachmentChips items={items()} onRemove={remove} />
                                </div>
                            </Show>

                            <attach.Panels class="px-3 pb-2" />

                            <div class="flex flex-wrap items-center gap-x-1 gap-y-1.5 border-t border-line px-2 py-1.5">
                                <div class="flex flex-none items-center gap-x-1">
                                    <AttachMenu
                                        size={touch() ? "touch" : "lg"}
                                        sources={attach}
                                        collections={{
                                            selected: ctxIds(),
                                            onChange: setCtxIds,
                                            onManage: () => setManaging(true),
                                        }}
                                    />
                                    <span class="mx-1 hidden h-4 w-px flex-none bg-line md:block" />
                                </div>

                                {/* the three settings are one control: they wrap as a unit rather
                            than splitting a row; + always leads, on every size */}
                                <div class="flex min-w-0 flex-none flex-wrap items-center gap-x-1 gap-y-1">
                                    <Dropdown
                                        compact
                                        value={fmt()}
                                        options={SURFACES}
                                        onChange={(v) => setFmt(v as Surface)}
                                    />
                                    <Dropdown
                                        compact
                                        value={length()}
                                        options={LENGTHS}
                                        onChange={setLength}
                                    />
                                    <Dropdown
                                        compact
                                        value={imageSource()}
                                        options={IMAGE_SOURCES}
                                        onChange={setImageSource}
                                    />
                                </div>

                                <div class="ml-auto flex flex-none items-center gap-x-1">
                                    {/* no onAutoSend: dictation drafts the brief for review, never launches */}
                                    <VoiceInput
                                        field={() => field}
                                        value={prompt}
                                        setValue={setPrompt}
                                    />
                                    <Button
                                        variant="primary"
                                        rounded="xl"
                                        size="sm"
                                        class="whitespace-nowrap"
                                        disabled={!ready()}
                                        onClick={launch}
                                    >
                                        Plan the outline → · <Credits n={planCost()} />
                                    </Button>
                                </div>
                            </div>
                        </div>

                        <Show when={fileError()}>
                            <p class="mt-2 text-[11.5px] leading-snug text-accent">{fileError()}</p>
                        </Show>
                        <Show when={overLimit() > 0}>
                            <p class="mt-2 text-[11.5px] leading-snug text-muted">
                                That's more material than one plan reads. The first{" "}
                                {SOURCE_LIMIT.toLocaleString()} characters are used, and{" "}
                                {overLimit().toLocaleString()} are dropped.
                            </p>
                        </Show>

                        <TemplateRow onBrowseAll={() => setBrowsing(true)} />

                        {/* blank is present, never competing: one line of text, same action as the old modal */}
                        <p class="mt-5 text-center text-[12px] text-muted">
                            or start blank:{" "}
                            <For each={SURFACES}>
                                {(f, i) => (
                                    <>
                                        <Show when={i() > 0}> · </Show>
                                        <button
                                            class="font-semibold text-soft underline decoration-line underline-offset-3 transition-colors hover:text-ink"
                                            classList={{ "px-1 py-2": touch() }}
                                            disabled={blanking()}
                                            title={`A blank ${formatLabel(f.value).toLowerCase()}`}
                                            onClick={() => void startBlank(f.value)}
                                        >
                                            {formatLabel(f.value)}
                                        </button>
                                    </>
                                )}
                            </For>
                        </p>
                    </div>
                </div>
            </Show>
        </Show>
    );
};

// the Templates page's gallery, hosted inside the studio with a way back to the prompt
const GalleryPane: Component<{ onBack: () => void }> = (props) => (
    <div class="flex h-full flex-col">
        <div class="flex flex-none items-center gap-2 border-b border-line px-4 py-2.5 md:px-6">
            <Button variant="ghost" size="sm" onClick={() => props.onBack()}>
                <Icon name="chevronLeft" size={13} /> Back
            </Button>
            <span class="text-[13.5px] font-semibold tracking-tight">Templates</span>
            <span class="font-mono text-[10px] text-muted">pick one and make it yours</span>
        </div>
        <div class="min-h-0 flex-1 overflow-y-auto">
            <TemplateGallery onCreated={closeGenerate} />
        </div>
    </div>
);
