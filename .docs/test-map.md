# test-map.md — minimal-mock test map for the rest of the codebase

Companion to `.docs/testing.md` (the canvas plan, now landed at ~71%). This is a codebase-wide inventory of
what we can cover with **the same minimal-mocking discipline** — fake only true external oracles, run
everything else for real — organized by _how much has to be faked_ (the seam budget), so the cheapest,
highest-confidence wins float to the top. `canvas/` is done and omitted.

## The seam budget (all we're ever allowed to fake)

| Layer                          | Legit seams (the only fakes)                                        | Everything else runs real                     |
| ------------------------------ | ------------------------------------------------------------------- | --------------------------------------------- |
| `model/`                       | **one** — the module-level custom-theme registry (`registerThemes`) | all color/text/pricing/protocol math          |
| `services/` (logic)            | none — prompts/schema/quality/pure helpers                          | real registries, real `@themes`, real `zod`   |
| `services/` (routes)           | **DB** (throwaway Postgres) + **auth** cookie                       | validation, gating, shaping, real SQL         |
| `services/` (AI runtime)       | **LLM** (fake the `ai` SDK) + clock/env/network                     | the reducers, repair loop, id/query logic     |
| `editor/` (logic)              | none — drop-target math, data round-trips                           | real `@elements` ops, real `applyPatch`       |
| `editor/` (store + AI)         | **clock** (coalesce) + **injected transports**                      | history, selection, commit reducers           |
| `app/`                         | **fetch** · **localStorage** · **clock**                            | URL/body building, response mapping, derivers |
| `ui`/`editor`/`app` components | **Solid render** (new project)                                      | prop→class, keyboard, open/close logic        |

Zero clock/random/crypto hides anywhere in `model/`. The backend's `Date.now`/`crypto.randomUUID` are all in
named spots (credit rollover, lockout, slug/id gen) — each a clean clock/random seam.

---

## Tier A — PURE (zero mocks). The bulk of the confident, cheap coverage.

### `model/` — the goldmine (~3,400 LOC, almost all pure; only `section.ts` is done)

- **`theme.ts` color math** — `hexToRgb`, `luminance`, `relLuminance`, `contrastRatio` (`("#000","#fff")===21`), `mix`/`mixWhite`/`hexA`, `hexToOklch`↔`oklchToHex` (round-trip), `fontStack`. **HIGH.**
- **`theme.ts` derivation** — `themeCssVars` (the `--radius-*` scale from `t.radius`), **`finalizeTheme`** (the AI-theme safety pass: accent chroma clamp, `onAccent` by contrast, legibility floors — assert `contrastRatio(ink,surface) ≥ 5.5` etc.). **HIGH.** `THEME_LIST`/`THEMES` drift + contrast property test. **MED.**
- **`text.ts`** — `toRuns` (marks→runs, concat===text, later-mark-wins), `normalizeMarks`, `applyMark`/`removeMark`/`toggleMark` (split straddling marks), **`spliceText`** (the AI rewrite primitive: re-map marks across an edit), `activeMarks`, `comparePoints`/`orderedPoints`/`offsetRange`. **HIGH** — 100% pure, the rich-text correctness core.
- **`ai.ts` `applyPatch`** — the immutable AI-edit reducer (per-op: `addSection` front/append/dedupe, `setMeta` null→undefined, `replaceElement` null→remove, immutability). **HIGH.** Plus `LAYOUTS`/`ELEMENTS`/`isEmittableType` structural guards.
- **`credits.ts`** — `costOf` (`{}` floors to 1), `mergeUsage`, `describeUsage`. **HIGH.**
- **`features.ts` `resolveFeatures`** — the killer invariant: **launch status overrules the plan** (a `premium` plan's `analytics:true` still resolves `false` because it's `"planned"`; an override can't enable a planned feature). Plus `withinLimit` (unlimited=-1). **HIGH.**
- **`billing.ts`** — `planFor` (null/bogus→free), `priceFor` (year→annual), `limitsFor`, `isPerSeat`. **HIGH/MED.**
- **`tools.ts`** — `estimateUsage`/`estimateCost`/`typicalCost` (`generate-artifact`→42), `sectionsForLength`, `toolsFor`, `costRange`. **HIGH.**
- **`target.ts`** — `parseTarget`∘`regionId` **round-trip**, `specificity` (deepest wins), `parentTarget` (Esc walk-up). **HIGH** — the editor's whole click/Esc/selection resolution, currently untested.
- **`authoring.ts`** `img`/`split`/`bgImage`; **`geometry.ts`** `fit/grow/percent/fixed` (untested at model layer). **MED/LOW.**
- Drift-guards only: `elements.ts`, `media.ts` const tuples. `artifact.ts`/`workspace.ts` = types, nothing to test.

### `services/` — prompts + pure helpers (~all import-clean of the DB)

- **`ai/prompts/*` builders** (pure string assembly): `system.ts` (`briefContext`, `artifactDigest`, `artifactSpine`, `neighbors`, `insertionContext`, `stack`), `generate.ts` (`outlineParts`, `sectionParts`, `blockLine`, `placement`, `surfaceOf`, `editSectionParts`, `reviseElementParts`), **`chat.ts` `chatSystem`** (the library-vs-editor branch — the "don't promise section edits with no doc" guarantee), `catalog.ts` `elementCatalog` (drift guard — a block per `ELEMENTS` entry), `arcs.ts` **`chooseArc`** (goal→arc classifier), `rubric.ts` `lengthGuidance`, `theme.ts` (font allow-list), `persona.ts` `surfaceVoice`, `exemplars.ts`, image/rewrite/text/edit/translate parts. **HIGH** — highest coverage-per-line in the repo.
- **`ai/schema.ts`** — `zSection`/`zElement`/`zOutline`/`zSectionPlan`/`zTheme` `.safeParse` (recursive children, `zSectionPlan` must reject `id`, open `data` record). **HIGH.**
- **`ai/quality.ts` `checkSection`** — the deterministic quality gate (empty-region count, no-headline, placeholder regex, too-sparse-slide). **HIGH** — pure, branchy, self-contained.
- **`ai/run.ts` pure bits** — `extractJson` (fence/prose stripping), `newSectionId` (deterministic, no RNG), `extractArtifactText`, `toQuery` (phrase→stock query), `slug`, `orientOf`. **HIGH.**
- **`ai/tools/structure.ts`** — `reorder`/`remove`/`set-format`/`set-theme` deterministic patch producers (`set-theme` throws on unknown id). Plus `tools/manage.ts`, `tools/library.ts` `findTemplatesTool`, `tools/registry.ts`. **HIGH/MED.**
- **`ai/chat.ts`** — `createChannel` (async push/close/drain primitive), `firstText`. **`ai/text.ts` `clean`** (quote/fence stripping, 4 quadrants). **`ai/provider.ts` `thinklessOpts`** (Google-non-pro tier gate — recently regressed). **HIGH.**
- **`ai/models.ts`** — `getModel`/`MODELS_BY_ID`/`defaultModelFor` as **invariants over the list** (every `DEFAULT_MODELS` id resolves; no dup ids) so the churning model list can't break them. **MED.**
- **Pure route helpers** (need a dummy `DATABASE_URL` because the file imports `schema.ts`, or extract): `api/artifacts.ts` `coverOf`/`sectionsSummary`, `api/links.ts` `cleanEmails`/`passwordFor`/`publicUrl`, `api/ai.ts` `meterFor`, `api/media.ts` `toItem`/`STORED_URL`, `api/workspace-reader.ts` `isUuid`, `api/billing.ts` `activeStatus`/`/spend` cost-precedence, `api/folders.ts` descendant-collection closure. **HIGH/MED.**
- **Sub-providers** (pure bits): `media/providers.ts` `orient`/`openverseKind`/`searchStock` dispatch, `media/generate.ts` **`dims`**/**`extractImage`**, `billing/stripe.ts` `priceIdFor`/`planForPrice`/`intervalForPrice` (env), `mail/send.ts` `escapeHtml` + subject/HTML composition. **HIGH/MED.**
- **Static-content conformance** — every `templates/*` + `demos/*` artifact validates under `zSection`, unique section ids, resolvable theme/format. **MED** (guards a broken demo shipping silently).
- **Eval** — `agent-eval.ts` `score` (the grader rubric, pure given a fake env), `kit.ts` `pool` (bounded concurrency). **MED.**

### `editor/` — pure logic buried in components (extractable, high-value)

- **`canvas/dnd.ts`** — **`computeDropTarget`**/`applyDrop`/`previewDrop` + internals `gapIndex`/`columnDropZone`/`sectionGapZone`/`elementsUnder`/`adjustAfterRemoval`/`adjustAfterInsert`/`moveInto`. Drive with a hand-built `Region[]` + real `ArtifactContent`, **zero mocks**. **HIGH** — the historically buggy drag/drop math (insertion index, drop-out→new-section, move-path arithmetic, preview===apply).
- **`inspect/data-model.ts`** — `parseModel`↔`serializeModel` **round-trip** across 8 shapes, `dataShapeFor` (funnel chart-vs-diagram), `invalidNumber`/`itemLimit`. **HIGH.**
- **`ai/suggest.ts` `suggestSections`** — deterministic gap-analysis ranking. **`ai/element-gen.ts` `regenTarget`** — climb out of coupled parents. **HIGH.**
- **`select/handles.tsx`** — `applyLiveEdit` (the real resize op), `siblingDividers` (which sets are resizable). **HIGH.**

### `app/` + `publish/` + `ui/` — pure helpers

- **`app/stores/library.ts`** — `artifactTitle`/`firstTextOf`/`clipTitle`, `formatLabel` family, `blankArtifact`. **HIGH.**
- **`app/stores/folders.ts` `hexToHsl`**, **`app/theme.ts` `toTheme`**, **`app/stores/chat.ts`** `firstText`/`needsConfirm`/`isRouting`, **`app/stores/generate.ts`** `placedSections`/`doneBeats` derivers. **HIGH/MED.**
- **Views (in-component pure closures worth extracting):** `ThemeEditor` `shadowCss`↔`inferShadow` round-trip, `GenerateModal` `stepIndex`/`frameWidth`, `ShareModal` `isEmail`, `theme-demo` `themeDemo`, `PricingView` `usagePct`/`perMonth`/`pick`/`ctaLabel`. **MED.**
- **`publish/PublicView` `viewLabel`.** **HIGH** (trivial).
- **`ui/` safe-now** (no render): `color.tsx` `isHex`/`textColorSwatches`/`highlightSwatches`, `z.ts` `Z` ordering, `section.tsx` `backdropHostStyle`, `icons.tsx` `ICON_NAMES`. **HIGH/MED.**

---

## Tier B — one clean seam (clock · env · storage · fetch · injected transport · registry)

- **`app/api.ts`** — the entire HTTP client behind **one `fetch` seam**: `req` (prefix `/api`, JSON, `ApiError` shaping), ~50 typed methods (path/query/body + response unwrap), `getPublicContent` (the rich gate-mapping), `streamTurn` (SSE frame parsing, skips malformed). **HIGHEST coverage-per-mock in the app.**
- **`model/theme.ts`** `resolveTheme`/`registerThemes` (reset the `CUSTOM` map in `afterEach`).
- **`services/auth.ts`** — `hashPassword`/`verifyPassword` (pure crypto round-trip), `makeSession`/`readSession` (set `SESSION_SECRET` first; tamper→null). **HIGH** — the seam every route trusts.
- **`app/` stores** — `theme.ts` `readCustomCache` (localStorage guard), `library.ts` `relativeTime` (clock) + optimistic mutators (fetch), `features`/`billing` readers, `generate.ts` **`dispatch`** reducer (Solid root, assert fixture-order placement), `publish/PublicView` **`load()`** status→state machine (fake `api`).
- **`editor/editor.ts` store** — `commit`/`undo`/`redo`/`commitOver`/`moveSectionTo`/theme-preview under `createRoot`, resetting via `loadArtifactContent` (clock seam only on coalesce). **HIGH.**
- **`editor/` AI flows** — `regenerateElement`, `runSectionGen`, text-assist `run*`, `suggest.ts` `fetchSuggestions`: inject a fake transport (`onReviseElement`/`onSectionStream`/`onTextAssist`) + control the clock; everything downstream (ops, `applyPatch`) real.
- **`editor/text/text-editor.tsx`** — `renderMarks`↔`readMarks` round-trip (happy-dom; DOM is the seam) + pure `descriptor`/`parseDesc`/`mergeMarks`. **HIGH** (rich-text serialization — the exact-text bug surface).
- **`services`** — `links.ts` `pwLocked`/`pwFail` brute-force guard (clock), `provider.ts` `providerReady`/`aiReady`/`resolveModel` (env), `billing/stripe.ts` env price mappings, `media/providers.ts` `stockReady` (env).

---

## Tier C — DB-seam integration (a throwaway Postgres + `seed.ts` fixture + `makeSession` cookie, driven via `app.request`)

The route policies worth the DB seam (validation/gating/shaping + real SQL, no LLM needed — assert the branches _before_ the model call):

- **`api/ai.ts`** — the **credit gate** (402 with `remaining` when `used+cost>limit`) + per-kind validation (400) + `501`/`503`.
- **`api/links.ts`** — publish **version-reuse** (reuse vs snapshot on content change) + the unauthenticated **`GET /p/:slug/content`** access policy (404-never-reveal, downgrade deactivates links, protected 401/429 lockout, private `?k=` token). The marquee surface.
- **`api/artifacts.ts`** — plan **artifact cap** (402 `upgrade`), `updatedAt` bumped only on real edits (not a folder move).
- **`api/context.ts` `currentWorkspace`** — lazy monthly **credit-window rollover** (clock seam: set `creditsResetAt` in the past → reset).
- **`api/session.ts`** login (email normalize + verify + cookie), `api/folders.ts` delete-cascade.

_Infra note:_ no `pg-mem`/`testcontainers` dep yet; `schema.ts` uses `uuid()/jsonb/bigint/partial-unique`, so a **real throwaway Postgres** (the existing `docker-compose.yml`) beats an in-memory shim. `schema.ts` throws at import without `DATABASE_URL`.

---

## Tier D — LLM-seam (fake the `ai` SDK via `vi.mock("ai", …)`)

There's no DI hook; the seam is the module boundary. Faking `generateObject`/`generateText`/`streamText`/`ToolLoopAgent` lets the **real reducers** run:

- **`run.ts` `writeSectionFrom`** — the auto-repair loop (bad-JSON→retry, `checkSection` trips→retry, throw after 2 fails). Composes real `extractJson`+`zSection`+`checkSection`.
- **`run.ts` `runGenerate`** — assert the exact `TurnEvent` sequence (intake→outline→plan→build→per-beat status/patch→cover injects a background→done).
- `run.ts` `reviseElement`/`chatEditSection`, `chat.ts` `runChat` toolset assembly. The one place to prove "fake stream → correct ops/state."

---

## Tier E — Solid component track (new project: `@solidjs/testing-library` + happy-dom + `vite-plugin-solid`)

Prerequisite: the current `vitest.config.ts` `include` is `**/*.test.ts` (excludes `.test.tsx`); a component project adds the Solid transform + a `.tsx` glob. **`ui/` render tests wait for the in-flight refactor to settle.**

- **`ui/`** (post-refactor) — `Button`/`IconButton`/`Chip`/`Badge` variant→class maps, `Dropdown` keyboard nav, `Modal` escape/focus, `Popover` flip/clamp geometry, `PresentSurface` `locate`/nav, inputs onChange contract, `Meter` clamp.
- **`editor/`** — `Canvas` keyboard map + Esc-walk + sticky-drop-target, `format-bar` `pos`/`canAlign` slack math, `Panel` `elementInline`, `insert` `itemsFor`.
- **`app/`** — `PricingView` label/price/pick branching, view interaction logic.

---

## Recommended order + the two infra prerequisites

1. **Tier A, no new infra** — `model/` (→~90% on its own), `services/ai/prompts` + `schema` + `quality` + pure helpers, `editor/dnd.ts` + `data-model.ts`, `app/api.ts` (Tier B fetch) + pure store helpers, `ui/` safe-now helpers. This is the largest, highest-confidence block and needs nothing but Vitest.
2. **Tier B one-seam** — auth, editor store (`createRoot`), app stores, publish gate machine, text-editor round-trip.
3. **DB-seam harness** (Tier C) — wire a test Postgres (docker-compose) + `seed.ts` fixture + an `app.request` helper with a `makeSession` cookie; then the route-policy tests.
4. **LLM-seam pattern** (Tier D) — a `vi.mock("ai")` helper; then the generation reducers.
5. **Component project** (Tier E) — add `@solidjs/testing-library` + a second Vitest project; `editor`/`app` component logic first, `ui/` once its refactor lands.

**Infra to add (only two):** a **test-Postgres harness** (compose + `DATABASE_URL` + `app.request` wrapper) for Tier C, and a **Solid component Vitest project** (solid plugin + happy-dom + `.test.tsx` glob) for Tier E. Everything in Tiers A–B, and the mock-`ai` of Tier D, runs on the Vitest setup that already exists.
