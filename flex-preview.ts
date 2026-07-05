// Standalone visual harness for the `flex` format spike — NOT part of the product build.
// Renders a demo flex carousel through the real @canvas editor painter (paintSectionStack, now with the
// fixed-frame branch) plus a working dimension picker, so we can see how flex reads in the editor before
// committing to the plan. Served by vite dev at /flex-preview.html. Plain TS — no Solid, styles inlined.

import "@editor/register";
import type { ArtifactContent, ElementInstance } from "@model/artifact";
import { paintSectionStack } from "@canvas/render/backends";
import { FLEX_PRESETS, pagedSize, profileFor } from "@engine/profile";
import { resolveTheme } from "@themes/library";
import { bullets, group, quote, section, t } from "@model/authoring";

// centered text (the authoring `t` is left-aligned; posters read better centered)
const tc = (text: string, style: string): ElementInstance => ({
    type: "text",
    data: { text, style, align: "center" },
});

const demo = (): ArtifactContent => ({
    format: "flex",
    theme: "studio",
    page: { width: 1080, height: 1350 },
    sections: [
        section(
            "s1",
            "full",
            {
                a: {
                    element: group(
                        tc("FIELD NOTES · Nº 4", "label"),
                        tc("Coastal Trails", "h1"),
                        tc("A slow weekend on the north cape", "subtitle"),
                    ),
                },
            },
            {
                background: {
                    kind: "gradient",
                    gradient: { from: "#0f172a", to: "#334155" },
                    dark: true,
                },
            },
        ),
        section("s2", "full", {
            a: {
                element: group(
                    t("THE ROUTE", "label"),
                    t("Three ways down", "h2"),
                    bullets(
                        "Cliff path — 6 km, exposed and fast",
                        "Forest loop — 9 km, shaded switchbacks",
                        "Tidal flats — beautiful, but mind the timing",
                    ),
                ),
            },
        }),
        section("s3", "full", {
            a: {
                element: quote(
                    "You don't find the coast. It finds you, one switchback at a time.",
                    "— trail log, day two",
                ),
            },
        }),
        section(
            "s4",
            "full",
            {
                a: {
                    element: group(
                        tc("Pack light. Start early.", "h2"),
                        tc("Full guide + GPX tracks at fieldnotes.co", "body"),
                    ),
                },
            },
            { background: { kind: "color", color: "#111827", dark: true } },
        ),
    ],
});

const content = demo();
const state = { w: content.page!.width, h: content.page!.height };

const app = document.getElementById("app")!;
const theme = () => resolveTheme(content.theme).tokens;

// ---- chrome ----------------------------------------------------------------
app.style.cssText = "display:flex;flex-direction:column;height:100vh;background:#eceae4";

const bar = document.createElement("div");
bar.style.cssText =
    "flex:none;display:flex;align-items:center;gap:14px;height:52px;padding:0 18px;background:#fbfaf7;border-bottom:1px solid #e3ddce;font-size:13px;color:#2b2b2b;flex-wrap:wrap";
app.appendChild(bar);

const canvasArea = document.createElement("div");
canvasArea.style.cssText = "flex:1;min-height:0;overflow:auto;padding:28px 0";
app.appendChild(canvasArea);

const wordmark = document.createElement("span");
wordmark.textContent = "GALLEO";
wordmark.style.cssText =
    "font-family:ui-monospace,monospace;font-weight:700;letter-spacing:.06em;color:#b4632a";
bar.appendChild(wordmark);

const fmtPill = document.createElement("span");
fmtPill.style.cssText =
    "display:inline-flex;align-items:center;gap:6px;padding:5px 10px;border:1px solid #e3ddce;border-radius:8px;background:#fff;font-weight:600";
fmtPill.innerHTML = "▢ Flex ▾";
bar.appendChild(fmtPill);

const spacer = document.createElement("span");
spacer.style.cssText = "flex:1";

// dimension editor — W × H inputs + a swap + preset chips
const dim = document.createElement("div");
dim.style.cssText = "display:flex;align-items:center;gap:8px;flex-wrap:wrap";
bar.appendChild(dim);

const mkNum = (get: () => number, set: (v: number) => void): HTMLInputElement => {
    const i = document.createElement("input");
    i.type = "number";
    i.value = String(get());
    i.style.cssText =
        "width:64px;padding:5px 7px;border:1px solid #e3ddce;border-radius:7px;background:#fff;font:inherit;font-size:12px;text-align:center";
    i.oninput = () => {
        const v = parseInt(i.value, 10);
        if (v > 50 && v < 8000) {
            set(v);
            rerender();
        }
    };
    return i;
};
const wIn = mkNum(
    () => state.w,
    (v) => (state.w = v),
);
const hIn = mkNum(
    () => state.h,
    (v) => (state.h = v),
);
const times = document.createElement("span");
times.textContent = "×";
times.style.color = "#8a8a8a";
const swap = document.createElement("button");
swap.textContent = "⇄";
swap.title = "Swap orientation";
swap.style.cssText =
    "padding:5px 9px;border:1px solid #e3ddce;border-radius:7px;background:#fff;cursor:pointer;font-size:13px";
swap.onclick = () => {
    [state.w, state.h] = [state.h, state.w];
    wIn.value = String(state.w);
    hIn.value = String(state.h);
    rerender();
};
dim.append(wIn, times, hIn, swap);

const chips = document.createElement("div");
chips.style.cssText = "display:flex;gap:6px;flex-wrap:wrap";
for (const p of FLEX_PRESETS) {
    const c = document.createElement("button");
    c.textContent = p.label;
    c.dataset.w = String(p.width);
    c.dataset.h = String(p.height);
    c.style.cssText =
        "padding:5px 9px;border:1px solid #e3ddce;border-radius:99px;background:#fff;cursor:pointer;font-size:11.5px;color:#4b4b4b;white-space:nowrap";
    c.onclick = () => {
        state.w = p.width;
        state.h = p.height;
        wIn.value = String(state.w);
        hIn.value = String(state.h);
        rerender();
    };
    chips.appendChild(c);
}

// second row for presets so the bar doesn't get too wide
const row2 = document.createElement("div");
row2.style.cssText =
    "flex:none;display:flex;align-items:center;gap:8px;padding:8px 18px;background:#f6f4ee;border-bottom:1px solid #e3ddce;font-size:12px;color:#6b6b6b;flex-wrap:wrap";
const presetLabel = document.createElement("span");
presetLabel.textContent = "Presets:";
presetLabel.style.cssText =
    "font-family:ui-monospace,monospace;text-transform:uppercase;letter-spacing:.08em;font-size:10px";
row2.append(presetLabel, chips);
app.insertBefore(row2, canvasArea);

// ---- render ----------------------------------------------------------------
function rerender(): void {
    content.page = { width: state.w, height: state.h };
    const profile = profileFor(content);
    const tk = theme();
    const { w: pw, h: ph } = pagedSize(profile);

    // Render at the true page proportions, then scale-to-fit so a full page shows in the viewport.
    const renderW = 1064; // fullW handed to the painter; contentW caps at the flex maxContentWidth (1000)
    const stage = document.createElement("div");
    stage.style.cssText = `position:relative;width:${renderW}px;background:${tk.bg}`;
    const { height } = paintSectionStack(stage, content.sections, profile, tk, { fullW: renderW });
    stage.style.height = `${height}px`;

    // fit one page to ~78% of the visible canvas height
    const firstPageH = Math.round((Math.min(renderW - 64, 1000) * ph) / pw);
    const areaH = canvasArea.clientHeight || 700;
    const scale = Math.max(0.15, Math.min(1, (areaH * 0.82) / firstPageH));

    const wrap = document.createElement("div");
    wrap.style.cssText = `width:${Math.round(renderW * scale)}px;margin:0 auto`;
    stage.style.transform = `scale(${scale})`;
    stage.style.transformOrigin = "top left";
    const shim = document.createElement("div");
    shim.style.cssText = `width:${renderW}px;height:${height * scale}px;transform-origin:top left`;
    shim.appendChild(stage);
    wrap.appendChild(shim);
    canvasArea.replaceChildren(wrap);
    canvasArea.style.background = tk.bg;

    // readout
    const ratio = (pw / ph).toFixed(2);
    hint.textContent = `${pw} × ${ph} px · aspect ${ratio} · ${content.sections.length} pages · rendered through the real @canvas engine (paintSectionStack, frame branch)`;

    // active chip highlight
    for (const c of Array.from(chips.children) as HTMLButtonElement[]) {
        const on = c.dataset.w === String(state.w) && c.dataset.h === String(state.h);
        c.style.background = on ? "#b4632a" : "#fff";
        c.style.color = on ? "#fff" : "#4b4b4b";
        c.style.borderColor = on ? "#b4632a" : "#e3ddce";
    }
}
bar.appendChild(spacer);

const hint = document.createElement("div");
hint.style.cssText =
    "flex:none;padding:7px 18px;background:#fbfaf7;border-top:1px solid #e3ddce;font-family:ui-monospace,monospace;font-size:11px;color:#8a8a8a";
app.appendChild(hint);

requestAnimationFrame(rerender);
window.addEventListener("resize", rerender);
