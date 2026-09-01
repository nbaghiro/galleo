import type { BeatRole, Surface } from "./ai";
import { BEAT_ROLES } from "./ai";
import type { ArtifactAccess, SectionTone } from "./artifact";
import type { AddOnId, ExportFormat, FeatureKey, Interval, PlanId } from "./billing";
import type { AiTask } from "./credits";
import type { MediaSource } from "./media";
import type { SectionArchetype } from "./eval";
import type { VoiceSource } from "./speech";
import type { ToolEffect, ToolId, ToolScope, ToolSurface } from "./tools";
import type { AuthProvider, OnboardingStep, WorkspaceRole } from "./workspace";

// The product-analytics contract: every event we emit, and the exact properties it carries. Shared
// by app/ and services/, and model is the only layer both may import, so it lives here. Pure, no IO.
//
// The names are the wire names, so nothing transforms them on the way out and a call site cannot
// drift from a dashboard. `Events` is the single source of truth: `EventName` is its keys, so an
// event exists exactly once and adding one is a one-line diff.
//
// Properties are ids, enums, counts, durations and booleans. No content, ever: no prompt or section
// text, no titles, no file names, no email addresses, no search queries. Where magnitude matters,
// a bucket travels instead of the value.

// Enums that live above model (ui, canvas, app) are restated here, because model imports nothing
// outside model. Each one is checked against its real definition at the call site that supplies it,
// so a member added there is a type error here rather than a silent hole.

/** Mirrors `Tier` in `@ui/viewport`. */
export type DeviceTier = "phone" | "tablet" | "desktop";

/** Mirrors `Stage` in `app/stores/generate.ts`. */
export type GenerationStage =
    | "idle"
    | "intake"
    | "planning"
    | "outline"
    | "building"
    | "done"
    | "error";

/** Mirrors the `category` a registered element declares in `@elements/spec`. */
export type ElementCategory =
    | "text"
    | "media"
    | "table"
    | "composite"
    | "basic"
    | "chart"
    | "diagram";

/** Where the generation studio was entered from during the first session. */
export type StudioEntry = "checklist" | "library" | "empty_state" | "editor";

export const asStudioEntry = (v: string): StudioEntry =>
    v === "checklist" || v === "empty_state" || v === "editor" ? v : "library";

/** The pricing origin arrives as a query param, so it is narrowed rather than trusted. */
export const asOrigin = (v: string | string[] | undefined): PricingOrigin =>
    v === "paywall" || v === "credits" || v === "settings" || v === "onboarding" ? v : "sidebar";

/** A link's visibility is a free string on the row, so it is narrowed rather than cast. */
export const asVisibility = (v: string | undefined): LinkVisibility =>
    v === "public" || v === "protected" ? v : "private";

/** An artifact's format is a free string on the row, so it is narrowed rather than cast. */
export const asFormat = (v: string | undefined): Surface =>
    v === "doc" || v === "web" ? v : "deck";

/** A beat's role is a free string on the wire, so it is narrowed rather than cast. */
export const asBeatRole = (v: string | undefined): BeatRole | undefined =>
    BEAT_ROLES.find((r) => r === v);

/** Mirrors `VISIBILITIES` in `services/core/links.ts`. */
export type LinkVisibility = "private" | "protected" | "public";

/** Where an error surfaced, which is the app area rather than the artifact format. */
export type AppArea = "auth" | "library" | "studio" | "editor" | "present" | "settings" | "publish";

/**
 * The area a path belongs to. Derived rather than passed, because the twenty call sites that report
 * an error have no reason to know, and a default would have said "editor" for all of them.
 */
export function areaFor(path: string): AppArea {
    if (path.startsWith("/edit/")) return "editor";
    if (path.startsWith("/present/")) return "present";
    if (path.startsWith("/p/")) return "publish";
    if (path === "/welcome") return "studio";
    if (path === "/login" || path.startsWith("/invite/") || path.startsWith("/collab/"))
        return "auth";
    if (path.startsWith("/settings") || path.startsWith("/account")) return "settings";
    return "library";
}

export type AuthMethod = "password" | AuthProvider;

/** Where the pricing page was reached from, so a paywall's conversion is separable from browsing. */
export type PricingOrigin = "paywall" | "credits" | "sidebar" | "settings" | "onboarding";

/** Empty on purpose: the event's occurrence is the whole signal. */
export type NoProps = Record<string, never>;

export type CharsBucket = "0-100" | "100-500" | "500-2k" | "2k-10k" | "10k+";

/** A query is a handful of words, so it needs its own scale: `charsBucket` would call every one "0-100". */
export type QueryBucket = "1-3" | "4-10" | "11-25" | "26+";

export function queryBucket(chars: number): QueryBucket {
    if (chars <= 3) return "1-3";
    if (chars <= 10) return "4-10";
    if (chars <= 25) return "11-25";
    return "26+";
}

/** Magnitude without the content. A delta is bucketed on its absolute size. */
export function charsBucket(chars: number): CharsBucket {
    const n = Math.abs(chars);
    if (n < 100) return "0-100";
    if (n < 500) return "100-500";
    if (n < 2_000) return "500-2k";
    if (n < 10_000) return "2k-10k";
    return "10k+";
}

/**
 * Carries one request's id from the browser to the server, so a client event and the server events
 * that request caused share a join key. Not a security boundary: it is an opaque label a caller may
 * set, which is why the server sanitises it before it becomes a property.
 */
export const REQUEST_ID_HEADER = "x-galleo-request";

const REQUEST_ID_OK = /^[A-Za-z0-9._-]{1,64}$/;

/** An inbound id is untrusted input, so an unusable one is replaced rather than passed through. */
export const asRequestId = (v: string | undefined, fresh: () => string): string =>
    v && REQUEST_ID_OK.test(v) ? v : fresh();

/** The workspace is the billing entity and the credit pool, so it is the group everything rolls up to. */
export const GROUP_TYPE = "workspace";

/**
 * Attached to every event, so no query needs a join to segment by plan or device.
 * `device_tier` is client-only: the server has no viewport.
 */
export interface SuperProperties {
    /**
     * The tenant, as a plain property.
     *
     * Group analytics is a paid PostHog add-on and we are on the free tier, so `$groups` alone
     * cannot be aggregated. Every event carries the workspace id directly so the per-tenant
     * questions (unit cost by plan, which wall converts, weekly active workspaces) stay answerable.
     * The `group()` calls stay in place, so they start working the day the add-on is bought.
     */
    workspace_id?: string;
    plan_id: PlanId;
    // Absent where it is not knowable: the workspace row does not store the interval, so only the
    // Stripe seam has it. `plan_changed` and `checkout_completed` carry it explicitly.
    plan_interval?: Interval;
    workspace_role: WorkspaceRole;
    credits_remaining: number;
    app_build: string;
    device_tier?: DeviceTier;
}

/** Set on the person, keyed by user id. Never by email. */
export interface PersonTraits {
    signup_method: AuthMethod;
    signup_at: string;
    email_verified: boolean;
    workspaces_owned: number;
    workspaces_member_of: number;
    app_theme: string;
}

/** Set on the workspace, keyed by workspace id. */
export interface WorkspaceTraits {
    plan_id: PlanId;
    plan_interval: Interval;
    seats_total: number;
    seats_used: number;
    member_count: number;
    artifact_count: number;
    created_at: string;
    credits_balance: number;
    credits_granted_this_window: number;
    has_custom_theme: boolean;
    has_stripe_customer: boolean;
}

export type AiFailureReason =
    | "provider_error"
    | "timeout"
    | "no_credits"
    | "invalid_output"
    | "aborted"
    | "rate_limited";

export interface Events {
    // Account and session.
    // The marketing page's own conversion step. The landing itself is a $pageview, which is what
    // carries the referrer and the campaign parameters; this is the click that leaves for signup,
    // so the two together say which placement earned the account.
    signup_cta_clicked: { placement: string };
    signed_up: { method: AuthMethod; invited: boolean };
    email_verified: { hours_since_signup: number };
    logged_in: { method: AuthMethod };
    logged_out: NoProps;
    workspace_switched: { from_plan: PlanId; to_plan: PlanId; workspaces_available: number };
    password_reset_requested: NoProps;
    // server-emitted at the connect callback: the Drive grant behind the Google Slides export
    google_connected: { reconnected: boolean };

    // Onboarding, the first-session funnel in .docs/onboarding.md.
    onboarding_format_chosen: { format: Surface };
    // The wall answers the format question by being browsed, so the filter is the only place the
    // intent is stated before a starter is committed to.
    onboarding_starters_filtered: { format: Surface | "all"; shown: number };
    // left the wall without picking anything, which the funnel could not see before: the skip was a
    // dead control, so everyone who wanted out either picked something or abandoned the account
    onboarding_skipped: { shown: number };
    onboarding_starter_opened: { format: Surface; template_id: string; ms_since_signup?: number };
    onboarding_studio_opened: { from: StudioEntry };
    // The clock is the first session's own start, not signup: the browser never learns the signup
    // timestamp, and identify carries `signup_at` so the real elapsed time is a query-time join.
    onboarding_first_generation_completed: {
        format: Surface;
        section_count: number;
        credits_charged: number;
        ms_since_signup?: number;
    };
    onboarding_checklist_step_done: { step: OnboardingStep; ms_since_signup?: number };
    onboarding_checklist_dismissed: { steps_done: number };

    // The assistant rail. `ai_action_*` already says what a chat turn costs; these say whether it
    // works: whether people ask, and whether what it proposes gets taken.
    chat_opened: { from: string };
    chat_message_sent: { chars_bucket: CharsBucket; thread_length: number };
    chat_proposal_applied: { kind: string };
    chat_proposal_dismissed: { kind: string };

    // The media picker. Generation cost rides ai_action_*; these say which source people reach for
    // and whether searching finds anything.
    media_searched: { provider: string; result_count: number; query_length_bucket: QueryBucket };
    media_inserted: { source: MediaSource | "icon"; kind: string };
    media_upload_failed: { reason: string };

    // Live collaboration, a whole subsystem that was invisible. `peers` is how many others were in
    // the room, so "opened a shared artifact alone" is separable from real multiplayer.
    collab_joined: { peers: number; access: ArtifactAccess };
    collab_edit_blocked: { element_type: string };

    // The purest friction signal an editor has: work being taken back.
    edit_undone: NoProps;
    edit_redone: NoProps;

    // Which model tier people pin, which drives cost directly.
    model_pinned: { task: string; model_id: string };

    // AI actions. Three events for every tool, with `tool_id` as a property, so a tool added later
    // is instrumented the moment its id exists.
    // `task` is absent for the two media units, which run on their own models rather than a text
    // task. `model_id` is absent on start, since nothing has picked a model yet, and on a run that
    // died before its first model call. `tool_surface` is where the call came in on, passed by the
    // caller: a tool declares several and the one it was reached through is the answerable half.
    ai_action_started: {
        tool_id: ToolId;
        task?: AiTask;
        tool_surface: ToolSurface;
        model_id?: string;
        estimated_credits: number;
        artifact_format?: Surface;
    };
    ai_action_completed: {
        tool_id: ToolId;
        task?: AiTask;
        model_id?: string;
        credits_charged: number;
        ms: number;
        input_tokens: number;
        output_tokens: number;
        cached: boolean;
    };
    ai_action_failed: {
        tool_id: ToolId;
        task?: AiTask;
        model_id?: string;
        ms: number;
        reason: AiFailureReason;
        retryable: boolean;
    };

    // The generation studio funnel, on top of the ai_action_* events above.
    generation_intake_opened: { from: string; format: Surface; prefilled: boolean };
    generation_context_attached: {
        kind: "paste" | "file" | "link" | "artifact";
        count: number;
        chars_bucket: CharsBucket;
    };
    // `model_id` is redundant here: the plan turn's own ai_action_completed carries the model that
    // ran it, and only the server knows which that was.
    // A starter picked as a shape rather than as a starting point. Fired at the one seam every
    // entrance funnels through, so a fourth door cannot ship unmeasured.
    generation_shape_picked: {
        template_id: string;
        category: string;
        template_format: Surface;
        run_format: Surface;
    };
    generation_planned: {
        format: Surface;
        length: string;
        beat_count: number;
        ms: number;
        first_beat_ms?: number;
        model_id?: string;
        credits_charged: number;
        // present when the run borrowed a starter's shapes, so plan quality can be read apart
        shape_template_id?: string;
    };
    generation_outline_edited: {
        edit: "rename" | "reorder" | "add" | "remove";
        beat_count: number;
    };
    generation_build_started: { mode: "all" | "one"; beat_count: number };
    // `archetype` is layout-derived: classifying a section needs a real text measurer and a full
    // layout pass, which the studio does not hold and should not run per section to label an event.
    generation_section_built: {
        index: number;
        beat_role?: BeatRole;
        archetype?: SectionArchetype;
        ms: number;
        images_ms?: number;
        credits_charged: number;
        element_count: number;
    };
    // a landed section failed the client-side layout triage (measured in the browser's engine)
    generation_section_flagged: {
        format: Surface;
        overflow: boolean;
        contrast: boolean;
        sparse: boolean;
    };
    // A beat the build gave up on after its retry, which is not a `generation_failed`: the run
    // carries on and the piece lands one card short rather than stopping.
    generation_section_failed: { index: number; beat_role?: BeatRole; attempts: number };
    generation_steered: { at_index: number; beat_count: number };
    generation_paused: { at_index: number };
    generation_completed: {
        format: Surface;
        section_count: number;
        total_credits: number;
        total_ms: number;
        steer_count: number;
        was_paused: boolean;
        outline_edited: boolean;
    };
    generation_abandoned: { stage: GenerationStage; sections_built: number; ms: number };
    generation_failed: { stage: GenerationStage; reason: string };

    // Creation and the library.
    artifact_created: {
        source: "template" | "blank" | "generated" | "duplicated" | "chat" | "imported";
        format: Surface;
        template_id?: string;
    };
    // one per finished import, beside the artifact_created it produces
    artifact_imported: {
        import_format: "pdf" | "pptx" | "slides";
        section_count: number;
        image_count: number;
        ms: number;
    };
    import_failed: { import_format: "pdf" | "pptx" | "slides"; reason: string };
    // `age_days` is absent: the row's createdAt is not on the windowed read's wire shape, and
    // widening a hot read for one property is not worth it. artifact_trashed carries the real age.
    artifact_opened: {
        format: Surface;
        section_count: number;
        age_days?: number;
        access: ArtifactAccess;
    };
    artifact_moved: { to_folder: boolean };
    artifact_duplicated: { format: Surface; section_count: number };
    artifact_trashed: { format: Surface; age_days: number; section_count: number };
    artifact_restored: { days_in_trash: number };
    artifact_deleted: { days_in_trash: number };
    trash_emptied: { count: number };
    library_searched: {
        result_count: number;
        query_length_bucket: QueryBucket;
        via: "field" | "palette";
        clicked_position?: number;
    };
    template_previewed: { template_id: string; category: string; format: Surface };
    // a text or table gained a line clamp; counts only, never the text it clamps
    text_clamped: { element_type: string; max_lines: number };
    // an element pinned out of the flow, and its way back; via names the entry point
    element_pinned: { element_type: string; via: "panel" | "bar" | "palette" | "drag" };
    element_unpinned: { element_type: string; via: "panel" | "bar" | "palette" | "drag" };
    template_used: { template_id: string; category: string; format: Surface; from: string };

    // Editing depth: whether people author here or only generate and leave.
    element_added: {
        element_type: string;
        category: ElementCategory;
        how: "palette" | "drag" | "paste" | "ai";
    };
    // `count` is present only on the batch form, so a single removal reads exactly as it always did
    element_removed: { element_type: string; category: ElementCategory; count?: number };
    element_moved: { element_type: string; same_section: boolean };
    elements_grouped: { count: number };
    element_resized: { element_type: string; kind: "height" | "aspect" };
    element_revised_with_ai: { element_type: string; credits_charged: number };
    section_added: { how: "button" | "ai" | "template"; at_index: number; section_count: number };
    section_reordered: { from_index: number; to_index: number };
    section_removed: { section_count_after: number };
    section_layout_changed: { preset: string };
    text_edited: { element_type: string; chars_delta_bucket: CharsBucket };
    theme_changed: { theme_id: string; from_theme_id: string; is_custom: boolean };
    // Neither property is knowable at the one route that mints a theme: the body carries tokens
    // only, so whether a model or a person chose them, and what it started from, are not on the
    // wire. Both would need the theme editor to say so when it saves.
    custom_theme_created: { how?: "editor" | "ai"; based_on_theme_id?: string };
    background_set: { kind: "color" | "gradient" | "image" | SectionTone };
    format_switched: { from: Surface; to: Surface; section_count: number };
    editor_session_ended: {
        ms: number;
        format: Surface;
        section_count: number;
        edit_count: number;
        ai_action_count: number;
        saved: boolean;
    };

    // Output and distribution. Reaching an output is the activation definition.
    exported: {
        export_format: ExportFormat;
        artifact_format: Surface;
        section_count: number;
        ms: number;
        branded: boolean;
    };
    export_failed: { export_format: ExportFormat; reason: string; section_count: number };
    // the modal's preview builds only on click, so this marks intent one step before `exported`
    export_previewed: {
        export_format: ExportFormat;
        artifact_format: Surface;
        section_count: number;
    };
    presented: {
        artifact_format: Surface;
        section_count: number;
        slides_advanced: number;
        ms: number;
    };
    // Speaker notes and narration. No event carries a word of a script or of a voice description:
    // both are the customer's own writing, and `chars` is a bucket rather than a count.
    notes_written: { where: "panel" | "chat"; section_count: number; regenerated: boolean };
    narration_prepared: {
        section_count: number;
        cached: number;
        chars: CharsBucket;
        credits_charged: number;
        ms: number;
    };
    narration_played: {
        where: "editor" | "present" | "publish";
        artifact_format: Surface;
        sections_heard: number;
        section_count: number;
        completed: boolean;
        ms: number;
    };
    // Background music. The preset id is ours rather than the customer's words, so it travels; a
    // custom bed's prompt is derived from their content and never does.
    soundtrack_chosen: {
        source: "preset" | "workspace" | "custom";
        preset?: string;
        cached: boolean; // the deployment already had this bed, so nothing was generated
        credits_charged: number;
        ms: number;
    };
    soundtrack_played: {
        where: "present" | "publish";
        artifact_format: Surface;
        source: "preset" | "workspace" | "custom";
        with_narration: boolean; // whether it spent the session ducked under a voice
        ms: number;
    };
    voice_saved: {
        source: VoiceSource;
        from: "settings" | "editor";
        shelf_size: number;
        made_default: boolean;
    };
    voice_auditioned: { source: VoiceSource; kind: "preview" | "own_text" };
    voice_designed: { kept: boolean; attempt: number };
    link_created: {
        visibility: LinkVisibility;
        has_password: boolean;
        recipient_count: number;
        artifact_format: Surface;
    };
    link_updated: {
        visibility_from: LinkVisibility;
        visibility_to: LinkVisibility;
        has_password: boolean;
    };
    link_deleted: { view_count_at_delete: number };
    link_recipients_added: { count: number };
    link_viewed: {
        visibility: LinkVisibility;
        by_owner: boolean;
        referrer_host: string;
        device_tier: DeviceTier;
        is_first_view: boolean;
    };
    comment_created: { by_role: WorkspaceRole; on_own_artifact: boolean; is_reply: boolean };
    comment_resolved: { hours_open: number };
    // Null is a real setting, not an absence: it drops the per-artifact override so the workspace
    // default applies again.
    artifact_access_changed: { to: ArtifactAccess | "workspace_default" };

    // Monetization and friction. The two walls are the only places the product says no.
    // A wall can come from any of the three feature kinds: a boolean the plan lacks, a numeric cap
    // it has reached, or an enum it is not in (export formats, model tier).
    paywall_hit: {
        feature: FeatureKey;
        // Redundant with the super property of the same name, so it is only sent where the wall
        // itself knows the plan; the editor's export gate does not.
        plan_id?: PlanId;
        upgrade_offered: boolean;
        upgrade_target?: PlanId;
    };
    credits_exhausted: {
        plan_id: PlanId;
        blocked_tool_id: ToolId;
        upgrade_offered: boolean;
        topup_offered: boolean;
        credits_remaining: number;
    };
    credit_balance_low: { credits_remaining: number; threshold: number };
    pricing_viewed: { from: PricingOrigin; plan_id: PlanId; tab: "plan" | "billing" };
    checkout_started: {
        target_plan: PlanId;
        interval: Interval;
        seats: number;
        addons: AddOnId[];
    };
    checkout_completed: { plan_id: PlanId; interval: Interval; seats: number; mrr_usd: number };
    // fired on the return from a Checkout the user backed out of (?status=cancel)
    checkout_abandoned: { target_plan?: PlanId };
    plan_changed: {
        from_plan: PlanId;
        to_plan: PlanId;
        from_interval: Interval;
        to_interval: Interval;
        direction: "upgrade" | "downgrade" | "interval";
    };
    downgrade_scheduled: { from_plan: PlanId; to_plan: PlanId; effective_at: string };
    downgrade_cancelled: { plan_id: PlanId };
    plan_cancelled: { plan_id: PlanId; days_active: number; artifacts_created: number };
    topup_purchased: { credits: number; usd: number };
    seats_changed: { from: number; to: number; direction: "up" | "down" };
    billing_portal_opened: { from: string };
    credit_activity_viewed: { plan_id: PlanId };

    // Collaboration and teams.
    member_invited: {
        role: WorkspaceRole;
        seats_used: number;
        seats_total: number;
        at_seat_limit: boolean;
    };
    invite_accepted: { role: WorkspaceRole; hours_to_accept: number };
    invite_revoked: { hours_pending: number };
    member_removed: { role: WorkspaceRole; member_count_after: number };
    member_role_changed: { from_role: WorkspaceRole; to_role: WorkspaceRole };
    member_left: { role: WorkspaceRole; days_as_member: number };
    workspace_setting_changed: { setting: string; value_kind: string };

    // The delegated surface: Galleo reached from outside the product, over MCP or the REST API.
    // One event covers both, because `callDelegated` is the single place every such call funnels
    // through, refusals included, so a tool joining the surface is measured by construction. What a
    // priced call cost still rides the ai_action_* events; this says that a call arrived at all, on
    // which surface, and how it ended.
    delegated_tool_called: {
        tool_id: ToolId;
        surface: ToolSurface;
        // Both absent for a name the catalog does not hold, which is the whole of the `no-tool`
        // outcome. Redundant with `tool_id` for a query that already has the catalog, and worth
        // sending so a refusal can be grouped by the permission it needed.
        scope?: ToolScope;
        effect?: ToolEffect;
        outcome: "ok" | "no-tool" | "needs-auth" | "not-found" | "refused" | "scope";
        authenticated: boolean;
        // whether the caller named a workspace, or fell through to the one the grant defaults to
        named_workspace: boolean;
        ms: number;
    };
    // The OAuth connections behind that surface. A client's own name is free text it wrote about
    // itself, so what travels is the opaque `client_id` we minted for it.
    connector_registered: { client_id: string; loopback: boolean; redirect_uri_count: number };
    // Consent granted. The scope set is what makes a step-up visible: the same client authorizing
    // again with a wider set is the step-up completing, and there is no other record of it.
    connector_authorized: {
        client_id: string;
        scopes: ToolScope[];
        workspaces_granted: number;
        workspaces_available: number;
    };
    // Raised where a token is minted rather than at the endpoint, so the machine grant (which has
    // no browser and no consent screen) and a refresh rotation are counted the same way.
    connector_token_issued: {
        client_id: string;
        grant: "authorization_code" | "refresh_token" | "client_credentials";
        scopes: ToolScope[];
        workspace_count: number;
    };
    connector_disconnected: { client_id: string; from: "settings" | "client" };
    // The workspace's own half of that surface: an admin issuing a headless integration credential,
    // and turning one off. A credential's name is the customer's own words, so what identifies it
    // here is the opaque client id we minted, which is also what joins it to the tokens it went on
    // to issue. `ever_used` separates a credential that was wired into something from one that was
    // made and never called.
    api_credential_created: { client_id: string; credential_count_after: number };
    api_credential_revoked: { client_id: string; days_active: number; ever_used: boolean };

    // Reliability.
    error_shown: { code: string; http_status: number; surface: AppArea; tool_id?: ToolId };
    save_failed: { reason: string; retry_count: number; section_count: number };
    // `recovered` is absent: the client does not retry a stream, the studio's retry re-enters the
    // step as a new turn, so a constant false would have been noise rather than a signal.
    // A death, not every unfinished stream: a turn the server named a failure on is a reported
    // error, and counting it here as well would read as two separate incidents.
    stream_disconnected: { tool_id: ToolId; at_phase: string; ms: number; recovered?: boolean };
    render_slow: {
        ms: number;
        section_count: number;
        format: Surface;
        where: "editor" | "present" | "export";
    };
    quota_rate_limited: { route: string; plan_id: PlanId };
}

/**
 * Above this, one paint of the section stack is worth reporting.
 *
 * Chosen from measurement, not from feel: the layout solver over the 135-section eval corpus runs
 * at p95 0.20ms and a worst case of 0.98ms per section, so anything two orders of magnitude above
 * that is dominated by real font metrics or paint rather than by the solver, and is past the point
 * where a frame still reads as instant. Revisit against browser timings once we have them.
 */
export const RENDER_SLOW_MS = 120;

export type EventName = keyof Events;

export type EventProps<N extends EventName> = Events[N];
