# Galleo vs Gamma — gap analysis (2026-06-26)

> Source: four Gamma screenshots — (1) Grant Proposal cover, (2) Professional Portfolio with the
> floating block UX, (3) the "Basic blocks" insert menu, (4) "Smart diagrams". This maps what Gamma
> does → what Galleo has now → the gap → where it fits in our plan. Ordered by **impact on looking
> like Gamma**.

Legend: 🟥 missing · 🟧 partial · 🟩 have it.

## Progress (2026-06-26)
**Closed:** §1 section backgrounds + full-bleed ✅ · §2 section management (add/dup/move/delete + toolbar) ✅
· §3 categorized + searchable palette ✅ (slash-menu still ◦) · §4 tables, diagrams (process/pyramid/
funnel/cycle), video/embed, callout variants ✅ (19 elements) · §6 Present mode ✅ + PDF export (print) ✅
+ localStorage autosave ✅ · §5 Agent panel + **local** prompt→deck generator ✅.
**Backend-gated (need `services/`):** real LLM agent · cloud sync/persistence · publish/share URLs ·
accounts/billing · collaboration. **Client polish remaining:** slash menu · hover block toolbar ·
between-section `+` · format-as-view (doc/web modes) · more chart/diagram types.

---

## 1. Section model & canvas — the defining gap 🟥
This is the #1 reason we don't *look* like Gamma yet.

| Gamma | Galleo now | Gap |
|---|---|---|
| **Full-bleed sections** — fill the canvas edge-to-edge | Sections are bordered cards on a page with a 22px gutter | 🟥 full-bleed / edge-to-edge section mode |
| **Section backgrounds** — image, color, gradient behind the whole section, with text overlaid | Section bg = theme `surface` only; images live *inside* a cell | 🟥 per-section background (image/color/gradient) + content overlay + scrim |
| **Cover / hero sections** — split image+panel, full-bleed photo with title overlay | We have split templates, but no bg-image cover | 🟥 cover/hero section presets |
| **Per-section controls** — background, padding/width, "accent image", duplicate, delete | grid template picker only | 🟧 section background + width/padding controls |
| **Variable section "fit"** — full-width vs contained content width | content is a fixed `max-w-[1100px]` | 🟧 per-section content width |

**Build:** section gets `background` (none | color | gradient | image + overlay/scrim) and `bleed`
(contained | full) — a `SectionStyle`. The engine already lays sections into layers; this is mostly a
compose + paint change. **Highest visual ROI.**

---

## 2. Insert system — categorized + slash + rail 🟧
| Gamma | Galleo now | Gap |
|---|---|---|
| **Vertical category icon-rail** (search · text · image · components · diagrams · chart · video · embed · draw) | flat palette of 14 skeletons in the right panel | 🟧 category rail / grouping |
| **Categorized insert menu** (Text · Tables · Lists · Callout boxes · Interactive · Media · Charts · Diagrams) with icon + name + `/command` per item | one flat grid | 🟥 categories + search |
| **Slash commands** — type `/` in a block to insert (`/table`, `/note`, `/h1`) | none | 🟥 slash menu |
| **"Add image / Add table / Add more blocks" chips** on an empty/selected block | drag-from-palette only | 🟥 in-context insert chips |
| Drag-from-palette | 🟩 (with live skeleton previews + drop-targets) | — |

**Build:** a `Palette` with categories + a search field (cheap), then a slash-menu (reuses the same
registry + the insert ops), then in-canvas "+ add block" chips.

---

## 3. In-canvas editing affordances 🟥
Gamma edits mostly *on the canvas*; we lean on the right-panel inspector.

| Gamma | Galleo now | Gap |
|---|---|---|
| **Floating block toolbar** — "Type / to add blocks…", per-block `⋮` drag handle + `⋯` menu | selection overlay + inspector | 🟥 per-block hover toolbar + handle |
| **Between-section controls** — hover a gap → `+` add section · `✦` AI · `⊞` layout | none | 🟥 inter-section insert/AI/layout |
| **Per-section toolbar** — `⋮` · comment · `✦` AI · `+` (floating on the section) | none | 🟥 section toolbar |
| **Inline column/card `+`** — add a cell/column from the canvas edge | empty cells show "+ drop element" | 🟧 click-to-add (not just drop) |
| **Inline text formatting bar** (bold/italic/link/color on selection) | inline edit exists; no format bar | 🟥 selection format toolbar (P5 follow-on) |
| Selection / nested selection / drag-drop / inline text edit | 🟩 | — |

---

## 4. Element catalog breadth 🟧
We have 14 (Wave 1–2); Gamma's Basic-blocks + Smart-diagrams menus alone show dozens.

| Gamma group | Galleo now | Gap |
|---|---|---|
| Text: Title · H1–H4 · Blockquote · **Label** | text (10 styles) · quote · badge | 🟧 todo: Label as its own block (we have badge) |
| **Tables**: 2×2 · 3×3 · 4×4 | — | 🟥 table element + data editor (Wave 3) |
| Lists: Bulleted · Numbered · **Todo** | List (dot/number/dash/check) | 🟧 todo/checkbox interactivity |
| **Callout boxes**: note · info · warning · caution · success · question | callout (note/tip/warn) | 🟧 add info/success/question + icons |
| **Smart diagrams** (~30: funnel · pyramid · venn · cycle · timeline · road · gears · orbit…) | — | 🟥 diagram family (surface elements via DrawCtx) |
| Charts | chart (bar/line/pie) | 🟧 more chart types + legends/labels |
| Media: image · **video** · **embed/iframe** · gallery | image | 🟥 video · embed (need `fallback`) |
| Interactive: buttons · forms · toggles · etc. | button | 🟥 the interactive family |

---

## 5. AI / Agent 🟥
| Gamma | Galleo now | Gap |
|---|---|---|
| **Agent** (chat to generate/edit the whole doc, with model dropdown) | `✦ Generate` button (not wired) | 🟥 agent generate + chat-edit |
| **Per-block / per-section AI** (`✦` on sections, "rewrite", "make a diagram") | none | 🟥 inline AI actions |
| Outline-first generation from a prompt | none | 🟥 prompt → outline → artifact |

(Arc C P10 in the plan.)

---

## 6. Present / Share / Export / Account 🟥
| Gamma | Galleo now | Gap |
|---|---|---|
| **Present** (with modes ▾) | button (not wired) | 🟥 present mode (paginate → fullscreen) |
| **Share** (publish URL, permissions) | button (not wired) | 🟥 publish + sharing |
| Export (PDF/PPTX/PNG) | none | 🟥 export |
| Upgrade / account / billing | none | 🟥 accounts (Arc C P9) |

(Format-as-view = Arc B P7; persistence/accounts = Arc C P9.)

---

## 7. Chrome & navigation 🟧
| Gamma | Galleo now | Gap |
|---|---|---|
| Editable doc **title** + breadcrumb | doc switcher dropdown (demo) | 🟧 editable title |
| Left rail **thumbnail ⇄ outline** toggle | live thumbnail minimap | 🟧 outline/list view |
| **+ New section** button (with templates ▾) | none | 🟥 add-section button |
| Collapse/close the rail | always-on | 🟧 collapsible panels |
| `⋯` overflow, avatar, help `?` | none | 🟧 |
| Theme picker | 🟩 22 themes (chrome follows theme) | — |

---

## Recommended order to close the *visual* gap fastest
1. **Section backgrounds + full-bleed (§1)** — biggest "looks like Gamma" win; mostly compose/paint.
2. **In-canvas affordances (§3)** — section toolbar, between-section `+`, hover block handle.
3. **Insert UX (§2)** — categories + search in the palette, then a slash menu.
4. **Catalog breadth (§4)** — tables (Wave 3), diagrams (surface family, Wave 2 cont.), callout
   variants, video/embed.
5. **Present/Export (§6 / P7)**, then **AI/Agent (§5 / P10)**, then **accounts/share (P9)**.

The engine, theming, selection/drag-drop, inspector, and inline text editing are **on par or ahead**
of what a clone needs — the gaps are the **section/background model**, the **insert UX**, **in-canvas
chrome**, and **catalog breadth + AI**.
