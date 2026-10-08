# Legal publication review

The company name is confirmed by the owner as **GalleoApp Inc.**. This review separates code-backed
facts from policy choices. It is not the published policy and must not be described as an approved
agreement. Privacy and Terms publication remains pending the owner answers requested in the session.

## Confirmed facts and corrections

- `services/core/mail.ts` uses `support@galleo.app` as its reply-to and describes it as a Workspace
  group. Use this existing address instead of inventing privacy/security mailboxes. Confirm that it
  is monitored for legal and privacy requests before promising response handling.
- `render.yaml` selects Render Oregon. The Neon production region and restore window have not been
  verified: the dashboard opened to a Google sign-in challenge. Do not infer them from a setup guide.
- `services/core/links.ts:publicRead` serves the live draft, refuses a trashed piece, and requires the
  owning workspace's public-link entitlement on every read. A subscription change that removes that
  entitlement disables links; cancellation is not immediate deletion of the underlying content.
- Product analytics and link analytics are separate. The policy must distinguish the browser product
  events from server-side link views, which record a referrer hostname, device category, country and
  pseudonymous daily deduplication key. A hash is not a blanket guarantee of anonymous data.
- Provider retention and training depend on API products, features, account choices, and agreements.
  Do not promise universal zero retention or a universal no-training guarantee. The ElevenLabs
  opt-out and any optional data-sharing programs still need account-level verification.
- The deployed branch does not contain the local workspace's new account lifecycle tooling. Do not
  describe the local export/deletion implementation as deployed solely because the files exist locally.

## Proposed decisions for the owner

1. **Contact:** use support@galleo.app for support, privacy, and legal notices, with the corporation's
   public business mailing address once provided. Do not publish a private home address by inference.
2. **Effective date:** the date the approved pages are deployed. Use the same date for both policies,
   and keep an updated date when future revisions are published.
3. **Eligibility:** proposed minimum age 18. Confirm before publication and ensure signup wording and
   enforcement reflect the intended audience; a policy sentence does not implement an age gate.
4. **Law and venue:** proposed Delaware law and courts, subject to mandatory consumer protections
   and the rights to bring claims locally that cannot legally be excluded. Confirm incorporation
   and the desired venue. No arbitration or class-action waiver is proposed.
5. **Liability:** proposed ordinary-liability cap of the greater of fees paid to Galleo for the affected
   service in the preceding 12 months or USD 100. Exclude indirect/consequential damages to the extent
   permitted by law. Preserve liability that cannot lawfully be excluded, including fraud and other
   mandatory exceptions. This allocation of commercial risk requires owner acceptance.
6. **Requests:** handle requests without undue delay and within the deadline required by the applicable
   law. For GDPR requests, normally one month, with permitted extensions and notice. Do not retain the
   current universal 60-day promise. Confirm who monitors and fulfills the requests.
7. **Closure and retrieval:** do not promise a post-deletion recovery window the system cannot deliver.
   Proposed wording: "Export any work you need before requesting permanent deletion. Subscription
   cancellation alone does not delete your account. After permanent deletion, an export or restoration
   may no longer be available. Content in a shared workspace may remain with that workspace."
8. **Retention:** retain active content for the service, remove it through supported deletion paths,
   and retain records only for applicable accounting, security, dispute, and legal obligations. Exact
   operational retention for unused media, traces, chat, billing records and backups needs a verified
   schedule and implementation; do not invent a fixed deletion window to finish the prose.
9. **EU/UK availability:** confirm target markets and the executed data-processing/transfer agreements.
   Naming standard contractual clauses is not evidence that they have been executed. A final notice
   needs the actual applicable safeguards and a way to request details.

## Proposed code-backed replacement clauses

### Publishing and plan changes

"Published links show the current draft of your piece. Later edits may therefore change what readers
see. A published link stops working if you remove the link, move the piece to Trash, permanently
delete it, or the owning workspace no longer has the plan entitlement required for public links.
Cancelling a subscription does not itself permanently delete the content in your account."

### Provider data handling

"When you use AI features, we send the relevant prompts, content, and reference material to the
provider handling the action. Galleo does not use your content to train its own models. Provider
processing, retention, and any training use are governed by the applicable provider agreement and
account settings. Do not assume that all providers offer zero retention or identical data-use terms."

This clause must be accompanied by an accurate provider table and verified account-specific details.
It is not a substitute for the missing ElevenLabs setting or any transfer agreement.

### Request timing

"We verify requests as necessary to protect your information and respond without undue delay, within
the period required by applicable law. Where an extension is permitted, we explain the reason and
notify you within the required period. You may have rights to access, correct, delete, restrict,
object to processing, or receive a portable copy of your data, depending on your location and the
circumstances. You may also complain to your applicable data-protection authority."

## Evidence checked

- https://www.edpb.europa.eu/sme/be-compliant/respect-individuals-rights_en
- https://ai.google.dev/gemini-api/terms
- https://privacy.claude.com/en/articles/7996866-how-long-do-you-store-my-organization-s-data
- https://docs.x.ai/developers/faq/security
- https://elevenlabs.io/docs/help-center/legal/is-my-data-used-to-improve-eleven-labs-ai-models

Provider documentation describes provider defaults; it does not prove Galleo's account settings.

## Release requirements

Resolve the owner decisions, verify operational settings, update both rendered legal pages, and run
`pnpm check:legal` until it passes without removing the marker detection. Then wire that guard into
pre-commit and CI in the same release, as the repository instructions require. Verify the live pages,
contact links, dates, canonical URLs, and no unresolved placeholders after deployment.

## October 8 revision

The replacement copy in `website/LegalPage.tsx` now covers both policies in full. It remains a review
revision, with explicit markers at the decisions awaiting the owner. It is not authorized for release
while `check:legal` is red. Known company identity is filled in, and the proposed liability and venue
clauses are written out for review. The date will be set to the actual publication date.

The browser analytics initialization in `ui/analytics.ts` currently starts PostHog without a consent
choice. The owner has been asked to select between adding opt-in controls, disabling optional browser
analytics, or discussing an alternative. Do not describe a consent control as shipped before it exists.
The revision removes the incorrect claim that proxied PostHog is not a third-party analytics service
and separates viewer product analytics from author-facing audience records.

The owner has also been asked for the public business address, confirmation that support@galleo.app
handles privacy/legal requests, Delaware jurisdiction, the proposed age and liability choices,
EU/EEA/UK availability, refunds, and provider training settings. A provider region is deliberately not
invented; dashboard access was unavailable through the computer-use connection in this session.

Retention wording uses purposes and criteria instead of unverified fixed periods. Request timing
follows applicable law instead of the old universal 60-day deadline. The copy does not claim that
local account-lifecycle tooling is deployed or that deleting an artifact necessarily purges media.

Current reference checks:

- https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/individual-rights/the-right-to-be-informed/
- https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/data-protection-principles/a-guide-to-the-data-protection-principles/storage-limitation/
- https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guidance-on-the-use-of-storage-and-access-technologies/what-are-storage-and-access-technologies/
- https://www.edpb.europa.eu/sme/be-compliant/respect-individuals-rights_en
- https://elevenlabs.io/docs/help-center/legal/is-my-data-used-to-improve-eleven-labs-ai-models

Validation so far: production build, SEO checks for all 32 public routes, focused ESLint, and browser
checks of both legal routes at phone width with working policy links and no horizontal overflow.
`check:legal` still fails intentionally while the decisions above are outstanding. Do not wire it
into CI or pre-commit until the finalized revision passes, then wire it as part of that release.
