# Form elements: real inputs on a published page

> A published site that cannot ask its reader anything is a brochure. Forms — a contact form, a
> signup, an RSVP, a poll, a feedback form — are first-class elements: authored in the editor like
> any element, painted by the engine like any element, and mounted as real inputs on publish, with
> submissions stored for the workspace.

## The load-bearing decision: zero engine changes

The engine never learns what an `<input>` is. Every part of a form rides a seam that already
exists, which is what keeps the engine clean and generic:

- **Static look**: a field is ordinary paint — a text leaf for the label, a bordered rect for the
  box, muted placeholder text inside it. The editor, PDF, PNG, and PPTX all show exactly this,
  the way `link` degrades on PNG by decision.
- **Sub-element geometry**: the field's arrange gives its input-box node an `input:`-prefixed id,
  joining the established region-id family (`el:` selection, `hit:` affordances, `datum:` marks,
  `label:` inline-edit overlays). The engine emits it as a region like any other; nothing new.
- **Real inputs**: a form is `tier: "interactive"`, so the existing live layer (`ui/live.tsx`)
  mounts a Solid component over it — the same machinery that already mounts video players,
  embeds, and popup panels. `FormLive` lays the element out itself, finds the `input:` regions,
  and absolutely positions one real `<input>`/`<textarea>`/`<select>` over each painted box,
  themed from tokens. One layout source (the engine); the overlay swaps only the interactive
  rectangles. For checkbox and choice fields the native controls are positioned over the painted
  18px marks, found from the element's own paint commands, rather than covering the block.
- **The wire**: `POST /p/:slug/submit` beside the existing unauthenticated reads in
  `services/api/links.ts`, behind the same password gate and the shared `rateLimit` helper.

## The elements

**`field`** (`canvas/elements/form/element.ts`) — one input primitive, kind-switched the way
`media` switches photo/icon/video. `data: { kind, label, placeholder?, required?, options? }`,
with `options` for select/choice, newline-split like diagram items. The kinds live as the
`FORM_FIELDS` value-set in `model/elements.ts`: `text | email | phone | textarea | select |
checkbox | choice`. Paint per kind: label leaf + bordered box (text/email/phone), taller box
(textarea), box + chevron glyph (select), square + label beside (checkbox), stacked circles +
labels (choice). Its label edits in place (`inlineText: "label"`), the bar carries kind and the
required toggle, and the panel holds the remainder — Placeholder and Options, each shown only for
the kinds that use them. `labelFor` names it by kind in the panel.

**The forms** — five registered types minted by `formSpec` (the chart-variant factory precedent):
`contactForm`, `signupForm`, `rsvpForm`, `pollForm`, `feedbackForm`, each just a different seeding
of the same behavior. There is no separate bare `form` type; the variant is the element. Each is
an open container (a `container` facet with `children`/`arrange`/`withChildren`, not the sealed
composite pattern): children are fields plus anything else an author puts in, reorderable and
removable like any container's, and the panel's `Add field` action appends a text field. Own data
is `{ children, submitLabel, success }` — the form paints its own submit button, the label edits
in place (`inlineText: "submitLabel"`), and `success` shows in place after a real submission.
The palette's `form` category carries six entries: `field` beside the five variants, so an author
can add fields to any form.

## Surface behavior

- **Editor**: fields are static paint; selection, drag, inspector as for any element. The live
  overlay stays inert in the editor (pointer-events off unless selected), so clicking a field
  selects it rather than focusing a ghost input.
- **Publish**: real inputs. The live layer's host wires a `submit` callback only on publish
  (`publish/PublicView.tsx` → `publicApi.submitForm`), and `FormLive` renders its inputs only when
  that callback is wired. Submit validates `required` client-side, POSTs, and swaps to the
  success message. Password-gated links gate submissions identically.
- **Present**: static paint, deliberately — a presenter's surface has no audience to collect
  from, the same reasoning that keeps notes off publish. No `submit` is wired there, so the
  overlay renders nothing.
- **Export**: the static look, always.

## Submissions

- `form_submissions` table (`services/db/schema.ts`): id, artifactId (FK, cascade — deleting the
  artifact deletes what it collected), elementId (the form's stamped id), payload jsonb
  (label → value), createdAt, indexed by artifact and time.
- `POST /p/:slug/submit` (`services/api/links.ts`): the slug's `publicRead` password/token gate (a
  miss answers 404 and never reveals the slug), a zod body (`zSubmit`: string values with
  per-field caps, at most 24 entries kept), and `submitLimiter` (20/min). The honeypot travels as
  `_hp` in the body rather than a hidden form name.
- `recordSubmission` (`services/core/submissions.ts`) owns every decision — the honeypot drop, the
  per-artifact cap (`MAX_PER_ARTIFACT`, 10k, guarding the table), and the one server-side
  `form_submitted` event (`artifact_format`, `field_count` — never values) — so a second caller
  cannot skip any of them. A rejected submission answers 429.
- **Reading them**: `GET /artifacts/:id/submissions`, workspace-gated at `view`, feeds the
  Responses section of the artifact's Share modal (`app/components/ShareModal.tsx`) — a
  collapsible section rather than a tab, loaded on first expand, newest first, with a client-side
  CSV download.

## AI catalog

`field`, `contactForm`, and `signupForm` are in the catalog (`services/core/ai/prompts/catalog.ts`)
with `when` guidance pointed at the `site` surface, and the site-writing guidance teaches when a
section should be a form. The outline prompt is untouched — a form is a section the writer reaches
for, not a beat role. `check:elements` guards reachability and that every default instance paints
its text, as it does for everything.

Per-kind paint and behavior are pinned in `canvas/elements/__tests__/form.test.ts`; the wire and
gates in the links integration tests.

## Not taken, and why

Engine-level input nodes (the engine stays paint-only; interactivity is the overlay's job, as it
already is for video and popups). File-upload fields (asset storage, virus surface, and quota
questions — its own doc if ever). Email notification per submission (the stored list is the
product; notification is policy that deserves its own decision). Captcha (rate limit + honeypot
first; escalate only if abuse shows up). Per-viewer draft persistence (inputs are DOM state; a
half-typed form on a reloaded page starts over, like every plain website form).

## Settled

1. There is no "collect submissions" toggle on `publishPolicy`: a published form is always live.
   Publishing the page is the consent, and the policy already gates who can publish.
2. A poll stores like any form and shows the success message; live tallies shown to viewers are
   viewer-state machinery worth their own pass, not built.
3. Retention: submissions live until the artifact dies (the cascade FK), and the 10k per-artifact
   cap guards the table.
