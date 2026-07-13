import type { TextAssistRequest } from "../editor";
import { createStore } from "solid-js/store";
import { getElementAt } from "@elements/ops";
import { editing, editor, getTextAssist } from "../editor";
import { replaceTextRange, textSelection } from "../text/text-format";

type Range = { from: number; to: number };

interface TextAssistState {
    busy: boolean;
    error: string | null;
}
const [textAssist, setTextAssist] = createStore<TextAssistState>({ busy: false, error: null });
export { textAssist };
export const textAssistBusy = (): boolean => textAssist.busy;

export const canAssistText = (): boolean => getTextAssist() !== null;

export interface RewritePreset {
    label: string;
    instruction: string;
}

export const REWRITE_PRESETS: RewritePreset[] = [
    { label: "Improve writing", instruction: "Improve the writing — clearer, more polished and compelling — without changing its meaning or length much." }, // prettier-ignore
    { label: "Make it punchier", instruction: "Make it punchier and more confident: short, declarative, high-impact." }, // prettier-ignore
    { label: "Make shorter", instruction: "Make it more concise — the same message in noticeably fewer words." }, // prettier-ignore
    { label: "Make longer", instruction: "Expand it with a little more detail and texture, keeping the same voice." }, // prettier-ignore
    { label: "Fix spelling & grammar", instruction: "Fix any spelling, grammar, and punctuation mistakes. Change nothing else." }, // prettier-ignore
    { label: "More formal", instruction: "Make the tone more formal and professional." },
    { label: "More casual", instruction: "Make the tone more casual and conversational." },
];

// shortlist only — the model accepts any language name
export const LANGUAGES: string[] = [
    "Spanish",
    "French",
    "German",
    "Italian",
    "Portuguese",
    "Dutch",
    "Chinese (Simplified)",
    "Japanese",
    "Korean",
    "Arabic",
    "Hindi",
    "Russian",
];

let errTimer = 0;

function resolvePassage(
    range?: Range | null,
): { from: number; to: number; text: string; passage: string } | null {
    const addr = editing();
    if (!addr) return null;
    const inst = getElementAt(editor.artifact, addr);
    const text = ((inst?.data as { text?: string })?.text ?? "").toString();
    if (!text) return null;
    const sel = range ?? textSelection();
    let from = sel?.from ?? 0;
    let to = sel?.to ?? 0;
    if (to <= from) {
        from = 0;
        to = text.length; // collapsed caret → whole field
    }
    return { from, to, text, passage: text.slice(from, to) };
}

async function run(
    op: TextAssistRequest["op"],
    extra: { instruction?: string; language?: string },
    range?: Range | null,
): Promise<void> {
    const assist = getTextAssist();
    if (!assist || textAssist.busy) return;
    const r = resolvePassage(range);
    if (!r || !r.passage.trim()) return;
    const context = r.from > 0 || r.to < r.text.length ? r.text : undefined;

    window.clearTimeout(errTimer);
    setTextAssist({ busy: true, error: null });
    try {
        const out = await assist({ op, text: r.passage, context, ...extra });
        // apply only if still editing (the user may have clicked away mid-call)
        if (editing() && out) replaceTextRange(r.from, r.to, out);
        setTextAssist({ busy: false, error: null });
    } catch (e) {
        setTextAssist({
            busy: false,
            error: e instanceof Error ? e.message : "that didn't work",
        });
        errTimer = window.setTimeout(() => setTextAssist("error", null), 2600);
    }
}

// `range` = selection captured at menu-open, so a focus-stealing input doesn't lose the target
export function runRewrite(instruction: string, range?: Range | null): Promise<void> {
    return run("rewrite", { instruction }, range);
}
export function runTranslate(language: string, range?: Range | null): Promise<void> {
    return run("translate", { language }, range);
}

// collapsed range → resolvePassage falls through to the whole field
export function runRegenerate(): Promise<void> {
    return run(
        "rewrite",
        {
            instruction:
                "Rewrite this from scratch — a genuinely fresh, stronger version that makes the same point a different way. Keep it roughly the same length; don't just hand the same text back.",
        },
        { from: 0, to: 0 },
    );
}
