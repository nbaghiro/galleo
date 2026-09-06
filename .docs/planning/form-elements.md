# Planning — form elements: real inputs on a published page

> A published site that cannot ask its reader anything is a brochure. This plan adds forms — a
> contact form, a signup, an RSVP, a poll — as first-class elements: authored in the editor like
> any element, painted by the engine like any element, and mounted as real inputs on publish, with
> submissions stored for the workspace. **Status: built 2026-09-06.** Deviations: the palette gained `field` beside the five variants
> (six entries, so an author can add fields to any form); the honeypot travels as `_hp` in the
> body rather than a hidden form name; the responses view is a collapsible section in the Share
> modal rather than a tab, with client-side CSV; the choice/checkbox overlay positions native
> controls over the painted 18px marks (found from the element's own commands) instead of
> covering the block. Open questions resolved as proposed: publishing is the consent, polls
> store like any form, and the 10k cap guards the table.

## The load-bearing decision: zero engine changes

The engine never learns what an `<input>` is. Every part of a form rides a seam that already
exists, which is what keeps the engine clean and generic:

- **Static look**: a field is ordinary paint — a text leaf for the label, a bordered rect for the
  box, muted placeholder text inside it. The editor, PDF, PNG, and PPTX all show exactly this,
  the way `link` degrades on PNG by decision.
- **Sub-element geometry**: the field's arrange gives its input-box node an `input:`-prefixed id,
  joining the established region-id family (`el:` selection, `hit:` affordances, `datum:` marks,
  `label:` inline-edit overlays). The engine emits it as a region like any other; nothing new.
- **Real inputs**: the form element is `tier: "interactive"`, so the existing LiveLayer mounts a
  Solid component over it on playback surfaces — the same machinery that already mounts video
  players, embeds, and popup panels. The live component finds its fields' `input:` regions and
  absolutely positions one real `<input>`/`<textarea>`/`<select>` over each painted box, themed
  from tokens. One layout source (the engine); the overlay swaps only the interactive rectangles.
- **The wire**: `POST /p/:slug/submit` beside the existing unauthenticated `POST /p/:slug/ping` in
  `services/api/links.ts`, behind the same password gate and the existing `rateLimit` helper.

## The elements

**`field`** — one input primitive, kind-switched the way `media` switches photo/icon/video.
`data: { kind: "text" | "email" | "phone" | "textarea" | "select" | "checkbox" | "choice",
label, placeholder?, required?, options? }` (`options` for select/choice, newline-split like
diagram items). Kinds live as a value-set in `model/elements.ts`. Paint per kind: label leaf +
bordered box (text/email/phone), taller box (textarea), box + chevron glyph (select), square +
label beside (checkbox), stacked circles + labels (choice). Controls: kind, label, placeholder,
required toggle, options textarea. `labelFor` names it by kind in the panel.

**`form`** — an open container (the `container` pattern, not the sealed composite one): children
are fields plus anything else an author drops in (a heading, a paragraph), reorderable and
removable like any container's. Own data: `{ submitLabel, success }` — the form paints its own
submit button (button-element styling shared via the existing SIZES math) and shows `success` in
place after a real submission. `tier: "interactive"`.

**Variations** follow the chart-variant factory precedent (`chartSpec`): `formSpec(key, label,
fields)` registers the palette entries — Contact, Signup, RSVP, Poll, Feedback — each just a
different `create()` seeding of the same behavior. A new `form` palette category groups them
(palette, AGENTS.md tally, and `check:elements` all move together, as they did when media merged).

## Surface behavior

- **Editor**: fields are static paint; selection, drag, inspector as for any element. The live
  overlay stays inert in the editor (the `live()` selected-only convention), so clicking a field
  selects it rather than focusing a ghost input. Field text edits happen in the inspector (v1; a
  `label:` inline seam can come later).
- **Publish**: real inputs. Submit validates `required` client-side, POSTs, swaps to the success
  message. Password-gated links gate submissions identically.
- **Present**: static paint, deliberately — a presenter's surface has no audience to collect
  from, the same reasoning that keeps notes off publish.
- **Export**: the static look, always.

## Submissions

- `form_submissions` table: id, artifactId (FK, cascade — deleting the artifact deletes what it
  collected), elementId (the form's stamped id), payload jsonb (label → value), createdAt.
- `POST /p/:slug/submit`: zod body (string values, per-field and total size caps), the slug's
  password gate, `rateLimit` per slug, honeypot field dropped server-side. Stores and answers
  201; the server emits `form_submitted` (artifact id, field count — never values), the seam the
  client cannot be trusted to reach.
- **Reading them**: a "Responses" tab in the artifact's Share modal — a list, newest first, plus
  CSV download. Workspace-gated at `view`. This is its own phase and the most cuttable one; the
  storage and wire land regardless so no submission is ever lost while the UI catches up.

## AI catalog

`form` and `field` join the catalog with `when` guidance pointed at the `site` surface (a contact
or signup section); the schema teaches the kinds enum. The outline prompt is not touched — a form
is a section the writer reaches for, not a beat role. `check:elements` guards reachability and
that every default instance paints its text, as it now does for everything.

## Phases

1. **Model + field element** (M): kinds value-set, `field` spec with paint per kind, controls,
   `check:elements` green, per-kind paint pins in a new `canvas/elements/__tests__/form.test.ts`.
2. **Form element + palette** (M): the open container, submit-button paint, `formSpec` variants,
   palette category, tally updates.
3. **Live overlay** (M): `registerLive("form", ...)` positioning inputs over `input:` regions,
   themed, submit flow with success swap; inert in editor; fine on present but rendered static.
4. **Backend** (S-M): table + migration, `/p/:slug/submit`, gates, caps, `form_submitted` event,
   itests in `links.itest.ts`'s file.
5. **Responses UI** (M): Share-modal tab + CSV, workspace-gated route, itest.
6. **AI catalog + docs** (S): catalog entries, `rendering.md` element table, `analytics.md`
   event, this doc's status.

Each phase lands green through the full gate set; `eval:shots` runs after phases 1-2 (new paint,
no geometry moved elsewhere) and the corpus must not change, since no corpus piece gains a form.

## Not taken, and why

Engine-level input nodes (the engine stays paint-only; interactivity is the overlay's job, as it
already is for video and popups). File-upload fields (asset storage, virus surface, and quota
questions — its own doc if ever). Email notification per submission (v1 is the stored list;
notification is policy that deserves its own decision). Captcha (rate limit + honeypot first;
escalate only if abuse shows up). Per-viewer draft persistence (inputs are DOM state; a half-typed
form on a reloaded page starts over, like every plain website form).

## Open questions

1. Does `publishPolicy` grow a "collect submissions" toggle, or is a published form always live?
   Proposal: always live in v1 — publishing the page is the consent, and the policy already gates
   who can publish.
2. Poll variant: results shown to viewers? V1 stores like any form and shows the success message;
   live tallies are viewer-state machinery worth its own pass.
3. Retention: submissions live until the artifact dies. A cap per artifact (say 10k) guards the
   table; is that enough for v1?
