import type { Component } from "solid-js";
import { createSignal, For, Show } from "solid-js";
import { Button, Chip, IconButton } from "@ui/button";
import { TextArea } from "@ui/inputs";
import { Icon } from "@ui/icons";
import { Dropdown } from "@ui/select";
import { appTheme } from "../../stores/theme";
import { Credits } from "../../components/credits";
import { planCost, startSession, type Surface } from "../../stores/generate";
import { IMAGE_SOURCES, LENGTHS, PLACEHOLDER, SURFACES, shuffledPrompts } from "./prompts";
import { setPreviewFormat } from "./shared";
import {
    formatBytes,
    mergeAttachments,
    nextAttachmentId,
    readAttachment,
    SOURCE_LIMIT,
    sourceLength,
    type Attachment,
} from "./context";

// One prompt, the material it's built from, and three quiet settings that live in the composer
// rather than floating beneath it. Everything else is a decision for the outline, not for here.

export const Intake: Component = () => {
    const [prompt, setPrompt] = createSignal("");
    const [fmt, setFmt] = createSignal<Surface>("deck");
    const [length, setLength] = createSignal("Standard");
    const [imageSource, setImageSource] = createSignal("stock");
    const [items, setItems] = createSignal<Attachment[]>([]);
    const [pasting, setPasting] = createSignal(false);
    const [paste, setPaste] = createSignal("");
    const [dropping, setDropping] = createSignal(false);
    const [fileError, setFileError] = createSignal("");
    let fileInput!: HTMLInputElement;

    const deck = shuffledPrompts();
    const [exOffset, setExOffset] = createSignal(0);
    const examples = (): { text: string; format: Surface }[] =>
        Array.from({ length: 3 }, (_, i) => deck[(exOffset() + i) % deck.length]!);

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

    const remove = (id: string): void => {
        setItems((cur) => cur.filter((a) => a.id !== id));
    };

    const overLimit = (): number => Math.max(0, sourceLength(items()) - SOURCE_LIMIT);
    const ready = (): boolean => !!prompt().trim() || items().length > 0;
    // which suggestion is in the box, so switching reads as picking rather than overwriting
    const picked = (): string => prompt().trim();

    const launch = (): void => {
        if (!ready()) return;
        setPreviewFormat(fmt()); // the studio previews what the brief asked for
        void startSession({
            prompt: prompt().trim() || PLACEHOLDER,
            surface: fmt(),
            theme: appTheme(),
            length: length(),
            imageSource: imageSource() === "ai" ? "ai" : "stock",
            source: mergeAttachments(items()),
        });
    };

    return (
        <div
            class="grid h-full place-items-center overflow-y-auto px-6 py-10"
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
            <div class="w-full max-w-150">
                <h1
                    class="text-center font-serif text-[30px] leading-tight"
                    style={{ "font-family": "var(--font-display)" }}
                >
                    What are we making?
                </h1>
                <p class="mt-1.5 text-center text-[13px] leading-relaxed text-muted">
                    Describe it in a sentence. You'll get an editable outline before a word is
                    written.
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

                    <Show when={items().length}>
                        <div class="flex flex-wrap gap-1.5 px-3 pb-2">
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
                                        <Icon name={a.kind === "file" ? "doc" : "text"} size={11} />
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

                    {/* the composer owns its settings — they're about this prompt, not the page */}
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
                        <IconButton
                            size="lg"
                            tone="muted"
                            title="Attach text files (.txt, .md, .csv, .json)"
                            onClick={() => fileInput.click()}
                        >
                            <Icon name="plus" size={14} />
                        </IconButton>
                        <IconButton
                            size="lg"
                            tone="muted"
                            title="Paste material to build from"
                            disabled={pasting()}
                            onClick={() => setPasting(true)}
                        >
                            <Icon name="text" size={14} />
                        </IconButton>

                        <span class="mx-1 h-4 w-px flex-none bg-line" />

                        <Dropdown
                            compact
                            value={fmt()}
                            options={SURFACES}
                            onChange={(v) => setFmt(v as Surface)}
                        />
                        <Dropdown compact value={length()} options={LENGTHS} onChange={setLength} />
                        <Dropdown
                            compact
                            value={imageSource()}
                            options={IMAGE_SOURCES}
                            onChange={setImageSource}
                        />

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

                {/* Always here, so picking a different one is a click rather than a clear-and-retype.
                    Only the prompt and format change — attached context survives every switch. */}
                <div class="mt-8">
                    <div class="mb-1 flex items-center gap-2 px-1">
                        <span class="flex-none font-mono text-[9px] uppercase tracking-[0.14em] text-muted">
                            Suggested prompts
                        </span>
                        <span class="h-px flex-1 bg-line" />
                        <IconButton
                            size="sm"
                            rounded="md"
                            class="group"
                            title="Show different ideas"
                            onClick={() => setExOffset((o) => (o + 3) % deck.length)}
                        >
                            <span class="transition-transform duration-300 group-hover:rotate-90">
                                <Icon name="refresh" size={11} />
                            </span>
                        </IconButton>
                    </div>
                    <For each={examples()}>
                        {(ex) => (
                            <button
                                class="group flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-panel"
                                classList={{ "bg-panel": picked() === ex.text }}
                                onClick={() => {
                                    setPrompt(ex.text);
                                    setFmt(ex.format);
                                }}
                            >
                                <span
                                    class="min-w-0 flex-1 truncate text-[12.5px] transition-colors group-hover:text-ink"
                                    classList={{
                                        "text-ink": picked() === ex.text,
                                        "text-soft": picked() !== ex.text,
                                    }}
                                >
                                    {ex.text}
                                </span>
                                <span
                                    class="flex-none transition-opacity"
                                    classList={{
                                        "text-accent opacity-100": picked() === ex.text,
                                        "text-muted opacity-0 group-hover:opacity-100":
                                            picked() !== ex.text,
                                    }}
                                >
                                    <Icon
                                        name={picked() === ex.text ? "check" : "arrowUpRight"}
                                        size={12}
                                    />
                                </span>
                            </button>
                        )}
                    </For>
                </div>
            </div>
        </div>
    );
};
