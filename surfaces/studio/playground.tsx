import "@elements/text";
import "@elements/image";
import "@elements/card";
import "@elements/group";
import "@elements/stat";
import "@elements/bullets";
import "@elements/button";
import "@elements/divider";
import "@elements/quote";
import "@elements/callout";
import "@elements/code";
import "@elements/badge";
import "@elements/spacer";
import "@elements/gradient";
import "@elements/chart";
import "@elements/table";
import "@elements/diagram";
import "@elements/video";
import "@elements/embed";

import type { LayoutCtx } from "@elements/element-spec";
import type { EngineNode } from "@engine/node";
import type { ElementInstance } from "@model/content";
import type { Theme, Tokens } from "@themes/theme";
import { getElement, listElements } from "@elements/registry";
import { skeletonFor } from "@elements/skeleton";
import { fit, grow } from "@model/size";
import { resolveTheme, THEME_LIST } from "@themes/library";
import { paint } from "./dom-backend";
import { measureText } from "./measure";
import { ctxFor, layoutNode } from "./render";

// Standalone element library: every registered element rendered in three states — structural
// skeleton, default `create()` data, and a filled real-world case — across a width control and any
// theme. A living catalog + manual test harness for the registry. Served at /playground.html.

const txt = (text: string, style: string): ElementInstance => ({ type: "text", data: { text, style } });

// Realistic content per element (distinct from the leaner `create()` defaults).
const FILLED: Record<string, unknown> = {
    text: { text: "Sound, rediscovered.", style: "h2" },
    image: { src: "https://picsum.photos/seed/galleo-library/1100/760", aspect: 1.45, radius: 12, fit: "cover" },
    card: {
        children: [
            txt("Pro", "eyebrow"),
            txt("$20 / month", "title"),
            txt("Everything to draft, theme, and ship a polished deck.", "body"),
            { type: "button", data: { label: "Choose Pro" } },
        ],
    },
    group: {
        children: [txt("THE FEELING", "eyebrow"), txt("Your taste, on autopilot", "h2"), txt("No more scrolling for the right track — it reads the room and plays the thing.", "body")],
    },
    stat: { children: [txt("98%", "stat"), txt("weekly retention", "caption")] },
    bullets: {
        children: [txt("Curated, never generated slop", "body"), txt("Edit any block inline", "body"), txt("Switch theme in one click", "body"), txt("Present or publish instantly", "body")],
        marker: "check",
    },
    button: { label: "Start for free" },
    divider: { thickness: 2 },
    quote: { children: [txt("Speed made everyone a publisher. Taste is the only moat left.", "title"), txt("— the Galleo thesis", "byline")] },
    callout: { tone: "success", children: [txt("Shipped: document backgrounds now render behind every section.", "body")] },
    code: { code: 'const artifact = await galleo.generate(prompt);\nrender(artifact, { theme: "noir" });' },
    badge: { text: "BETA" },
    spacer: { height: 28 },
    gradient: { from: "#1f6feb", to: "#0b1020", angle: 135, height: 120 },
    chart: { kind: "line", values: "8, 14, 11, 22, 19, 27, 24", height: 170 },
    table: { data: "Plan,Price,Seats\nStarter,Free,1\nPro,$20,5\nTeam,$50,20", header: true },
    diagram: { kind: "pyramid", items: "Awareness, Interest, Desire, Action", height: 180 },
    video: { url: "https://youtu.be/galleo-demo" },
    embed: { title: "Galleo — the editor for people who care", url: "https://galleo.app" },
};

const CATEGORY_ORDER = ["text", "media", "data", "interactive", "branding", "layout", "decoration", "container"];
const CATEGORY_LABELS: Record<string, string> = {
    text: "Text",
    media: "Media",
    data: "Data & charts",
    interactive: "Interactive",
    branding: "Branding",
    layout: "Layout",
    decoration: "Decoration",
    container: "Containers",
};

const WIDTHS: Record<string, number> = { Narrow: 300, Medium: 440, Wide: 620 };

function composeInstance(inst: ElementInstance, ctx: LayoutCtx): EngineNode {
    const spec = getElement(inst.type);
    if (!spec) return { w: grow(), h: fit(40), fill: { color: "#f6dede", radius: 6 } };
    if (spec.container) {
        const kids = spec.container.children(inst.data).map((c) => composeInstance(c, ctx));
        return spec.container.arrange(inst.data, ctx, kids);
    }
    return spec.layout(inst.data, ctx);
}

function el(tag: string, css = "", text = ""): HTMLElement {
    const e = document.createElement(tag);
    if (css) e.style.cssText = css;
    if (text) e.textContent = text;
    return e;
}

function previewFrame(node: EngineNode, width: number, tk: Tokens, label: string): HTMLElement {
    const { commands, height } = layoutNode(node, width, measureText);
    const inner = el("div", `position:relative;width:${width}px;height:${height}px`);
    paint(commands, inner);
    const box = el("div", `background:${tk.surface};border:1px solid ${tk.line};border-radius:14px;padding:18px;width:max-content`);
    box.appendChild(inner);
    const cap = el("div", `font:600 9.5px/1.4 ui-monospace,monospace;letter-spacing:.09em;text-transform:uppercase;color:${tk.muted};margin-bottom:9px`, label);
    const col = el("div", "display:flex;flex-direction:column");
    col.append(cap, box);
    return col;
}

function elementCard(type: string, width: number, tk: Tokens): HTMLElement {
    const spec = getElement(type)!;
    const ctx = ctxFor(width, tk);
    const card = el("div", `border:1px solid ${tk.line};border-radius:18px;padding:22px;background:${tk.bg}`);

    const head = el("div", "display:flex;align-items:baseline;gap:12px;margin-bottom:16px;flex-wrap:wrap");
    head.append(
        el("div", `font:700 18px/1 system-ui,sans-serif;color:${tk.ink}`, spec.label),
        el("div", `font:500 11px/1 ui-monospace,monospace;color:${tk.muted}`, `${spec.type} · ${spec.category} · ${spec.tier}`),
    );

    const states = el("div", "display:flex;flex-wrap:wrap;gap:16px;align-items:flex-start");
    states.append(
        previewFrame(skeletonFor(spec, ctx), width, tk, "Skeleton"),
        previewFrame(composeInstance({ type, data: spec.create() }, ctx), width, tk, "Default"),
        previewFrame(composeInstance({ type, data: FILLED[type] ?? spec.create() }, ctx), width, tk, "Filled"),
    );

    card.append(head, states);
    return card;
}

const app = document.getElementById("app")!;
let themeId = "noir";
let width = WIDTHS.Medium!;

function render(): void {
    const theme = resolveTheme(themeId);
    const tk = theme.tokens;
    document.body.style.cssText = `margin:0;background:${tk.bg};color:${tk.ink};font-family:system-ui,sans-serif`;
    app.replaceChildren();

    // toolbar
    const bar = el("div", `position:sticky;top:0;z-index:10;display:flex;align-items:center;gap:18px;flex-wrap:wrap;padding:16px 28px;background:${tk.surface};border-bottom:1px solid ${tk.line}`);
    bar.append(el("div", `font:800 16px/1 system-ui,sans-serif;color:${tk.ink}`, "Galleo · Element Library"));
    bar.append(el("div", `font:500 12px/1 ui-monospace,monospace;color:${tk.muted}`, `${listElements().length} elements`));

    const themeSel = el("select", `margin-left:auto;padding:7px 10px;border-radius:9px;border:1px solid ${tk.line};background:${tk.bg};color:${tk.ink};font:500 13px system-ui`) as HTMLSelectElement;
    for (const th of THEME_LIST as Theme[]) {
        const opt = el("option") as HTMLOptionElement;
        opt.value = th.id;
        opt.textContent = `${th.name} · ${th.tag}`;
        if (th.id === themeId) opt.selected = true;
        themeSel.appendChild(opt);
    }
    themeSel.onchange = () => {
        themeId = themeSel.value;
        render();
    };
    bar.append(themeSel);

    const widthGroup = el("div", `display:flex;gap:2px;padding:3px;border-radius:10px;border:1px solid ${tk.line};background:${tk.bg}`);
    for (const [name, w] of Object.entries(WIDTHS)) {
        const active = w === width;
        const b = el("button", `padding:6px 12px;border:0;border-radius:7px;cursor:pointer;font:600 12px system-ui;background:${active ? tk.accent : "transparent"};color:${active ? tk.onAccent : tk.muted}`, name);
        b.onclick = () => {
            width = w;
            render();
        };
        widthGroup.append(b);
    }
    bar.append(widthGroup);
    app.append(bar);

    // catalog
    const main = el("div", "max-width:1500px;margin:0 auto;padding:30px 28px 120px");
    const items = listElements();
    const cats = [...CATEGORY_ORDER, ...items.map((s) => s.category).filter((c) => !CATEGORY_ORDER.includes(c))];
    const seen = new Set<string>();
    for (const cat of cats) {
        if (seen.has(cat)) continue;
        seen.add(cat);
        const group = items.filter((s) => s.category === cat);
        if (group.length === 0) continue;
        main.append(el("div", `margin:26px 0 14px;font:700 11px/1 ui-monospace,monospace;letter-spacing:.12em;text-transform:uppercase;color:${tk.muted}`, CATEGORY_LABELS[cat] ?? cat));
        const grid = el("div", "display:flex;flex-direction:column;gap:18px");
        for (const spec of group) grid.append(elementCard(spec.type, width, tk));
        main.append(grid);
    }
    app.append(main);
}

render();
