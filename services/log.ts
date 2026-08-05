export const out = (msg = ""): void => {
    process.stdout.write(`${msg}\n`);
};

export const warn = (msg: string): void => {
    process.stderr.write(`${msg}\n`);
};
