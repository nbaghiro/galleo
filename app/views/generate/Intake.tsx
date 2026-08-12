import type { Component } from "solid-js";
import { createSignal, For, onMount, Show } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { Button, Chip, IconButton, Spinner } from "@ui/button";
import { TextArea, TextField } from "@ui/inputs";
import { Icon } from "@ui/icons";
import { Dropdown } from "@ui/select";
import { appTheme } from "../../stores/theme";
import { isCoarsePointer } from "@ui/viewport";
import { Credits } from "../../components/credits";
import { artifactSearchText } from "@model/artifact";
import { api } from "../../api";
import { closeGenerate, planCost, startSession, type Surface } from "../../stores/generate";
import { createBlank, formatLabel } from "../../stores/library";
import { reportError } from "../../stores/errors";
import { IMAGE_SOURCES, LENGTHS, PLACEHOLDER, SURFACES } from "./prompts";
import { setPreviewFormat } from "./shared";
import { Popover } from "@ui/overlay";
import { TemplateGallery } from "../../components/TemplateGallery";
import { ContextToggleRows, SourcePickList, type SourcePick } from "../../components/ContextPicker";
import { contextList, contextsLoaded } from "../../stores/contexts";
import { ContextsPane } from "./ContextsPane";
import { TemplateRow } from "./TemplateRow";
import {
    formatBytes,
    mergeAttachments,
    nextAttachmentId,
    readAttachment,
    SOURCE_LIMIT,
    sourceLength,
    type Attachment,
} from "./context";

const ATTACH_ICON: Record<Attachment["kind"], string> = {
    file: "doc",
    paste: "text",
    link: "link",
    artifact: "library",
};

// module-level so the studio shell can size the dialog: the prompt is compact, but "Browse all"
// and the contexts pane swap in full-height surfaces that want the wide modal
const [browsing, setBrowsing] = createSignal(false);
const [managing, setManaging] = createSignal(false);
export const intakeExpanded = (): boolean => browsing() || managing();

export const Intake: Component = () => {
    const [prompt, setPrompt] = createSignal("");
    const [fmt, setFmt] = createSignal<Surface>("deck");
    const [length, setLength] = createSignal("Standard");
    const [imageSource, setImageSource] = createSignal("stock");
    const [items, setItems] = createSignal<Attachment[]>([]);
    const [pasting, setPasting] = createSignal(false);
    const [paste, setPaste] = createSignal("");
    const [linking, setLinking] = createSignal(false);
    const [url, setUrl] = createSignal("");
    const [fetching, setFetching] = createSignal(false);
    const [pickingArtifact, setPickingArtifact] = createSignal(false);
    const [dropping, setDropping] = createSignal(false);
    const [fileError, setFileError] = createSignal("");
    const [ctxIds, setCtxIds] = createSignal<string[]>([]);
    const [addOpen, setAddOpen] = createSignal(false);
    let fileInput!: HTMLInputElement;
    let addAnchor!: HTMLButtonElement;

    const ctxName = (id: string): string =>
        contextList().find((c) => c.id === id)?.name ?? "Context";

    const addFiles = async (files: FileList | null): Promise<void> => {
        if (!files?.length) return;
        setFileError("");
        for (const file of Array.from(files)) {
            const { attachment, error } = await readAttachment(file);
            if (error) setFileError(error);
            if (attachment) setItems((cur) => [...cur, attachment]);
        }
    };

    const commitPaste = (): void => {
        const text = paste().trim();
        setPaste("");
        setPasting(false);
        if (!text) return;
        setItems((cur) => [
            ...cur,
            { id: nextAttachmentId(), name: "Pasted text", kind: "paste", text },
        ]);
    };

    // fetched server-side (SSRF-vetted), reduced to page text, attached like any other material
    const fetchLink = async (): Promise<void> => {
        const target = url().trim();
        if (!target || fetching()) return;
        setFetching(true);
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
            setUrl("");
            setLinking(false);
        } catch (e) {
            setFileError(e instanceof Error ? e.message : "Couldn’t fetch that page.");
        } finally {
            setFetching(false);
        }
    };

    // a library piece needs one read for its content; a template's body is already in the cache
    const attachPick = async (pick: SourcePick): Promise<void> => {
        setPickingArtifact(false);
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
                <div class="h-[85vh] min-h-0">
                    <GalleryPane onBack={() => setBrowsing(false)} />
                </div>
            }
        >
            <Show
                when={!managing()}
                fallback={
                    <div class="h-[85vh] min-h-0">
                        <ContextsPane onBack={() => setManaging(false)} />
                    </div>
                }
            >
                {/* the dialog hugs this content; past the viewport cap, this is what scrolls */}
                <div
                    class="grid max-h-full justify-items-center overflow-y-auto px-4 py-6 md:px-6 md:py-8"
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
                    <div class="w-full min-w-0 max-w-150">
                        <h1
                            class="text-center font-serif text-[25px] leading-tight md:text-[30px]"
                            style={{ "font-family": "var(--font-display)" }}
                        >
                            What are we making?
                        </h1>
                        <p class="mt-1.5 text-center text-[13px] leading-relaxed text-muted">
                            Describe it in a sentence — or just enough for a template to catch it.
                        </p>

                        <div
                            class="mt-6 rounded-2xl border bg-panel shadow-xl transition-colors"
                            classList={{
                                "border-accent ring-2 ring-accent/25": dropping(),
                                "border-line": !dropping(),
                            }}
                        >
                            <TextArea
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
                                    <For each={ctxIds()}>
                                        {(id) => (
                                            <Chip
                                                variant="outline"
                                                size="sm"
                                                rounded="md"
                                                class="max-w-full"
                                                title="Attached context — sections write from its material"
                                                onRemove={() =>
                                                    setCtxIds((cur) => cur.filter((c) => c !== id))
                                                }
                                            >
                                                <Icon name="layers" size={11} />
                                                <span class="truncate">{ctxName(id)}</span>
                                            </Chip>
                                        )}
                                    </For>
                                    <For each={items()}>
                                        {(a) => (
                                            <Chip
                                                variant="outline"
                                                size="sm"
                                                rounded="md"
                                                class="max-w-full"
                                                title={`${a.text.length.toLocaleString()} characters`}
                                                onRemove={() => remove(a.id)}
                                            >
                                                <Icon name={ATTACH_ICON[a.kind]} size={11} />
                                                <span class="truncate">{a.name}</span>
                                                <span class="font-mono text-[9.5px] text-muted">
                                                    {formatBytes(a.text.length)}
                                                </span>
                                            </Chip>
                                        )}
                                    </For>
                                </div>
                            </Show>

                            <Show when={pasting()}>
                                <div class="px-3 pb-2">
                                    <TextArea
                                        rounded="lg"
                                        rows={5}
                                        autofocus
                                        placeholder="Paste the notes, transcript, or copy this should be built from…"
                                        value={paste()}
                                        onChange={setPaste}
                                    />
                                    <div class="mt-1.5 flex items-center gap-1.5">
                                        <Button variant="outline" size="sm" onClick={commitPaste}>
                                            Attach
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => {
                                                setPaste("");
                                                setPasting(false);
                                            }}
                                        >
                                            Cancel
                                        </Button>
                                    </div>
                                </div>
                            </Show>

                            <Show when={linking()}>
                                <div class="flex items-center gap-1.5 px-3 pb-2">
                                    <TextField
                                        compact
                                        autofocus
                                        value={url()}
                                        placeholder="https://…  (fetched and attached as text)"
                                        onChange={setUrl}
                                        onKeyDown={(e: KeyboardEvent) => {
                                            if (e.key === "Enter") void fetchLink();
                                            if (e.key === "Escape") setLinking(false);
                                        }}
                                    />
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        class="flex-none"
                                        disabled={fetching()}
                                        onClick={() => void fetchLink()}
                                    >
                                        <Show when={!fetching()} fallback={<Spinner size={12} />}>
                                            Fetch
                                        </Show>
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        class="flex-none"
                                        onClick={() => {
                                            setUrl("");
                                            setLinking(false);
                                        }}
                                    >
                                        Cancel
                                    </Button>
                                </div>
                            </Show>

                            <Show when={pickingArtifact()}>
                                <div class="px-3 pb-2">
                                    <SourcePickList onPick={(pick) => void attachPick(pick)} />
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        class="mt-1.5"
                                        onClick={() => setPickingArtifact(false)}
                                    >
                                        Cancel
                                    </Button>
                                </div>
                            </Show>

                            <div class="flex flex-wrap items-center gap-x-1 gap-y-1.5 border-t border-line px-2 py-1.5">
                                <input
                                    ref={fileInput}
                                    type="file"
                                    multiple
                                    class="hidden"
                                    accept=".txt,.md,.markdown,.csv,.tsv,.json,.yaml,.yml,.html,.htm,.xml,.rtf,.log,.vtt,.srt,text/*"
                                    onChange={(e) => {
                                        void addFiles(e.currentTarget.files);
                                        e.currentTarget.value = "";
                                    }}
                                />
                                <div class="flex flex-none items-center gap-x-1">
                                    <IconButton
                                        ref={addAnchor}
                                        size={touch() ? "touch" : "lg"}
                                        tone={ctxIds().length ? "accent" : "muted"}
                                        title="Add context — files, pasted text, collections"
                                        onClick={() => setAddOpen(!addOpen())}
                                    >
                                        <Icon name="plus" size={14} />
                                    </IconButton>
                                    <Popover
                                        anchor={() => addAnchor}
                                        open={addOpen()}
                                        onClose={() => setAddOpen(false)}
                                        minWidth={260}
                                        estHeight={280}
                                    >
                                        <div class="p-1">
                                            <button
                                                class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12.5px] text-ink hover:bg-canvas"
                                                onClick={() => {
                                                    setAddOpen(false);
                                                    fileInput.click();
                                                }}
                                            >
                                                <Icon name="doc" size={13} />
                                                <span class="flex-1">Upload files</span>
                                                <span class="font-mono text-[9px] text-muted">
                                                    .txt .md .csv…
                                                </span>
                                            </button>
                                            <button
                                                class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12.5px] text-ink hover:bg-canvas"
                                                disabled={pasting()}
                                                onClick={() => {
                                                    setAddOpen(false);
                                                    setPasting(true);
                                                }}
                                            >
                                                <Icon name="text" size={13} />
                                                <span class="flex-1">Paste text</span>
                                                <span class="font-mono text-[9px] text-muted">
                                                    docs · email · slack
                                                </span>
                                            </button>
                                            <button
                                                class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12.5px] text-ink hover:bg-canvas"
                                                disabled={linking()}
                                                onClick={() => {
                                                    setAddOpen(false);
                                                    setLinking(true);
                                                }}
                                            >
                                                <Icon name="link" size={13} />
                                                <span class="flex-1">Add a link</span>
                                                <span class="font-mono text-[9px] text-muted">
                                                    page → text
                                                </span>
                                            </button>
                                            <button
                                                class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12.5px] text-ink hover:bg-canvas"
                                                disabled={pickingArtifact()}
                                                onClick={() => {
                                                    setAddOpen(false);
                                                    setPickingArtifact(true);
                                                }}
                                            >
                                                <Icon name="library" size={13} />
                                                <span class="flex-1">Galleo artifact</span>
                                                <span class="font-mono text-[9px] text-muted">
                                                    library · template
                                                </span>
                                            </button>
                                            <div class="mx-2 my-1 border-t border-line" />
                                            <div class="px-2 pb-1 pt-1 font-mono text-[9.5px] uppercase tracking-[0.12em] text-muted">
                                                Context collections
                                            </div>
                                            <Show when={contextsLoaded() && !contextList().length}>
                                                <p class="px-2 pb-1 text-[11.5px] leading-snug text-muted">
                                                    Reusable grounding built from files, links, and
                                                    your library — attach one to write from its
                                                    facts.
                                                </p>
                                            </Show>
                                            <ContextToggleRows
                                                selected={ctxIds()}
                                                onChange={setCtxIds}
                                            />
                                            <button
                                                class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12.5px] text-soft hover:bg-canvas hover:text-ink"
                                                onClick={() => {
                                                    setAddOpen(false);
                                                    setManaging(true);
                                                }}
                                            >
                                                <Icon name="layers" size={13} />
                                                <span class="flex-1">
                                                    {contextList().length
                                                        ? "New or manage contexts…"
                                                        : "Create a context…"}
                                                </span>
                                            </button>
                                        </div>
                                    </Popover>
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

                                <Button
                                    variant="primary"
                                    rounded="xl"
                                    size="sm"
                                    class="ml-auto whitespace-nowrap"
                                    disabled={!ready()}
                                    onClick={launch}
                                >
                                    Plan the outline → · <Credits n={planCost()} />
                                </Button>
                            </div>
                        </div>

                        <Show when={fileError()}>
                            <p class="mt-2 text-[11.5px] leading-snug text-accent">{fileError()}</p>
                        </Show>
                        <Show when={overLimit() > 0}>
                            <p class="mt-2 text-[11.5px] leading-snug text-muted">
                                That's more material than one plan reads — the first{" "}
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
