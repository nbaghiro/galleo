# Flexible element placement — plan (2026-06-27)

Goal: **drop any element anywhere in a section, and the block extends to hold it** — top/bottom/left/
right of existing content, into nested containers, or into a new section. This needs a richer layout
model than today's fixed grid templates.

---

## 1. How it works today (and why drops feel limited)

**Model.** `Section { grid, cells }`. `grid` is one of **5 fixed templates** (`full`, `split-6040`,
`split-4060`, `two-col`, `three-up`) defined as per-cell width specs (`templates.ts`). Each **cell**
holds **one** element; dropping a second element auto-wraps the cell in a **`group`** (a col/row
container). So the real structure is: section → fixed cells (a row) → one element or a group-stack.

**Element config.** Every element is an `ElementSpec.layout(data, ctx) → EngineNode`, almost always
`w: grow(), h: fit()`. **Elements have no per-instance layout** — no width, no self-alignment. They
stretch to the cell/group width. `group` is the only element with layout controls (direction, gap).

**Drop (`dnd.ts`).** `cellAt` finds the cell under the cursor → `cellItems` lists its top-level items
→ `computeDropTarget` returns **`place`** (empty cell) or **`insert`** (a vertical index by Y-midpoint).
`applyDrop` does `setCellElement` or `insertInCell` (auto-group). `DropIndicator` draws a cell ring or
a **horizontal** line.

**The limits this creates:**
1. Drops are **cell-scoped and vertical-only** — no left/right, no new column/row on the fly.
2. **Fixed 5 templates** — can't add a 4th column, split a cell, or build arbitrary layouts.
3. **No element sizing/alignment** — in a row you can't control widths or align a single item.
4. **Coarse indicators** — cell ring + horizontal line only.
5. **"Anywhere" isn't possible** — you're confined to the predefined cells.

---

## 2. Target model — a flexible flow-tree per section

Keep the **Clay flow engine** (blocks extend naturally; no absolute positioning) and the existing
**container contract** (`children` / `arrange` / `withChildren`). Evolve the cell from "one element"
to a **content tree** of nestable **stack (column)** and **row** containers + leaf elements:

```
section
└─ root stack (col)
   ├─ row ─ [ text(60%) | image(40%) ]
   ├─ heading
   └─ row ─ [ stat | stat | stat ]
```

You **build it by dropping**:
- drop on an element's **top/bottom** edge → insert before/after in its parent **column**
- drop on its **left/right** edge → **split into a row** (wrap that element + the new one)
- drop into a container's **empty area** → append
- drop in a **section gap** → new section (already have `addSectionAfter`)

The block reflows + extends — exactly the engine's job. **Grid templates become presets** that *seed*
the tree (e.g. `split-6040` = a row of two columns 60/40); after that, layout is freeform.

---

## 3. The pieces to build

### 3a. Per-element layout (the "more layout options")
Add a universal, optional layout to each instance — `ElementInstance { type, data, layout? }`:

```ts
interface ElementLayout {
    width?: "fit" | "fill" | { pct: number };   // fit content · grow · % of row
    align?: "start" | "center" | "end";          // self cross-axis alignment
    // later: minW/maxW, grow weight
}
```

`compose` applies it to the element's root node (`w` + a new engine **`alignSelf`**). The inspector
gains a **"Layout"** group shown for *every* element (Width segmented Fit/Fill/%, Align). → This is
what lets a row hold a 60/40 split, a centered button, etc.

> Engine change: add `alignSelf?` to `EngineNode` (per-child cross-axis), used when a parent lays out
> a row/col. Small addition to the position pass.

### 3b. Generalized container
`group` already does row/col + gap. Extend container controls with **align** (main/cross) +
**distribute** (start/center/space-between) and make it the workhorse the drop ops create. A section's
cell content becomes a root `group(col)`; rows are nested `group(row)`s.

### 3c. Edge-based drop targeting
Replace `computeDropTarget` with element-relative hit detection:
- find the deepest **element/container region** under the cursor
- compute the cursor's zone within its box: **top / bottom** (col insert), **left / right** (row
  split), **center** (into container / replace-empty)
- produce a **path-based target**: `{ section, cell, path[], side: "before"|"after"|"left"|"right"|"in" }`

### 3d. Tree-insertion ops
New pure ops in `ops.ts`:
- `insertAtPath(art, addr, side, element)` — insert before/after a node in its parent column
- `splitIntoRow(art, addr, side, element)` — wrap target + new element in a row container
- `unwrapSingle` — collapse a row/col left with one child (keep the tree tidy)
- generalize the existing `insertInCell` to delegate to these

### 3e. Indicators
`DropIndicator` gains: **horizontal line** (col insert), **vertical line** (row split), **ring**
(into container / empty). Driven by the new target's `side`.

### 3f. Move / reorder
The existing `move` payload routes through the same path ops, so dragging an existing element to any
edge re-parents it (with the same-position-shift guard already in `applyDrop`).

---

## 4. Phased build

| Phase | Deliverable | Why first |
|---|---|---|
| **A — Element layout** | `ElementInstance.layout` (width/align) + engine `alignSelf` + inspector "Layout" group | Foundational; immediately makes existing rows/groups controllable |
| **B — Container upgrade** | group align/distribute; cell content = root `group(col)`; templates seed the tree | Establishes the flexible tree the drops act on |
| **C — Edge drop** | element-relative targeting (top/bottom/left/right/in) + path target + indicators | The core "drop anywhere" UX |
| **D — Tree ops** | `insertAtPath` / `splitIntoRow` / `unwrapSingle`; rewire `applyDrop` | Makes C actually mutate the tree |
| **E — Polish** | reorder/move to any edge, nested DnD, auto-unwrap, keyboard, between-section drop | Robustness |

Phases A+B are safe, incremental, and useful on their own. C+D are the heart of the redesign (and the
riskiest — drop geometry + tree mutation). E is hardening.

---

## 5. Open decisions
1. **Templates: keep as presets or drop entirely?** Recommend **keep as quick-start presets** that
   seed the tree (familiar, fast), with full freeform editing on top.
2. **Row width model:** explicit per-child `width: %/fit/fill` (predictable) vs. flex-grow weights
   (auto). Recommend **explicit %/fit/fill** first (matches the inspector mental model).
3. **How deep can nesting go?** Cap at, say, 3 levels for sane UX, or allow arbitrary. Recommend a
   soft cap with auto-unwrap of redundant single-child containers.
4. **Empty-cell affordance:** keep the "+ drop element" placeholder, but extend it to "drop edges"
   highlighting on hover-with-drag.
