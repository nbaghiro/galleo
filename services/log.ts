// The sanctioned process-output channel. `no-console` bans ad-hoc printing, but CLI scripts, the
// server's lifecycle line, and dev-mode fallbacks still need stdout/stderr; routing them through one
// module keeps that intent explicit and leaves a single place to swap in a real logger.

export const out = (msg = ""): void => {
    process.stdout.write(`${msg}\n`);
};

export const warn = (msg: string): void => {
    process.stderr.write(`${msg}\n`);
};
