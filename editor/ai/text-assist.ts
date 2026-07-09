import type { TextAssistRequest } from "../editor";
import { createStore } from "solid-js/store";
import { getElementAt } from "@elements/ops";
import { editing, editor, getTextAssist } from "../editor";
import { replaceTextRange, textSelection } from "../text/text-format";

// The text AI action — rewrite / translate the selected passage from the text format bar. Resolves the range
// (the live selection, or the whole field when the caret is collapsed), sends the passage through the injected
// transport (onTextAssist), and splices the result back into the field via the text bridge — one call, edited
// text in place. The menu (ai/TextAiMenu) drives this; the transport carries the model choice (fast Flash).

type Range = { from: number; to: number };

interface TextAssistState {
    busy: boolean;
    error: string | null;
}
const [textAssist, setTextAssist] = createStore<TextAssistState>({ busy: false, error: null });
export { textAssist };
export const textAssistBusy = (): boolean => textAssist.busy;

// Whether the text AI menu should be offered — a transport must be wired (studio running inside the app).
export const canAssistText = (): boolean => getTextAssist() !== null;

export interface RewritePreset {
    label: string;
    instruction: string;
}

// The rewrite presets shown in the menu — each a plain-English directive the fast model handles well.
export const REWRITE_PRESETS: RewritePreset[] = [
    { label: "Improve writing", instruction: "Improve the writing — clearer, more polished and compelling — without changing its meaning or length much." }, // prettier-ignore
    { label: "Make it punchier", instruction: "Make it punchier and more confident: short, declarative, high-impact." }, // prettier-ignore
    { label: "Make shorter", instruction: "Make it more concise — the same message in noticeably fewer words." }, // prettier-ignore
    { label: "Make longer", instruction: "Expand it with a little more detail and texture, keeping the same voice." }, // prettier-ignore
    { label: "Fix spelling & grammar", instruction: "Fix any spelling, grammar, and punctuation mistakes. Change nothing else." }, // prettier-ignore
    { label: "More formal", instruction: "Make the tone more formal and professional." },
    { label: "More casual", instruction: "Make the tone more casual and conversational." },
];

// Common translation targets shown as chips; the model accepts any language name, so this is just a shortlist.
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

// Resolve which passage to edit: the given range (captured before a menu input stole focus), else the live
// selection, and — when that's collapsed — the whole text field. Returns the passage + its offsets + the full
// text (for sub-range context), or null if there's nothing editable.
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
        to = text.length; // collapsed caret → operate on the whole field
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
        // apply only if still editing the same field (the user may have clicked away mid-call)
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

// Rewrite the passage per an instruction (a preset or a custom directive). `range` is the selection captured
// when the menu opened, used so a custom-instruction input that steals focus doesn't lose the target.
export function runRewrite(instruction: string, range?: Range | null): Promise<void> {
    return run("rewrite", { instruction }, range);
}
export function runTranslate(language: string, range?: Range | null): Promise<void> {
    return run("translate", { language }, range);
}
