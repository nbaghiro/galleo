# Legal pages and browser privacy choices

The Privacy Policy and Terms identify GalleoApp Inc. as a Delaware corporation, with
support@galleo.app as the public privacy, support, and legal contact. The owner approved the
18+ audience, Delaware courts with mandatory consumer rights preserved, no mandatory arbitration,
and an ordinary-liability cap of the greater of 12 months' affected-service fees or US$100,
subject to mandatory exceptions. Voluntary refunds are reviewed case by case; no fixed refund
window is invented, and statutory rights remain intact.

Both policies describe the deployed service. Published pieces show current content; public-link
entitlements can stop serving links without deleting the underlying content. Media URLs do not
independently enforce the artifact's audience permissions. Deletion of an artifact is not described
as immediate erasure of all files, backups, or recipients' copies. Retention is described by purpose
and criteria instead of unverified provider-specific periods. Rights requests follow the applicable
statutory deadline rather than the old universal 60-day promise.

Provider processing is described conservatively. The pages do not assert verified training opt-outs,
zero retention, a specific Neon region, or blanket residency/compliance guarantees. The transfer
section points to published provider terms without representing every account-specific agreement
as independently verified. PostHog is described as a third-party provider even though browser
requests are proxied by Galleo. Server link-audience records are distinct from browser product events.

The app and marketing site share `PrivacyControls` from `ui/privacy.tsx`. Optional browser analytics
and masked replay wait for acceptance. Essential-only and withdrawal stop capture and replay;
revocation during the SDK import cancels initialization. No pre-consent event history is replayed.
Current identity and workspace context stay in memory for a later opt-in. Published customer pages
do not initialize optional browser analytics. Server operational and link-audience records remain
separate, as the policy explains. Signup surfaces the 18+ condition and both policy links.

`pnpm check:legal` runs in pre-commit and CI. Its marker-detection self-check is preserved. The public
pages no longer carry draft banners or placeholder-rendering styles.

## Operational follow-up

- The owner has not supplied a postal address. Only the confirmed email contact is published; add a
  verified business mailing address when provided, without inferring a private or registered-agent address.
- Obtain and retain account-specific evidence for provider training settings, data-processing
  agreements, transfer requirements, and retention schedules. Published provider terms alone do not
  establish every Galleo account setting or a complete compliance assessment.
- Case-by-case voluntary refunds do not establish a guaranteed window. Update the policy if the
  owner adopts a more specific refund rule.

## References checked

- https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/individual-rights/the-right-to-be-informed/
- https://www.edpb.europa.eu/sme/be-compliant/respect-individuals-rights_en
- https://elevenlabs.io/docs/help-center/legal/is-my-data-used-to-improve-eleven-labs-ai-models
- https://render.com/terms
- https://render.com/dpa
- https://neon.com/blog/gdpr-compliance-and-neon
- https://privacy.claude.com/en/articles/7996862-how-do-i-view-and-sign-your-data-processing-addendum-dpa
- https://resend.com/legal/terms-of-service
- https://posthog.com/docs/privacy
