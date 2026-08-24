import type { ArtifactAccess } from "./artifact";
import type { Surface } from "./ai";

// owner derives from workspaces.owner_id, never the role column; admin manages members, member edits
export type WorkspaceRole = "owner" | "admin" | "member";

// legacy rows predate roles and stored "editor"; anything unrecognized reads as a plain member
export const asRole = (raw: string | null | undefined): "admin" | "member" =>
    raw === "admin" ? "admin" : "member";

export const isAdmin = (role: WorkspaceRole): boolean => role !== "member";

// Who may publish an artifact to a public URL. Members is today's behavior and stays the default.
export type PublishPolicy = "members" | "admins";

export const isPublishPolicy = (v: unknown): v is PublishPolicy =>
    v === "members" || v === "admins";

export const canPublish = (role: WorkspaceRole, policy: PublishPolicy): boolean =>
    policy === "members" || isAdmin(role);

// The workspace-wide settings an admin sets once, as opposed to the plan (bought) or a role (granted).
export interface WorkspaceSettings {
    defaultArtifactAccess: ArtifactAccess; // what a member gets on an artifact that sets no level
    publishPolicy: PublishPolicy;
    memberCreditCap: number | null; // per member, per credit window; null = uncapped
}

export interface User {
    id: string;
    email: string;
    name: string | null;
    avatarUrl: string | null;
    emailVerified: boolean; // email/password accounts start false; OAuth accounts land verified
    createdAt: string; // ISO; the verification gate applies from its own date forward
    hasPassword: boolean; // false on an OAuth-only account, which may set one instead of changing it
    prefs: UserPrefs;
}

// What the first session recorded. Only the two things that cannot be derived: the format answer,
// which drives the starter artifact and the studio default, and the dismissal, which we must respect.
// The four checklist steps are NOT here — they are derived from rows (see services/core/onboarding.ts),
// so they stay right for accounts that predate onboarding and cannot drift from reality.
export interface OnboardingPrefs {
    format?: Surface;
    startedAt?: string; // ISO; also the marker that this account has been through the flow
    dismissed?: boolean; // checklist dismissed, as distinct from all four steps done
}

// Per-account settings that follow the user across browsers, as opposed to the workspace's rows.
// One jsonb column, so a new preference is a field here rather than a migration.
export interface UserPrefs {
    appTheme?: string; // app-chrome theme id; a stale id resolves to the default at read
    onboarding?: OnboardingPrefs;
}

const MAX_PREF_LEN = 64;

const isSurface = (v: unknown): v is Surface => v === "deck" || v === "doc" || v === "web";

// Same contract as the parent reader: client-written, so an unknown key or a wrong type is dropped.
// Returns undefined rather than {} when nothing survives, so `onboarding` never appears as an empty
// object and the "has this account onboarded" check stays a simple presence test.
function readOnboarding(raw: unknown): OnboardingPrefs | undefined {
    if (!raw || typeof raw !== "object") return undefined;
    const { format, startedAt, dismissed } = raw as Record<string, unknown>;
    const out: OnboardingPrefs = {};
    if (isSurface(format)) out.format = format;
    if (typeof startedAt === "string" && startedAt && startedAt.length <= MAX_PREF_LEN)
        out.startedAt = startedAt;
    if (typeof dismissed === "boolean") out.dismissed = dismissed;
    return Object.keys(out).length ? out : undefined;
}

// Every read of the column goes through this: the jsonb is client-written, so an unknown key or a
// wrong type is dropped rather than trusted.
export function readUserPrefs(raw: unknown): UserPrefs {
    if (!raw || typeof raw !== "object") return {};
    const { appTheme, onboarding } = raw as Record<string, unknown>;
    const prefs: UserPrefs = {};
    if (typeof appTheme === "string" && appTheme && appTheme.length <= MAX_PREF_LEN)
        prefs.appTheme = appTheme;
    const ob = readOnboarding(onboarding);
    if (ob) prefs.onboarding = ob;
    return prefs;
}

// A patch carries only the keys it changes; null clears one back to the account default. The
// onboarding branch merges field by field rather than replacing, so writing `dismissed` alone cannot
// wipe the format answer the flow already recorded.
export function mergeUserPrefs(current: UserPrefs, patch: unknown): UserPrefs {
    if (!patch || typeof patch !== "object") return current;
    const next = { ...current };
    const { appTheme, onboarding } = patch as Record<string, unknown>;
    if (appTheme === null) delete next.appTheme;
    else if (appTheme !== undefined) {
        const clean = readUserPrefs({ appTheme }).appTheme;
        if (!clean) return current;
        next.appTheme = clean;
    }
    if (onboarding === null) delete next.onboarding;
    else if (onboarding !== undefined) {
        const clean = readOnboarding(onboarding);
        if (!clean) return current;
        next.onboarding = { ...next.onboarding, ...clean };
    }
    return next;
}

// The first session's state, as the app reads it. `done` is derived server-side from rows rather than
// stored, so it is right for accounts that predate onboarding (services/core/onboarding.ts).
export type OnboardingStep = "make" | "ai" | "theme" | "send";

export const ONBOARDING_STEPS: readonly OnboardingStep[] = ["make", "ai", "theme", "send"];

/**
 * The steps that crossed between two reads of the checklist.
 *
 * A first read has no baseline and so reports nothing: the steps it comes back with were already
 * done, often in an earlier session, and treating "we have not loaded yet" as "nothing was done"
 * re-reports every finished step on every page load.
 */
export const newlyDone = (
    before: readonly OnboardingStep[] | undefined,
    now: readonly OnboardingStep[],
): OnboardingStep[] => (before ? now.filter((s) => !before.includes(s)) : []);

export interface OnboardingState {
    needed: boolean; // no format answer recorded and nothing in the workspace yet
    done: OnboardingStep[];
    dismissed: boolean;
    format?: Surface;
    grantReleased: boolean;
}

export const MAX_NAME_LEN = 80;

// Returns the stored form: trimmed, capped, and null when the user clears it.
export function cleanDisplayName(raw: unknown): string | null {
    if (typeof raw !== "string") return null;
    const trimmed = raw.trim().slice(0, MAX_NAME_LEN);
    return trimmed || null;
}

export interface AccountConnection {
    provider: AuthProvider;
    linkedAt: string;
}

/**
 * An app the person connected over MCP. A credential this account handed out rather than an
 * identity it signs in with, which is why it sits beside AccountConnection rather than inside it.
 * One row per client however many times its token has rotated since.
 */
export interface ConnectedApp {
    clientId: string;
    name: string;
    scopes: string[]; // ToolScope values; @model/tools owns the vocabulary and its labels
    workspaceIds: string[];
    lastUsedAt: string | null;
    connectedAt: string;
}

// One workspace the account belongs to; `active` is set only where the reader knows the live tenant.
export interface Membership {
    id: string;
    name: string;
    role: WorkspaceRole;
    active?: boolean;
}

export interface Folder {
    id: string;
    name: string;
    parentId?: string | null;
    createdAt: string;
    count?: number; // live artifacts in the folder, counted server-side (the client list is paged)
}

// One definition of a well-formed address, so the field and the route agree on what they reject.
// Format only: whether the mailbox exists is what the verification email answers, and no regex can.
// Deliberately stricter than the last version on the two things a typo actually produces, a missing
// dot in the domain and a trailing one.
const EMAIL_RE = /^[^@\s]+@[^@\s.]+(\.[^@\s.]+)+$/;

export const MAX_EMAIL = 254; // RFC 5321 forward-path limit

export function emailError(raw: string): string | null {
    const email = raw.trim();
    if (!email) return "Enter your email address.";
    if (email.length > MAX_EMAIL) return "That email address is too long.";
    if (!EMAIL_RE.test(email)) return "That does not look like an email address.";
    return null;
}

export const isEmail = (v: string): boolean => emailError(v) === null;

// The confirmation code, shared so the field and the route agree on what one looks like. Digits only:
// it is typed on a phone as often as a keyboard, and a code that mixes cases invites O/0 and I/l.
export const VERIFY_CODE_LENGTH = 6;
const CODE_RE = /^[0-9]{6}$/;

export function verifyCodeError(raw: string): string | null {
    const code = raw.replace(/\s+/g, "");
    if (!code) return "Enter the code from your email.";
    if (!CODE_RE.test(code)) return `The code is ${VERIFY_CODE_LENGTH} digits.`;
    return null;
}

export interface ConfirmBody {
    code?: string;
}

// The fixed code every account accepts outside production, so trying the flow by hand needs no
// mailbox. The server decides whether it is live (accounts.ts); this constant only names it, so the
// dev hint under the field and the route cannot drift apart.
export const DEV_CONFIRM_CODE = "123456";

// Confirmation became a gate on 2026-08-22. Accounts opened before it keep the access they already
// had, so the rule applies forward rather than locking out people who signed up under the old
// contract. A date rather than a per-account flag: no migration, and it says when the rule changed.
//
// Here rather than beside the routes because both sides need the same answer: the API refuses the
// guarded routes, and the app has to show the confirm step instead of a screen full of failed reads.
const CONFIRM_GATE_FROM = Date.parse("2026-08-22T00:00:00Z");

export const mustConfirmEmail = (u: { emailVerified: boolean; createdAt: string }): boolean =>
    !u.emailVerified && Date.parse(u.createdAt) >= CONFIRM_GATE_FROM;

export interface LoginBody {
    email?: string;
    password?: string;
}

export interface SignupBody {
    email?: string;
    password?: string;
    name?: string;
}

export interface ForgotBody {
    email?: string;
}

export interface ResetBody {
    token?: string;
    password?: string;
}

export interface ProfileBody {
    name?: string | null;
}

// current is absent on an OAuth-only account, which is setting a first password rather than changing one
export interface PasswordBody {
    current?: string;
    password?: string;
}

// matches oauth_accounts.provider on the backend
export type AuthProvider = "google";

export interface FolderInput {
    name: string;
    parentId?: string | null;
}
