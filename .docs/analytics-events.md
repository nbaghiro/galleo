# Galleo — Product analytics: the event contract

> The concrete list of events and properties we collect, why each one exists, and what we deliberately
> do not collect. This is the specification `.docs/prompts/09-product-analytics.md` implements against,
> and it is the authority on names and shapes: the prompt describes the wiring, this file describes the
> data. Companion docs: `onboarding.md` (whose first-session funnel is section 2 here), `workspaces.md`
> (plans, seats, the credit window), `ai.md` (the tool catalog and what a turn costs).

## Status

Not built. No event tracking exists in the product today beyond link and artifact view counts.

## The questions this has to answer

Every event below earns its place by serving one of these. An event that serves none of them should not
ship, and a question we cannot answer after this is built is a gap worth reporting.

1. **Activation.** What share of signups reach an artifact they exported or shared, and how long does it
   take them?
2. **The AI loop.** How many generations does an active workspace run, what share complete, and at which
   stage do the rest fall out?
3. **Unit cost.** What do credits and therefore dollars cost us per completed artifact, per plan? A credit
   is about $0.0142 of real provider spend, so this is the margin question and not a vanity metric.
4. **Friction.** Which wall do users hit most, an entitlement paywall or an exhausted credit balance, and
   what share of each converts?
5. **Feature adoption.** Of 58 palette elements, 22 themes, 3 formats, and 5 export targets, which are
   actually used and which are dead weight?
6. **Reliability.** Which tools and models fail, how often, and where do streams die?
7. **Retention.** Weekly active workspaces by plan, and whether artifacts per workspace grows.
8. **Onboarding.** The seven-step funnel in `onboarding.md`, step by step.

## Naming and typing conventions

Event names are `snake_case` on the wire and declared once in `model/analytics.ts`, so no call site
passes a bare string. Property names are `snake_case` too. Enums are the ones the code already has:
`Surface`, `PlanId`, `Interval`, `AiTask`, `ToolId`, `ToolSurface`, `WorkspaceRole`, `ArtifactAccess`,
element `category`. Reuse those types rather than restating their members, so a new format or a new tool
is a type error at the call site instead of a silent hole in the data.

Where magnitude matters but content must not travel, send a bucket rather than a raw size:
`chars_bucket` is one of `"0-100" | "100-500" | "500-2k" | "2k-10k" | "10k+"`. Structural counts
(sections, elements, beats, members) go as raw integers, because they are small, bounded, and carry no
content.

## Super properties, on every event

Set once and attached automatically, so no query needs a join to segment by tier or device.

| property            | type                               | why                                                                                 |
| ------------------- | ---------------------------------- | ----------------------------------------------------------------------------------- |
| `plan_id`           | `PlanId`                           | every question above slices by plan                                                 |
| `plan_interval`     | `Interval`                         | monthly and annual behave differently                                               |
| `workspace_role`    | `WorkspaceRole`                    | an owner's session is not a member's                                                |
| `credits_remaining` | number                             | lets us see behaviour near the wall, not just at it                                 |
| `device_tier`       | `"phone" \| "tablet" \| "desktop"` | from `@ui/viewport`; the editor is desktop-first and we should know what that costs |
| `app_build`         | string                             | the git sha, so a regression can be bounded to a deploy                             |

## Identify traits, on the person

Keyed by user id, never by email.

`signup_method` (`"password" | "google"`), `signup_at`, `email_verified`, `workspaces_owned`,
`workspaces_member_of`, `app_theme`.

## Group traits, on the workspace

Keyed by workspace id. The workspace is the billing entity and the credit pool, so it is the unit almost
every business question is really about.

`plan_id`, `plan_interval`, `seats_total`, `seats_used`, `member_count`, `artifact_count`, `created_at`,
`credits_balance`, `credits_granted_this_window`, `has_custom_theme`, `has_stripe_customer`,
`signup_grant_released`.

## 1. Account and session

| event                      | properties                                           |
| -------------------------- | ---------------------------------------------------- |
| `signed_up`                | `method`, `invited` (arrived through an invite link) |
| `email_verified`           | `hours_since_signup`                                 |
| `logged_in`                | `method`                                             |
| `logged_out`               |                                                      |
| `workspace_switched`       | `from_plan`, `to_plan`, `workspaces_available`       |
| `password_reset_requested` |                                                      |
| `password_changed`         |                                                      |

`hours_since_signup` on verification is what tells us whether gating the signup grant on verification
(see `onboarding.md`) delays the grant by minutes or by days, which decides whether that gate is
acceptable.

## 2. Onboarding

The seven events `onboarding.md` requires, plus the abandonment case it does not name.

| event                                   | properties                                                        |
| --------------------------------------- | ----------------------------------------------------------------- |
| `onboarding_format_chosen`              | `format`                                                          |
| `onboarding_starter_opened`             | `format`, `template_id`, `ms_since_signup`                        |
| `onboarding_starter_edited`             | `format`, `first_edit_kind`                                       |
| `onboarding_studio_opened`              | `from` (`"checklist" \| "library" \| "empty_state" \| "editor"`)  |
| `onboarding_first_generation_completed` | `format`, `section_count`, `credits_charged`, `ms_since_signup`   |
| `onboarding_checklist_step_done`        | `step` (`"make" \| "ai" \| "theme" \| "send"`), `ms_since_signup` |
| `onboarding_checklist_dismissed`        | `steps_done`                                                      |
| `onboarding_abandoned`                  | `last_step`, `ms_since_signup`                                    |

## 3. AI actions, one event shape for all 40 tools

`model/tools.ts` already types every AI action with a `ToolId`, a tier, its surfaces, and its pricing.
Forty separate event names would duplicate that catalog and then drift from it. Instead these three
events carry `tool_id`, which means cost per tool, latency per model, and failure rate per tool are all
one query, and a newly added tool is instrumented the moment its id exists.

| event                 | properties                                                                                                                                                      |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ai_action_started`   | `tool_id`, `task` (`AiTask`), `tool_surface` (`ToolSurface`), `model_id`, `estimated_credits`, `artifact_format?`                                               |
| `ai_action_completed` | `tool_id`, `task`, `model_id`, `credits_charged`, `ms`, `input_tokens`, `output_tokens`, `cached`                                                               |
| `ai_action_failed`    | `tool_id`, `task`, `model_id`, `ms`, `reason` (`"provider_error" \| "timeout" \| "no_credits" \| "invalid_output" \| "aborted" \| "rate_limited"`), `retryable` |

The natural hook is `services/core/ai/meter.ts`. Every model call already reports there through the
provider middleware, so instrumenting the meter measures new call sites by construction rather than by
somebody remembering. `credits_charged` should come from the settle in `services/core/spend.ts` and not
be recomputed, or the analytics and the ledger will disagree and the ledger is the one customers see.

## 4. The generation studio funnel

Whole-artifact generation is the product's central act and it is staged, so it gets its own funnel on top
of the `ai_action_*` events above. `Stage` is already
`"idle" | "intake" | "planning" | "outline" | "building" | "done" | "error"`.

| event                         | properties                                                                                            |
| ----------------------------- | ----------------------------------------------------------------------------------------------------- |
| `generation_intake_opened`    | `from`, `format`, `prefilled`                                                                         |
| `generation_context_attached` | `kind` (`"paste" \| "file" \| "artifact" \| "url"`), `count`, `chars_bucket`                          |
| `generation_planned`          | `format`, `length`, `beat_count`, `ms`, `model_id`, `credits_charged`                                 |
| `generation_outline_edited`   | `edit` (`"rename" \| "reorder" \| "add" \| "remove"`), `beat_count`                                   |
| `generation_build_started`    | `mode` (`"all" \| "one"`), `beat_count`                                                               |
| `generation_section_built`    | `index`, `beat_role`, `archetype`, `ms`, `credits_charged`, `element_count`                           |
| `generation_steered`          | `at_index`, `beat_count`                                                                              |
| `generation_paused`           | `at_index`                                                                                            |
| `generation_resumed`          | `at_index`                                                                                            |
| `generation_completed`        | `format`, `section_count`, `total_credits`, `total_ms`, `steer_count`, `was_paused`, `outline_edited` |
| `generation_abandoned`        | `stage`, `sections_built`, `ms`                                                                       |
| `generation_failed`           | `stage`, `reason`                                                                                     |

`beat_role` and `archetype` are worth the extra work. They are the eval system's own vocabulary, the six
roles (`scene`, `tension`, `turn`, `proof`, `momentum`, `close`) and the seven geometric archetypes
(`bleed`, `statement`, `split`, `grid`, `data`, `list`, `dense`) that `canvas/render/archetype.ts`
derives. Carrying them here is what lets us join product usage to output quality and ask whether the
sections users delete are the ones our own checks already flag.

`generation_abandoned` is the most important event in this section, because a funnel that only records
successes cannot tell us where we lose people.

## 5. Creation and the library

| event                 | properties                                                                                            |
| --------------------- | ----------------------------------------------------------------------------------------------------- |
| `artifact_created`    | `source` (`"template" \| "blank" \| "generated" \| "duplicated" \| "chat"`), `format`, `template_id?` |
| `artifact_opened`     | `format`, `section_count`, `age_days`, `access` (`ArtifactAccess`)                                    |
| `artifact_renamed`    |                                                                                                       |
| `artifact_moved`      | `to_folder`                                                                                           |
| `artifact_duplicated` | `format`, `section_count`                                                                             |
| `artifact_trashed`    | `format`, `age_days`, `section_count`                                                                 |
| `artifact_restored`   | `days_in_trash`                                                                                       |
| `artifact_deleted`    | `days_in_trash`                                                                                       |
| `trash_emptied`       | `count`                                                                                               |
| `folder_created`      |                                                                                                       |
| `folder_renamed`      |                                                                                                       |
| `folder_deleted`      | `artifact_count`                                                                                      |
| `library_searched`    | `result_count`, `query_length_bucket`, `via` (`"field" \| "palette"`), `clicked_position?`            |
| `template_previewed`  | `template_id`, `category`, `format`                                                                   |
| `template_used`       | `template_id`, `category`, `format`, `from`                                                           |

`artifact_trashed` carries `age_days` and `section_count` deliberately: an artifact trashed minutes after
generation is a quality signal, and one trashed after a month is ordinary housekeeping. Without those two
properties the event cannot distinguish them.

`library_searched` never carries the query. `result_count` and `clicked_position` answer whether search
works; the text would only answer what people search for, which is a content question we are not asking.

## 6. Editing depth

This section exists to answer whether people author in Galleo or only generate and leave, which is the
difference between a tool and a novelty.

| event                     | properties                                                                                                                                                      |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `element_added`           | `element_type`, `category` (`"text" \| "media" \| "table" \| "composite" \| "basic" \| "chart" \| "diagram"`), `how` (`"palette" \| "drag" \| "paste" \| "ai"`) |
| `element_removed`         | `element_type`, `category`                                                                                                                                      |
| `element_moved`           | `element_type`, `same_section`                                                                                                                                  |
| `element_resized`         | `element_type`, `kind` (`"height" \| "aspect"`)                                                                                                                 |
| `element_revised_with_ai` | `element_type`, `credits_charged`                                                                                                                               |
| `section_added`           | `how` (`"button" \| "ai" \| "template"`), `at_index`, `section_count`                                                                                           |
| `section_reordered`       | `from_index`, `to_index`                                                                                                                                        |
| `section_removed`         | `section_count_after`                                                                                                                                           |
| `section_duplicated`      |                                                                                                                                                                 |
| `section_layout_changed`  | `preset`                                                                                                                                                        |
| `text_edited`             | `element_type`, `chars_delta_bucket`                                                                                                                            |
| `theme_changed`           | `theme_id`, `from_theme_id`, `is_custom`                                                                                                                        |
| `custom_theme_created`    | `how` (`"editor" \| "ai"`), `based_on_theme_id`                                                                                                                 |
| `custom_theme_deleted`    |                                                                                                                                                                 |
| `background_set`          | `kind` (`"color" \| "gradient" \| "image"`)                                                                                                                     |
| `format_switched`         | `from`, `to`, `section_count`                                                                                                                                   |
| `editor_session_ended`    | `ms`, `format`, `section_count`, `edit_count`, `ai_action_count`, `saved`                                                                                       |

`editor_session_ended` is the depth roll-up. Individual edit events answer which features get used;
this one answers whether a session was a real working session or a glance, and it is the only place we
can see a session that produced no edits at all.

## 7. Output and distribution

Reaching an output is our activation definition, so this section is the denominator for question 1.

| event                     | properties                                                                                                               |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `exported`                | `export_format` (`"pdf" \| "png" \| "pptx" \| "slides" \| "print"`), `artifact_format`, `section_count`, `ms`, `branded` |
| `export_failed`           | `export_format`, `reason`, `section_count`                                                                               |
| `presented`               | `artifact_format`, `section_count`, `slides_advanced`, `ms`                                                              |
| `link_created`            | `visibility` (`"private" \| "protected" \| "public"`), `has_password`, `recipient_count`, `artifact_format`              |
| `link_updated`            | `visibility_from`, `visibility_to`, `has_password`                                                                       |
| `link_deleted`            | `view_count_at_delete`                                                                                                   |
| `link_recipients_added`   | `count`                                                                                                                  |
| `link_viewed`             | `visibility`, `by_owner`, `referrer_host`, `device_tier`, `is_first_view`                                                |
| `comment_created`         | `by_role`, `on_own_artifact`, `is_reply`                                                                                 |
| `comment_resolved`        | `hours_open`                                                                                                             |
| `artifact_access_changed` | `to` (`ArtifactAccess`)                                                                                                  |

`link_viewed` carries `referrer_host` and not the full referrer URL, because the host answers where
traffic comes from while the path can carry query strings we have no business storing. Note that link
views already increment the `visits` table; emit the event as well rather than reworking that counter,
and leave the existing behaviour alone.

## 8. Monetization and friction

| event                   | properties                                                                                                     |
| ----------------------- | -------------------------------------------------------------------------------------------------------------- |
| `paywall_hit`           | `feature` (the `BoolFeature` key), `plan_id`, `upgrade_offered`, `upgrade_target?`                             |
| `credits_exhausted`     | `plan_id`, `blocked_tool_id`, `upgrade_offered`, `topup_offered`, `credits_remaining`                          |
| `credit_balance_low`    | `credits_remaining`, `threshold`                                                                               |
| `pricing_viewed`        | `from` (`"paywall" \| "credits" \| "sidebar" \| "settings" \| "onboarding"`), `plan_id`                        |
| `checkout_started`      | `target_plan`, `interval`, `seats`, `addons`                                                                   |
| `checkout_completed`    | `plan_id`, `interval`, `seats`, `mrr_usd`                                                                      |
| `checkout_abandoned`    | `target_plan`, `ms_on_page`                                                                                    |
| `plan_changed`          | `from_plan`, `to_plan`, `from_interval`, `to_interval`, `direction` (`"upgrade" \| "downgrade" \| "interval"`) |
| `downgrade_scheduled`   | `from_plan`, `to_plan`, `effective_at`                                                                         |
| `downgrade_cancelled`   | `plan_id`                                                                                                      |
| `plan_cancelled`        | `plan_id`, `days_active`, `artifacts_created`                                                                  |
| `topup_purchased`       | `pack_id`, `credits`, `usd`                                                                                    |
| `seats_changed`         | `from`, `to`, `direction`                                                                                      |
| `billing_portal_opened` | `from`                                                                                                         |

`paywall_hit` and `credits_exhausted` are the two highest-value events in this whole document. They are
the only places the product tells a user no, and question 4 cannot be answered without them. Note they
are genuinely different walls: a paywall is an entitlement the plan lacks, and exhaustion is a budget
the plan has spent, and they convert differently. `credits_exhausted` carrying `blocked_tool_id` is what
tells us which action people were denied, which is the actionable half.

## 9. Collaboration and teams

| event                       | properties                                           |
| --------------------------- | ---------------------------------------------------- |
| `member_invited`            | `role`, `seats_used`, `seats_total`, `at_seat_limit` |
| `invite_accepted`           | `role`, `hours_to_accept`                            |
| `invite_revoked`            | `hours_pending`                                      |
| `member_removed`            | `role`, `member_count_after`                         |
| `member_role_changed`       | `from_role`, `to_role`                               |
| `ownership_transferred`     |                                                      |
| `member_left`               | `role`, `days_as_member`                             |
| `workspace_renamed`         |                                                      |
| `workspace_setting_changed` | `setting`, `value_kind`                              |

## 10. Reliability

| event                 | properties                                                                     |
| --------------------- | ------------------------------------------------------------------------------ |
| `error_shown`         | `code`, `http_status`, `surface`, `tool_id?`                                   |
| `save_failed`         | `reason`, `retry_count`, `section_count`                                       |
| `stream_disconnected` | `tool_id`, `at_phase`, `ms`, `recovered`                                       |
| `render_slow`         | `ms`, `section_count`, `format`, `where` (`"editor" \| "present" \| "export"`) |
| `quota_rate_limited`  | `route`, `plan_id`                                                             |

`render_slow` needs a threshold rather than firing on every paint. The engine solves layout from text
metrics on every section, so a slow render is a real user-visible cost and worth knowing about, but only
above a bound we pick deliberately and record here when we do.

## What we deliberately do not collect

Not an oversight, a decision. No property in this document carries any of the following, and a reviewer
should treat their appearance as a bug:

prompt and brief text, section copy, rich-text runs, artifact titles, folder names, theme names typed by
a user, uploaded file names, extracted file contents, search queries, comment bodies, email addresses,
display names, avatar URLs, full referrer URLs, IP addresses beyond whatever the ingest host records for
geo, and Stripe identifiers beyond a boolean that a customer exists.

The reason is narrow and worth stating plainly: this is customer content, our users put confidential
material into it, and an analytics pipeline is the least controlled place it could end up. Where the
temptation is strongest, wanting the prompt text to understand generation quality, the answer already
exists elsewhere: the eval system in `/eval` and `.docs/testing.md` stores traced runs with their prompts
inside our own database, under the workspace that owns them, which is where that data belongs.

## Volume estimate

The chattiest events are `element_added`, `text_edited`, and `generation_section_built`. A workspace
building a twelve-section deck and editing it produces on the order of a few hundred events. At PostHog's
1M events a month free tier that leaves room for roughly a few thousand active workspaces a month before
cost begins, which is far enough ahead that we should not pre-optimise, though `text_edited` should be
debounced per element rather than fired per keystroke.

## Planned / deferred

- **No experiment events.** Feature-flag exposure events are worth adding when we run the first
  onboarding experiment, and not before.
- **`editor_session_ended` is unreliable by nature.** It depends on a page-hide handler and will
  under-report. It is still worth having, but no funnel should use it as a denominator.
- **`render_slow` has no threshold yet.** Pick one from the eval corpus timings rather than guessing.
- **Cost per outcome needs the credits-to-USD conversion at query time.** `CREDIT_USD` lives in
  `model/credits.ts` and moves when models or their prices move, so a dashboard that hardcodes it will
  quietly drift. Send credits, convert in the dashboard, and revisit when that constant changes.
