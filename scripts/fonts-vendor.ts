import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { themeFontFamilies } from "@themes";

/**
 * Vendor every face the theme library names, so the product serves its own fonts.
 *
 *   pnpm fonts:vendor
 *
 * Committed rather than fetched during the build. Fonts never churn, so the usual objection to
 * binaries in version control does not apply, and a build-time fetch would mean pulling hundreds of
 * files from Google on every deploy, which is the flaky network path this removes. It also takes the
 * fetch and the wasm decompress out of PDF and PPTX export, which used to reach Google per face.
 */

const OUT_DIR = "public/fonts";
const CSS_PATH = "public/fonts.css";
const UA =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";

const WEIGHTS = [400, 500, 600, 700, 800];

const out = (s: string): void => {
    process.stdout.write(`${s}\n`);
};

const slug = (family: string): string => family.toLowerCase().replace(/[^a-z0-9]+/g, "-");

interface Face {
    family: string;
    weight: number;
    italic: boolean;
    file: string;
    unicodeRange: string;
}

async function cssFor(family: string, weight: number, italic: boolean): Promise<string | null> {
    const fam = family.trim().replace(/\s+/g, "+");
    const url = `https://fonts.googleapis.com/css2?family=${fam}:ital,wght@${italic ? 1 : 0},${weight}&display=swap`;
    const res = await fetch(url, { headers: { "user-agent": UA } });
    return res.ok ? await res.text() : null; // css2 refuses a weight the family lacks
}

// One @font-face block per subset; the latin one is what everything here needs, and taking only it
// keeps the vendored set to a size worth committing.
function latinBlock(css: string): { src: string; range: string } | null {
    for (const block of css.split("/*")) {
        if (!/^\s*latin\s*\*\//.test(block)) continue;
        const src = /url\((https:[^)]+\.woff2)\)/.exec(block)?.[1];
        const range = /unicode-range:\s*([^;]+);/.exec(block)?.[1];
        if (src && range) return { src, range: range.trim() };
    }
    return null;
}

async function main(): Promise<void> {
    rmSync(OUT_DIR, { recursive: true, force: true });
    mkdirSync(OUT_DIR, { recursive: true });
    const faces: Face[] = [];
    const fams = themeFontFamilies();
    out(`${fams.length} families named by the theme library`);

    for (const family of fams) {
        let got = 0;
        for (const weight of WEIGHTS)
            for (const italic of [false, true]) {
                const css = await cssFor(family, weight, italic);
                const hit = css ? latinBlock(css) : null;
                if (!hit) continue;
                const file = `${slug(family)}-${weight}${italic ? "i" : ""}.woff2`;
                const bytes = new Uint8Array(await (await fetch(hit.src)).arrayBuffer());
                writeFileSync(`${OUT_DIR}/${file}`, bytes);
                faces.push({ family, weight, italic, file, unicodeRange: hit.range });
                got += 1;
            }
        out(`  ${family.padEnd(24)} ${got} faces`);
    }

    const css = faces
        .map(
            (f) =>
                `@font-face{font-family:'${f.family}';font-style:${f.italic ? "italic" : "normal"};font-weight:${f.weight};font-display:swap;src:url('/fonts/${f.file}') format('woff2');unicode-range:${f.unicodeRange}}`,
        )
        .join("\n");
    writeFileSync(CSS_PATH, `${css}\n`);
    out(`\n${faces.length} faces vendored into ${OUT_DIR}, stylesheet at ${CSS_PATH}`);
}

main().catch((e: unknown) => {
    process.stderr.write(`${String(e)}\n`);
    process.exit(1);
});
