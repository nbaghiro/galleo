import "dotenv/config"; // load env before anything transitively imports the DB handle (schema.ts)
import { arg, log } from "./kit";
import { runAgentEval } from "./agent-eval";
import { runGenEval } from "./gen-eval";

// The single AI eval entry — dispatch on --mode. Both modes share the machinery in kit.ts (CLI, concurrency,
// the LLM judge, report writing); each keeps its own cases + scoring:
//   --mode=agent (default)  chat-agent tool routing + argument correctness + (--judge) reply quality
//   --mode=gen              generation output quality, reference-anchored against the hand-built demos
//
//   pnpm ai:eval [--mode=agent|gen] [--runs=N] [--models=… | --gen-models=…] [--judge] [--filter=…] [--out=…]

const run = arg("mode", "agent") === "gen" ? runGenEval : runAgentEval;

run()
    .then(() => process.exit(0))
    .catch((e: unknown) => {
        log(`FATAL: ${e instanceof Error ? e.stack : String(e)}`);
        process.exit(1);
    });
