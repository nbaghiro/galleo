import type { TurnEvent } from "@model/ai";
import { implement } from "@services/core/ai/tools";
import { geminiRead } from "@services/core/extract";

// Only the branch of an upload that needs a model: a text layer, a docx or a spreadsheet is parsed
// locally and never comes here.
implement("read-file", async function* (input): AsyncGenerator<TurnEvent, string> {
    return await geminiRead({ data: input.data, mime: input.mime });
});
