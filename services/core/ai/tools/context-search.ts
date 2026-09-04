import { implement } from "@services/core/ai/tools";

// Retrieval over the request's attached contexts; the retriever itself is injected per request
// (services/core/context.ts), so this body is just the agent-facing shape around it.
implement(
    "search-context",
    async function* (input, ctx) {
        if (!ctx.pack) return "No context collections are attached to this conversation.";
        const found = await ctx.pack(input.query);
        return found ?? "Nothing in the attached contexts matches that.";
    },
    { present: () => null },
);
