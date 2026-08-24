import JSZip from "jszip";
import { decodeEntities } from "./webpage";

// Pure byte→structure parser for PowerPoint files: the OOXML package (a zip of XML parts) walked
// into a slide IR the import mapper (@services/core/import) turns into artifact content. Db-free,
// network-free. Google Slides' "download as .pptx" emits the same package, so one parser serves
// both. Fidelity scope: shape boxes, placeholder roles (inherited from layout/master), text runs,
// bullets, pictures, tables, charts, solid/image backgrounds, notes, and the theme color scheme.

// ---- minimal XML tree ----
// OOXML is machine-written: no DTDs, attribute values always quoted. Element names match by local
// name (prefixes vary between producers); attribute keys keep their prefix, since `p:sldId` carries
// both `id` and `r:id` and localizing would collide.

export interface XmlNode {
    name: string;
    attrs: Record<string, string>;
    children: XmlNode[];
    text: string;
}

const localName = (name: string): string => {
    const i = name.indexOf(":");
    return i >= 0 ? name.slice(i + 1) : name;
};

const ATTR_RE = /([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

export function parseXml(xml: string): XmlNode {
    const root: XmlNode = { name: "#root", attrs: {}, children: [], text: "" };
    const stack: XmlNode[] = [root];
    const TAG_RE = /<!--[\s\S]*?-->|<!\[CDATA\[([\s\S]*?)\]\]>|<[^>]+>/g;
    let last = 0;
    let m: RegExpExecArray | null;
    const top = (): XmlNode => stack[stack.length - 1]!;
    while ((m = TAG_RE.exec(xml)) !== null) {
        const between = xml.slice(last, m.index);
        if (between) top().text += decodeEntities(between);
        last = TAG_RE.lastIndex;
        const tag = m[0];
        if (tag.startsWith("<!--")) continue;
        if (m[1] !== undefined) {
            top().text += m[1];
            continue;
        }
        if (tag.startsWith("<?") || tag.startsWith("<!")) continue;
        if (tag.startsWith("</")) {
            if (stack.length > 1) stack.pop();
            continue;
        }
        const selfClosed = tag.endsWith("/>");
        const inner = tag.slice(1, selfClosed ? -2 : -1);
        const space = inner.search(/[\s/]/);
        const rawName = space < 0 ? inner : inner.slice(0, space);
        const node: XmlNode = { name: localName(rawName), attrs: {}, children: [], text: "" };
        if (space >= 0) {
            const attrSrc = inner.slice(space);
            let a: RegExpExecArray | null;
            ATTR_RE.lastIndex = 0;
            while ((a = ATTR_RE.exec(attrSrc)) !== null)
                node.attrs[a[1]!] = decodeEntities(a[2] ?? a[3] ?? "");
        }
        top().children.push(node);
        if (!selfClosed) stack.push(node);
    }
    return root.children[0] ?? root;
}

export const kids = (n: XmlNode, name: string): XmlNode[] =>
    n.children.filter((c) => c.name === name);
export const kid = (n: XmlNode, name: string): XmlNode | undefined =>
    n.children.find((c) => c.name === name);
export function descend(n: XmlNode, ...names: string[]): XmlNode | undefined {
    let cur: XmlNode | undefined = n;
    for (const name of names) {
        if (!cur) return undefined;
        cur = kid(cur, name);
    }
    return cur;
}
export function findAll(n: XmlNode, name: string): XmlNode[] {
    const out: XmlNode[] = [];
    const walk = (x: XmlNode): void => {
        if (x.name === name) out.push(x);
        x.children.forEach(walk);
    };
    walk(n);
    return out;
}

// relationship-namespace attribute: `r:id`, `r:embed` — prefix varies, the bare name never appears
const rAttr = (n: XmlNode, local: string): string | undefined => {
    const exact = n.attrs[`r:${local}`];
    if (exact !== undefined) return exact;
    for (const [k, v] of Object.entries(n.attrs))
        if (k !== local && k.endsWith(`:${local}`)) return v;
    return undefined;
};

// ---- package plumbing ----

interface Rel {
    type: string;
    target: string; // resolved package path
}

// rel targets are relative to the part's own folder ("../media/x") or package-absolute ("/ppt/x")
function resolveTarget(baseDir: string, target: string): string {
    if (target.startsWith("/")) return target.slice(1);
    const parts = baseDir ? baseDir.split("/") : [];
    for (const seg of target.split("/")) {
        if (seg === "..") parts.pop();
        else if (seg !== ".") parts.push(seg);
    }
    return parts.join("/");
}

function parseRels(xml: string, partPath: string): Map<string, Rel> {
    const baseDir = partPath.slice(0, partPath.lastIndexOf("/")).replace(/\/_rels$/, "");
    const out = new Map<string, Rel>();
    for (const rel of findAll(parseXml(xml), "Relationship")) {
        const id = rel.attrs.Id;
        const target = rel.attrs.Target;
        if (!id || !target) continue;
        out.set(id, { type: rel.attrs.Type ?? "", target: resolveTarget(baseDir, target) });
    }
    return out;
}

const relsPathOf = (partPath: string): string => {
    const i = partPath.lastIndexOf("/");
    return `${partPath.slice(0, i)}/_rels/${partPath.slice(i + 1)}.rels`;
};

// ---- units + colors ----

const EMU_PER_PX = 9525;
export const emuToPx = (emu: number): number => Math.round(emu / EMU_PER_PX);

// the default p:clrMap (bg1→lt1, tx1→dk1, bg2→lt2, tx2→dk2); per-master remaps are rare enough
// that honoring the default is the right cost/fidelity trade
const SCHEME_ALIASES: Record<string, string> = { bg1: "lt1", tx1: "dk1", bg2: "lt2", tx2: "dk2" };

export type ColorScheme = Record<string, string>;

// first solid color under `n` (srgbClr / schemeClr / sysClr), as #rrggbb
export function resolveColor(n: XmlNode | undefined, scheme: ColorScheme): string | undefined {
    if (!n) return undefined;
    const srgb = findAll(n, "srgbClr")[0];
    if (srgb?.attrs.val) return `#${srgb.attrs.val.toLowerCase()}`;
    const sys = findAll(n, "sysClr")[0];
    if (sys?.attrs.lastClr) return `#${sys.attrs.lastClr.toLowerCase()}`;
    const schemeClr = findAll(n, "schemeClr")[0];
    const name = schemeClr?.attrs.val;
    if (name) return scheme[SCHEME_ALIASES[name] ?? name];
    return undefined;
}

// ---- IR ----

export interface Box {
    x: number;
    y: number;
    w: number;
    h: number;
}

export type PhRole = "title" | "ctrTitle" | "subTitle" | "body" | "meta";

export interface PptxRun {
    text: string;
    b?: boolean;
    i?: boolean;
    u?: boolean;
    sz?: number; // points
    color?: string;
}

export interface PptxPara {
    runs: PptxRun[];
    lvl: number;
    bullet?: boolean; // explicit buChar/buNone; absent = inherit (body placeholders default on)
    numbered?: boolean;
    align?: "start" | "center" | "end";
}

export interface PptxMediaRef {
    path: string; // package path, the dedupe key
    mime: string;
    data: string; // base64
}

export interface PptxChart {
    type: "bar" | "column" | "line" | "area" | "pie" | "donut" | "radar" | "scatter";
    categories: string[];
    series: { name?: string; values: number[] }[];
}

export type PptxShape =
    | { kind: "sp"; box: Box; role?: PhRole; geom?: string; fill?: string; paras: PptxPara[] }
    | { kind: "picture"; box: Box; media: PptxMediaRef; alt?: string }
    | { kind: "table"; box: Box; cells: string[][]; header: boolean }
    | { kind: "chart"; box: Box; chart: PptxChart };

export interface PptxSlide {
    bg?: { color?: string; image?: PptxMediaRef };
    shapes: PptxShape[];
    notes?: string;
}

export interface PptxDeck {
    w: number;
    h: number;
    title?: string;
    scheme: ColorScheme;
    slides: PptxSlide[];
}

// ---- geometry ----

interface Transform {
    x: number;
    y: number;
    sx: number;
    sy: number;
}

const IDENTITY: Transform = { x: 0, y: 0, sx: 1, sy: 1 };

function parseXfrm(xfrm: XmlNode | undefined): Box | null {
    const off = xfrm && kid(xfrm, "off");
    const ext = xfrm && kid(xfrm, "ext");
    if (!off || !ext) return null;
    return {
        x: Number(off.attrs.x ?? 0),
        y: Number(off.attrs.y ?? 0),
        w: Number(ext.attrs.cx ?? 0),
        h: Number(ext.attrs.cy ?? 0),
    };
}

const applyTransform = (b: Box, t: Transform): Box => ({
    x: t.x + b.x * t.sx,
    y: t.y + b.y * t.sy,
    w: b.w * t.sx,
    h: b.h * t.sy,
});

const boxToPx = (b: Box): Box => ({
    x: emuToPx(b.x),
    y: emuToPx(b.y),
    w: emuToPx(b.w),
    h: emuToPx(b.h),
});

// ---- text ----

const ALIGN: Record<string, "start" | "center" | "end"> = { l: "start", ctr: "center", r: "end" };

function parseBody(txBody: XmlNode, scheme: ColorScheme): PptxPara[] {
    const paras: PptxPara[] = [];
    for (const p of kids(txBody, "p")) {
        const pPr = kid(p, "pPr");
        const para: PptxPara = { runs: [], lvl: Number(pPr?.attrs.lvl ?? 0) };
        const algn = pPr?.attrs.algn;
        if (algn && ALIGN[algn]) para.align = ALIGN[algn];
        if (pPr) {
            if (kid(pPr, "buNone")) para.bullet = false;
            else if (kid(pPr, "buChar")) para.bullet = true;
            else if (kid(pPr, "buAutoNum")) {
                para.bullet = true;
                para.numbered = true;
            }
        }
        for (const child of p.children) {
            if (child.name === "br") {
                para.runs.push({ text: "\n" });
                continue;
            }
            if (child.name !== "r" && child.name !== "fld") continue;
            const t = kid(child, "t")?.text ?? "";
            if (!t) continue;
            const rPr = kid(child, "rPr");
            const run: PptxRun = { text: t };
            if (rPr) {
                if (rPr.attrs.b === "1" || rPr.attrs.b === "true") run.b = true;
                if (rPr.attrs.i === "1" || rPr.attrs.i === "true") run.i = true;
                if (rPr.attrs.u && rPr.attrs.u !== "none") run.u = true;
                const sz = Number(rPr.attrs.sz);
                if (Number.isFinite(sz) && sz > 0) run.sz = sz / 100; // hundredths of a point
                const color = resolveColor(kid(rPr, "solidFill"), scheme);
                if (color) run.color = color;
            }
            para.runs.push(run);
        }
        paras.push(para);
    }
    return paras;
}

export const paraText = (p: PptxPara): string => p.runs.map((r) => r.text).join("");
export const parasText = (paras: PptxPara[]): string =>
    paras
        .map(paraText)
        .join("\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();

// ---- placeholders ----

const PH_ROLES: Record<string, PhRole> = {
    title: "title",
    ctrTitle: "ctrTitle",
    subTitle: "subTitle",
    body: "body",
    sldNum: "meta",
    ftr: "meta",
    dt: "meta",
};

interface Placeholder {
    type?: string;
    idx?: string;
}

function placeholderOf(sp: XmlNode): Placeholder | null {
    const ph = findAll(sp, "ph")[0];
    if (!ph) return null;
    return { type: ph.attrs.type, idx: ph.attrs.idx };
}

// a slide placeholder usually carries no xfrm of its own; the box lives on the layout (or master)
function phBoxMap(spTree: XmlNode | undefined, into: Map<string, Box>): void {
    if (!spTree) return;
    for (const sp of kids(spTree, "sp")) {
        const ph = placeholderOf(sp);
        const box = parseXfrm(descend(sp, "spPr", "xfrm"));
        if (!ph || !box) continue;
        for (const key of [
            `${ph.type ?? ""}:${ph.idx ?? ""}`,
            `${ph.type ?? ""}:`,
            `:${ph.idx ?? ""}`,
        ])
            if (!into.has(key)) into.set(key, box);
    }
}

function inheritedBox(ph: Placeholder, inherited: Map<string, Box>): Box | null {
    return (
        inherited.get(`${ph.type ?? ""}:${ph.idx ?? ""}`) ??
        inherited.get(`${ph.type ?? ""}:`) ??
        inherited.get(`:${ph.idx ?? ""}`) ??
        null
    );
}

// ---- tables + charts ----

function parseTable(tbl: XmlNode, scheme: ColorScheme): { cells: string[][]; header: boolean } {
    const cells: string[][] = [];
    for (const tr of kids(tbl, "tr")) {
        const row: string[] = [];
        for (const tc of kids(tr, "tc")) {
            const body = kid(tc, "txBody");
            row.push(body ? parasText(parseBody(body, scheme)) : "");
        }
        if (row.some((c) => c !== "")) cells.push(row);
    }
    const header = kid(tbl, "tblPr")?.attrs.firstRow === "1";
    return { cells, header };
}

const CHART_KINDS: Record<string, PptxChart["type"]> = {
    barChart: "bar", // barDir splits bar/column below
    bar3DChart: "bar",
    lineChart: "line",
    line3DChart: "line",
    areaChart: "area",
    area3DChart: "area",
    pieChart: "pie",
    pie3DChart: "pie",
    doughnutChart: "donut",
    radarChart: "radar",
    scatterChart: "scatter",
};

function refValues(ser: XmlNode, name: string): string[] {
    const holder = kid(ser, name);
    if (!holder) return [];
    const pts = findAll(holder, "pt").sort(
        (a, b) => Number(a.attrs.idx ?? 0) - Number(b.attrs.idx ?? 0),
    );
    return pts.map((pt) => kid(pt, "v")?.text.trim() ?? "");
}

export function parseChartXml(xml: string): PptxChart | null {
    const root = parseXml(xml);
    const plotArea = findAll(root, "plotArea")[0];
    if (!plotArea) return null;
    for (const child of plotArea.children) {
        const mapped = CHART_KINDS[child.name];
        if (!mapped) continue;
        let type: PptxChart["type"] = mapped;
        if (child.name.startsWith("bar"))
            type = kid(child, "barDir")?.attrs.val === "bar" ? "bar" : "column";
        const series: PptxChart["series"] = [];
        let categories: string[] = [];
        for (const ser of kids(child, "ser")) {
            const name = refValues(kid(ser, "tx") ?? ser, "strRef")[0];
            const cats = refValues(ser, "cat");
            if (cats.length && !categories.length) categories = cats;
            const vals = refValues(ser, type === "scatter" ? "yVal" : "val")
                .map((v) => Number(v))
                .map((v) => (Number.isFinite(v) ? v : 0));
            if (vals.length) series.push({ ...(name ? { name } : {}), values: vals });
        }
        if (!series.length) return null;
        return { type, categories, series };
    }
    return null;
}

// ---- media ----

const MEDIA_MIME: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
};

// ---- the walk ----

interface PartCtx {
    zip: JSZip;
    scheme: ColorScheme;
    rels: Map<string, Rel>;
    inherited: Map<string, Box>;
    media: Map<string, PptxMediaRef>; // by package path, deck-wide
}

async function mediaFor(ctx: PartCtx, relId: string | undefined): Promise<PptxMediaRef | null> {
    if (!relId) return null;
    const rel = ctx.rels.get(relId);
    if (!rel) return null;
    const cached = ctx.media.get(rel.target);
    if (cached) return cached;
    const ext = rel.target.slice(rel.target.lastIndexOf(".") + 1).toLowerCase();
    const mime = MEDIA_MIME[ext];
    if (!mime) return null; // emf/wmf metafiles have no browser rendering
    const file = ctx.zip.file(rel.target);
    if (!file) return null;
    const data = await file.async("base64");
    const ref: PptxMediaRef = { path: rel.target, mime, data };
    ctx.media.set(rel.target, ref);
    return ref;
}

async function walkShapes(
    parent: XmlNode,
    ctx: PartCtx,
    t: Transform,
    out: PptxShape[],
): Promise<void> {
    for (const child of parent.children) {
        if (child.name === "sp") {
            const ph = placeholderOf(child);
            let box = parseXfrm(descend(child, "spPr", "xfrm"));
            if (!box && ph) box = inheritedBox(ph, ctx.inherited);
            if (!box) continue;
            const body = kid(child, "txBody");
            const geom = descend(child, "spPr", "prstGeom")?.attrs.prst;
            const fill = resolveColor(descend(child, "spPr", "solidFill"), ctx.scheme);
            out.push({
                kind: "sp",
                box: boxToPx(applyTransform(box, t)),
                ...(ph?.type && PH_ROLES[ph.type] ? { role: PH_ROLES[ph.type] } : {}),
                ...(geom ? { geom } : {}),
                ...(fill ? { fill } : {}),
                paras: body ? parseBody(body, ctx.scheme) : [],
            });
        } else if (child.name === "pic") {
            const box = parseXfrm(descend(child, "spPr", "xfrm"));
            if (!box) continue;
            const blip = findAll(child, "blip")[0];
            const media = await mediaFor(ctx, blip ? rAttr(blip, "embed") : undefined);
            if (!media) continue;
            const alt = findAll(child, "cNvPr")[0]?.attrs.descr;
            out.push({
                kind: "picture",
                box: boxToPx(applyTransform(box, t)),
                media,
                ...(alt ? { alt } : {}),
            });
        } else if (child.name === "graphicFrame") {
            const box = parseXfrm(kid(child, "xfrm"));
            if (!box) continue;
            const data = descend(child, "graphic", "graphicData");
            if (!data) continue;
            const tbl = kid(data, "tbl");
            if (tbl) {
                const { cells, header } = parseTable(tbl, ctx.scheme);
                if (cells.length)
                    out.push({
                        kind: "table",
                        box: boxToPx(applyTransform(box, t)),
                        cells,
                        header,
                    });
                continue;
            }
            const chartRef = kid(data, "chart");
            const relId = chartRef ? rAttr(chartRef, "id") : undefined;
            const rel = relId ? ctx.rels.get(relId) : undefined;
            const chartXml = rel ? await ctx.zip.file(rel.target)?.async("string") : undefined;
            const chart = chartXml ? parseChartXml(chartXml) : null;
            if (chart) out.push({ kind: "chart", box: boxToPx(applyTransform(box, t)), chart });
        } else if (child.name === "grpSp") {
            // flatten: children map through off/ext vs chOff/chExt, so leaves land in slide coords
            const xfrm = descend(child, "grpSpPr", "xfrm");
            const box = parseXfrm(xfrm);
            const chOff = xfrm && kid(xfrm, "chOff");
            const chExt = xfrm && kid(xfrm, "chExt");
            if (!box || !chOff || !chExt) continue;
            const cw = Number(chExt.attrs.cx ?? 0) || box.w;
            const chh = Number(chExt.attrs.cy ?? 0) || box.h;
            const inner: Transform = {
                x: box.x - Number(chOff.attrs.x ?? 0) * (box.w / cw),
                y: box.y - Number(chOff.attrs.y ?? 0) * (box.h / chh),
                sx: box.w / cw,
                sy: box.h / chh,
            };
            await walkShapes(child, ctx, compose(t, inner), out);
        }
        // cxnSp (connectors) and everything else: decoration with no flow meaning
    }
}

const compose = (outer: Transform, inner: Transform): Transform => ({
    x: outer.x + inner.x * outer.sx,
    y: outer.y + inner.y * outer.sy,
    sx: outer.sx * inner.sx,
    sy: outer.sy * inner.sy,
});

// ---- parts ----

async function partXml(zip: JSZip, path: string): Promise<XmlNode | null> {
    const file = zip.file(path);
    if (!file) return null;
    return parseXml(await file.async("string"));
}

async function partRels(zip: JSZip, partPath: string): Promise<Map<string, Rel>> {
    const file = zip.file(relsPathOf(partPath));
    if (!file) return new Map();
    return parseRels(await file.async("string"), relsPathOf(partPath));
}

const relOfType = (rels: Map<string, Rel>, suffix: string): Rel | undefined =>
    [...rels.values()].find((r) => r.type.endsWith(suffix));

function parseScheme(theme: XmlNode | null): ColorScheme {
    const out: ColorScheme = {};
    if (!theme) return out;
    const clrScheme = findAll(theme, "clrScheme")[0];
    if (!clrScheme) return out;
    for (const entry of clrScheme.children) {
        const color = resolveColor(entry, {});
        if (color) out[entry.name] = color;
    }
    return out;
}

async function slideNotes(
    zip: JSZip,
    rels: Map<string, Rel>,
    scheme: ColorScheme,
): Promise<string> {
    const rel = relOfType(rels, "/notesSlide");
    if (!rel) return "";
    const notes = await partXml(zip, rel.target);
    if (!notes) return "";
    const texts: string[] = [];
    for (const sp of findAll(notes, "sp")) {
        const ph = placeholderOf(sp);
        if (ph?.type !== "body") continue;
        const body = kid(sp, "txBody");
        if (body) texts.push(parasText(parseBody(body, scheme)));
    }
    return texts.join("\n").trim();
}

async function slideBackground(slide: XmlNode, ctx: PartCtx): Promise<PptxSlide["bg"] | undefined> {
    const bgPr = descend(slide, "cSld", "bg", "bgPr");
    if (!bgPr) return undefined;
    const blipFill = kid(bgPr, "blipFill");
    if (blipFill) {
        const blip = findAll(blipFill, "blip")[0];
        const image = await mediaFor(ctx, blip ? rAttr(blip, "embed") : undefined);
        if (image) return { image };
    }
    const color = resolveColor(kid(bgPr, "solidFill"), ctx.scheme);
    return color ? { color } : undefined;
}

export async function parsePptx(bytes: Uint8Array): Promise<PptxDeck> {
    const zip = await JSZip.loadAsync(bytes);
    const presentation = await partXml(zip, "ppt/presentation.xml");
    if (!presentation) throw new Error("not a PowerPoint file");
    const presRels = await partRels(zip, "ppt/presentation.xml");

    const sldSz = kid(presentation, "sldSz");
    const w = emuToPx(Number(sldSz?.attrs.cx ?? 12192000));
    const h = emuToPx(Number(sldSz?.attrs.cy ?? 6858000));

    const themeRel = relOfType(presRels, "/theme");
    const scheme = parseScheme(themeRel ? await partXml(zip, themeRel.target) : null);

    const core = await partXml(zip, "docProps/core.xml");
    const title = core ? kid(core, "title")?.text.trim() || undefined : undefined;

    const media = new Map<string, PptxMediaRef>();
    const slides: PptxSlide[] = [];
    const slideIds = findAll(presentation, "sldId");
    for (const sldId of slideIds) {
        const relId = rAttr(sldId, "id");
        const rel = relId ? presRels.get(relId) : undefined;
        if (!rel) continue;
        const slideXml = await partXml(zip, rel.target);
        if (!slideXml) continue;
        const rels = await partRels(zip, rel.target);

        // placeholder boxes inherit slide ← layout ← master
        const inherited = new Map<string, Box>();
        const layoutRel = relOfType(rels, "/slideLayout");
        const layout = layoutRel ? await partXml(zip, layoutRel.target) : null;
        if (layout) phBoxMap(findAll(layout, "spTree")[0], inherited);
        if (layoutRel) {
            const layoutRels = await partRels(zip, layoutRel.target);
            const masterRel = relOfType(layoutRels, "/slideMaster");
            const master = masterRel ? await partXml(zip, masterRel.target) : null;
            if (master) phBoxMap(findAll(master, "spTree")[0], inherited);
        }

        const ctx: PartCtx = { zip, scheme, rels, inherited, media };
        const spTree = findAll(slideXml, "spTree")[0];
        const shapes: PptxShape[] = [];
        if (spTree) await walkShapes(spTree, ctx, IDENTITY, shapes);
        const bg = await slideBackground(slideXml, ctx);
        const notes = await slideNotes(zip, rels, scheme);
        slides.push({ shapes, ...(bg ? { bg } : {}), ...(notes ? { notes } : {}) });
    }

    return { w, h, ...(title ? { title } : {}), scheme, slides };
}
