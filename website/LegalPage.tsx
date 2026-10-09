import type { Component, JSX } from "solid-js";
import { For, Index, Show } from "solid-js";
import { AuthCta, BrandLink } from "./chrome";
import { LEGAL_DOC_IDS, LEGAL_PATHS, type LegalDocId } from "./routes";

type Block =
    | { kind: "p"; text: string }
    | { kind: "lead"; label: string; text: string }
    | { kind: "list"; items: string[] }
    | { kind: "table"; columns: string[]; rows: string[][] };

interface LegalSection {
    id: string;
    heading: string;
    blocks: Block[];
}

interface LegalDoc {
    title: string;
    effective?: string;
    updated: string;
    intro: string;
    sections: LegalSection[];
}

const PRIVACY: LegalDoc = {
    title: "Privacy Policy",
    effective: "October 8, 2026",
    updated: "October 8, 2026",
    intro: "This policy explains how GalleoApp Inc. handles personal information when you visit Galleo, create or manage an account, use our content tools, collaborate, or view a published piece. It also explains your choices and how to contact us.",
    sections: [
        {
            id: "who-we-are",
            heading: "Who we are",
            blocks: [
                {
                    kind: "p",
                    text: "GalleoApp Inc., a Delaware corporation, operates Galleo at galleo.app. Contact us at support@galleo.app.",
                },
                {
                    kind: "p",
                    text: "We determine how personal information is used for our account administration, billing, security, and product operations. When we process personal information in a business customer’s workspace on that customer’s instructions, the customer may be responsible for that information as its controller. Your workspace administrator may manage membership and access to workspace content.",
                },
            ],
        },
        {
            id: "what-we-collect",
            heading: "Information we collect",
            blocks: [
                {
                    kind: "lead",
                    label: "Account and sign-in information.",
                    text: "Your email address, name, avatar, account preferences, workspace memberships, and authentication records. Google sign-in supplies profile information needed to identify your account. If you set a password, we store a password hash rather than the password.",
                },
                {
                    kind: "lead",
                    label: "Your content.",
                    text: "The material you submit, upload, generate, or edit, including prompts, text, images, video, files, extracted reference material, comments, chat history, speaker notes, narration, and music. Content may include personal information that you or a collaborator chooses to provide.",
                },
                {
                    kind: "lead",
                    label: "Usage and technical information.",
                    text: "Feature activity, identifiers, timestamps, errors, credit use, and request information needed to operate and secure the service. Infrastructure providers process network information such as IP addresses when serving requests.",
                },
                {
                    kind: "lead",
                    label: "Billing and communications.",
                    text: "Subscription and payment status, Stripe customer and subscription references, and information you send in support requests. Stripe processes payment details; Galleo does not store full payment-card numbers.",
                },
                {
                    kind: "lead",
                    label: "Published pieces and forms.",
                    text: "Audience activity for published links, including views, section progress, referrer hostname, device category, and country when available. Link-view records use a daily pseudonymous key for deduplication rather than storing the raw viewer IP address or user-agent string. Information submitted through a form in a published piece is available to the people authorized to manage that piece.",
                },
            ],
        },
        {
            id: "purposes",
            heading: "Why we use information",
            blocks: [
                {
                    kind: "p",
                    text: "We use information to provide accounts and workspaces; generate, edit, store, display, and export content; support sharing and collaboration; process subscriptions and credits; deliver service messages; answer support requests; understand product use; diagnose problems; prevent fraud and abuse; and comply with legal obligations.",
                },
                {
                    kind: "p",
                    text: "Where applicable law requires a legal basis, we rely on performance of our contract to provide the requested service, legitimate interests in operating and securing the service, legal obligations, or consent where required. Legitimate interests are subject to the balancing of your rights and our interests. You may withdraw consent for processing based on consent without affecting earlier lawful processing.",
                },
            ],
        },
        {
            id: "ai-providers",
            heading: "AI features and provider data use",
            blocks: [
                {
                    kind: "p",
                    text: "When you request AI work, we send the prompts, content, and reference material relevant to that action to the provider handling it. Depending on the feature and workspace configuration, this can include Google, Anthropic, OpenAI, or xAI for language tasks; Google for generated images, video, and embeddings; and ElevenLabs for voice, narration, dictation, and music. Dictation streams microphone audio from your browser to ElevenLabs.",
                },
                {
                    kind: "p",
                    text: "Galleo does not train its own AI models on your content. External providers have their own processing, abuse-monitoring, retention, and data-use terms. These vary by provider, API product, account settings, and agreement. We do not promise that all providers offer zero retention or identical restrictions on model training.",
                },
                {
                    kind: "p",
                    text: "ElevenLabs’ terms allow use of customer content to improve its models unless the applicable account opts out or other contractual restrictions apply. We do not make a service-wide guarantee that external providers exclude all model-training use. Provider details are available at https://elevenlabs.io/docs/help-center/legal/is-my-data-used-to-improve-eleven-labs-ai-models.",
                },
                {
                    kind: "p",
                    text: "Use AI features only for material you are authorized to disclose. Review generated output before relying on it or sharing it.",
                },
            ],
        },
        {
            id: "processors",
            heading: "Service providers",
            blocks: [
                {
                    kind: "p",
                    text: "We use the following providers for the activities described below. A provider receives information relevant to the service it performs; not every provider receives every category of information.",
                },
                {
                    kind: "table",
                    columns: ["Provider", "Purpose", "Information involved"],
                    rows: [
                        [
                            "Google",
                            "AI generation, embeddings, and optional Google integrations",
                            "Relevant prompts, content, reference material, generated media, and information authorized through sign-in or a connected integration",
                        ],
                        [
                            "Anthropic, OpenAI, xAI",
                            "AI language tasks when selected",
                            "Relevant prompts, content, and reference material",
                        ],
                        [
                            "ElevenLabs",
                            "Voice, narration, dictation, and music",
                            "Relevant text, audio, voice instructions, and generated media",
                        ],
                        [
                            "Render, Neon, Cloudflare",
                            "Hosting, database, and network services",
                            "Stored service data and request information needed to host and deliver Galleo",
                        ],
                        [
                            "Stripe",
                            "Payments and subscriptions",
                            "Billing and payment details, customer references, and subscription information",
                        ],
                        [
                            "Resend",
                            "Service, verification, and invitation email",
                            "Recipient addresses and message content, which may include invitation details",
                        ],
                        [
                            "PostHog",
                            "Product analytics and masked session recordings",
                            "Usage events, identifiers, device and request information, and masked interaction recordings",
                        ],
                        [
                            "Unsplash, Pexels, Pixabay, Openverse, Iconify",
                            "Stock-media and icon search",
                            "Search terms, including terms derived from content when you request a search",
                        ],
                    ],
                },
            ],
        },
        {
            id: "sharing",
            heading: "Sharing and disclosure",
            blocks: [
                {
                    kind: "p",
                    text: "We share information with service providers as needed to operate Galleo, with collaborators and audiences under the access settings you choose, and when reasonably necessary to comply with law, protect rights or safety, or investigate misuse. We may disclose information in connection with a merger, financing, acquisition, or transfer of business assets, subject to applicable protections and notice requirements.",
                },
                {
                    kind: "p",
                    text: "We do not sell personal information or share it for cross-context behavioral advertising. A published link may be accessible to anyone with its address, depending on its access settings. Published pieces display their current content, so later edits can change what readers see. People with access may download or retain copies that we cannot recall.",
                },
            ],
        },
        {
            id: "connected-apps",
            heading: "Connected apps",
            blocks: [
                {
                    kind: "p",
                    text: "When you authorize an external app or AI client, it can access information and perform actions within the permissions you grant. Review the requested permissions before connecting an app. You can revoke a connection in your account settings. Revocation stops future authorized access but does not delete information already received by the external service. Its use of that information is governed by its own terms and privacy policy.",
                },
            ],
        },
        {
            id: "analytics",
            heading: "Product and audience analytics",
            blocks: [
                {
                    kind: "p",
                    text: "Our explicit product events are designed to record identifiers, categories, counts, durations, and size bands rather than prompts, document text, titles, filenames, email addresses, or search words. Website analytics can also receive page addresses, referring pages, campaign parameters, and technical request information.",
                },
                {
                    kind: "p",
                    text: "PostHog is a third-party analytics provider, even though analytics requests pass through a Galleo endpoint. Where session recording is enabled on the app or marketing site, text and inputs are masked. Recording is disabled in the editor and the published viewer.",
                },
                {
                    kind: "p",
                    text: "Optional browser product analytics and session recording are disabled in the published viewer. The service still records link audience activity for the author as described under Information we collect. Pseudonymous data is not necessarily anonymous.",
                },
            ],
        },
        {
            id: "cookies",
            heading: "Cookies, browser storage, and choices",
            blocks: [
                {
                    kind: "p",
                    text: "We use a session cookie to keep you signed in and short-lived cookies for authentication flows. Browser storage also holds preferences such as your app theme and may hold unfinished local work. Product analytics on the app and marketing site can use browser storage.",
                },
                {
                    kind: "p",
                    text: "Optional browser analytics and masked session recordings on our app and marketing site remain off until you choose Accept analytics. Choose Essential only to decline, or reopen Privacy settings to change your choice at any time. Your choice is stored in this browser and does not disable server-side operational analytics, billing records, security logging, or published-link audience records. You can also control cookies and site storage in your browser. Blocking essential storage may prevent sign-in or other requested features from working. We do not use Galleo for cross-context behavioral advertising; browser Do Not Track signals do not currently change the service’s behavior. Applicable privacy rights remain available through our contact address.",
                },
            ],
        },
        {
            id: "retention",
            heading: "Retention and deletion",
            blocks: [
                {
                    kind: "p",
                    text: "We retain account information and workspace content while needed to provide the service and handle account requests. Moving a piece to Trash does not permanently delete it, and Trash is not automatically emptied. Deleting an artifact does not necessarily remove separately stored media, shared content, or copies already received by others.",
                },
                {
                    kind: "p",
                    text: "Retention depends on the kind of record and why it is needed. Support records are kept as needed to resolve requests and document their outcome. Billing and credit records may be retained for accounting, fraud prevention, disputes, and legal obligations. Operational and security records may be retained to investigate failures or misuse. Where we must preserve records for a legal claim or obligation, access and use are limited to that purpose.",
                },
                {
                    kind: "p",
                    text: "Deleted information may remain temporarily in backups until those copies are overwritten or expire under the provider’s backup process. A deletion request may require separate handling of stored files and external-provider records. We do not promise immediate removal from every backup or from independent copies held by recipients.",
                },
                {
                    kind: "p",
                    text: "Contact us to request account deletion or a copy of your personal information. We verify requests as necessary to protect your account and other people’s information. Content belonging to a shared workspace may remain with that workspace. Resolve active subscriptions and export work you need before requesting permanent deletion; restoration may not be available afterward.",
                },
            ],
        },
        {
            id: "rights",
            heading: "Your privacy rights",
            blocks: [
                {
                    kind: "p",
                    text: "Depending on where you live and the circumstances, you may have rights to access or obtain a copy of your personal information, correct it, request deletion, restrict processing, object to certain uses, receive portable data, withdraw consent, or appeal a decision about a request. You may also complain to your applicable privacy or data-protection authority.",
                },
                {
                    kind: "p",
                    text: "Send requests to support@galleo.app. We respond without undue delay and within the deadline required by applicable law. Where a permitted extension is needed, we explain it and notify you within the required period. We may request information to verify your identity or an authorized agent’s authority. We do not unlawfully discriminate against people for exercising their privacy rights.",
                },
                {
                    kind: "p",
                    text: "If your request concerns information controlled by your employer, another workspace owner, or a publisher using Galleo, we may direct you to that organization and assist it as required.",
                },
            ],
        },
        {
            id: "international",
            heading: "International processing",
            blocks: [
                {
                    kind: "p",
                    text: "Galleo uses providers that may process information in the United States and other countries, including countries different from where you live. Those countries may have different data-protection laws. Where a provider’s standard data-processing terms apply, the transfer protections in those terms apply to its processing. Depending on the provider and the transfer, these protections can include adequacy decisions, the European Commission’s standard contractual clauses, and UK transfer addenda. For example, our hosting providers publish their terms at https://render.com/dpa and https://neon.com/dpa. These arrangements do not mean that your information stays in your home country. Contact us for information about the safeguards applicable to your data.",
                },
            ],
        },
        {
            id: "security",
            heading: "Security",
            blocks: [
                {
                    kind: "p",
                    text: "We use measures such as encrypted transport, hashed credentials, access controls, and workspace permissions to protect the service. No service can guarantee absolute security. Keep your sign-in details private and contact us promptly if you suspect unauthorized access.",
                },
                {
                    kind: "p",
                    text: "Media files may be served from unguessable URLs that do not independently check the viewer’s account or the piece’s sharing permissions. Anyone who obtains such a URL may be able to access the file. Restricting or removing a shared page does not necessarily revoke an already obtained media URL.",
                },
            ],
        },
        {
            id: "children",
            heading: "Children",
            blocks: [
                {
                    kind: "p",
                    text: "Galleo is intended for people aged 18 or older. We do not knowingly collect personal information from children below that age. If you believe a child has supplied personal information in violation of this policy, contact us so we can investigate and take appropriate action.",
                },
            ],
        },
        {
            id: "changes",
            heading: "Changes to this policy",
            blocks: [
                {
                    kind: "p",
                    text: "We may update this policy when our practices, service, or legal requirements change. The dates at the top identify the current version. We provide notice of material changes as required by law, which may include an in-product notice or email.",
                },
            ],
        },
    ],
};

const TERMS: LegalDoc = {
    title: "Terms of Service",
    effective: "October 8, 2026",
    updated: "October 8, 2026",
    intro: "These Terms of Service govern your use of Galleo and form an agreement between you and GalleoApp Inc. Please read them together with our Privacy Policy at https://galleo.app/privacy.",
    sections: [
        {
            id: "account",
            heading: "1. Agreement, eligibility, and accounts",
            blocks: [
                {
                    kind: "p",
                    text: "By accepting these terms during registration or otherwise using Galleo where legally sufficient acceptance applies, you agree to them. You must be at least 18 years old and legally able to enter this agreement. If you use Galleo for an organization, you represent that you have authority to bind it.",
                },
                {
                    kind: "p",
                    text: "Provide accurate account information, protect your credentials, and notify us of suspected unauthorized access. You are responsible for activity you authorize through your account and connected apps. Do not share a login to bypass membership or usage limits.",
                },
            ],
        },
        {
            id: "workspaces",
            heading: "2. Workspaces and permissions",
            blocks: [
                {
                    kind: "p",
                    text: "Workspace owners and administrators can manage membership, settings, billing, and content permissions within the controls the service provides. They may be able to access or retain workspace content after an individual member leaves. If you join an organization’s workspace, understand its policies before adding information. You may not grant access to information you are not authorized to share.",
                },
            ],
        },
        {
            id: "your-content",
            heading: "3. Your content and our permission to process it",
            blocks: [
                {
                    kind: "p",
                    text: "You retain the rights you hold in content you provide. You grant GalleoApp Inc. and its service providers the permissions needed to host, copy, process, transmit, display, and transform that content to operate the service, perform your instructions, and provide requested features. This permission does not transfer ownership of your content to us.",
                },
                {
                    kind: "p",
                    text: "You are responsible for having the rights and permissions needed for your content, including uploaded files, personal information, voices, images, and third-party material. You are responsible for the accuracy, lawfulness, and suitability of what you publish.",
                },
            ],
        },
        {
            id: "generated-output",
            heading: "4. AI output and third-party material",
            blocks: [
                {
                    kind: "p",
                    text: "To the extent permitted by law and subject to third-party rights and applicable provider terms, you may use the output generated for you. To the extent GalleoApp Inc. has transferable rights in that output, we assign those rights to you. This does not grant rights in third-party content, the service itself, or material you were not entitled to submit.",
                },
                {
                    kind: "p",
                    text: "AI output can be inaccurate, incomplete, non-unique, or unsuitable. Similar output may be generated for other people. We do not guarantee that output is exclusive, qualifies for copyright protection, or is free of third-party claims. Review facts, calculations, permissions, attribution, and suitability before relying on or sharing output. Galleo does not replace professional advice.",
                },
                {
                    kind: "p",
                    text: "Stock media, fonts, and other third-party materials may carry their own license conditions. You must comply with any applicable license, attribution, and usage restrictions.",
                },
            ],
        },
        {
            id: "ai-providers-and-training",
            heading: "5. AI and external services",
            blocks: [
                {
                    kind: "p",
                    text: "AI features send relevant prompts, content, and reference material to the providers handling your request. The provider categories and data-use considerations are described at https://galleo.app/privacy#ai-providers. Galleo does not train its own AI models on your content. External-provider processing and any model-training use depend on their terms, account settings, and applicable agreements.",
                },
                {
                    kind: "p",
                    text: "External apps and connected services have their own terms and privacy policies. Review their permissions before connecting them. Their availability and actions are outside our control, except to the extent applicable law makes us responsible.",
                },
            ],
        },
        {
            id: "plans-credits-and-payment",
            heading: "6. Plans, payment, cancellation, and credits",
            blocks: [
                {
                    kind: "p",
                    text: "Available features, prices, billing periods, taxes, and allowances are displayed in the product and checkout. Paid subscriptions renew automatically at the disclosed interval until cancelled. You authorize the disclosed charges and agree to keep billing information current.",
                },
                {
                    kind: "p",
                    text: "Cancel through the billing controls before the next renewal to stop that renewal. Cancellation ordinarily takes effect at the end of the paid billing period, as shown in your billing settings, and does not itself delete your content or account. For a voluntary refund, contact support@galleo.app with your account and purchase details. We review these requests case by case; a request does not create an automatic right to a refund. Any cancellation, withdrawal, or refund rights required by applicable law are preserved.",
                },
                {
                    kind: "p",
                    text: "AI actions can consume credits shared by the workspace. Credits are service-use allowances, not money or property, and cannot be transferred or redeemed for cash. Grant amounts, rollover limits, and purchased-credit rules are shown in the plan or purchase terms. Statutory refund rights still apply.",
                },
                {
                    kind: "p",
                    text: "We may change future prices or plan terms with notice as required by law. Changes apply at the time stated in the notice and do not remove mandatory consumer rights. If you do not accept a future change, you may cancel before it takes effect.",
                },
            ],
        },
        {
            id: "acceptable-use",
            heading: "7. Acceptable use",
            blocks: [
                {
                    kind: "list",
                    items: [
                        "Do not violate the law, another person’s privacy, or intellectual-property rights.",
                        "Do not exploit or sexualize children, distribute malicious code, commit fraud, threaten or unlawfully harass people, or impersonate someone deceptively.",
                        "Do not upload, clone, or use a voice or likeness without the required authority and consent.",
                        "Do not gain unauthorized access, misuse credentials, interfere with the service, or circumvent access, security, billing, or usage limits.",
                        "Do not use the service in violation of applicable export controls, sanctions, or restrictions imposed by relevant providers.",
                    ],
                },
                {
                    kind: "p",
                    text: "We may investigate misuse, restrict access, or remove content when reasonably necessary to address violations, legal requirements, security, or harm, subject to applicable rights and notice obligations.",
                },
            ],
        },
        {
            id: "publishing",
            heading: "8. Sharing and publishing",
            blocks: [
                {
                    kind: "p",
                    text: "You choose the audience and access settings for your work. Published links display the current content, so later edits can change what readers see. Depending on access settings, anyone with a link may be able to view or copy the content. Do not publish information you are not authorized to disclose.",
                },
                {
                    kind: "p",
                    text: "A link stops serving when it is removed, the piece is trashed or permanently deleted, or the owning workspace no longer has the plan entitlement required for public links. Removing a link does not recall copies already obtained, and media URLs may remain accessible separately as described in our Privacy Policy.",
                },
            ],
        },
        {
            id: "our-service",
            heading: "9. Rights in the service",
            blocks: [
                {
                    kind: "p",
                    text: "GalleoApp Inc. and its licensors retain rights in the software, service design, branding, and other materials we provide, excluding your content and rights expressly granted to you. Subject to these terms and your plan, you may access and use the service for its intended purposes. You may not copy or commercially exploit the service itself except as permitted by us or applicable law.",
                },
            ],
        },
        {
            id: "availability",
            heading: "10. Availability and changes",
            blocks: [
                {
                    kind: "p",
                    text: "We work to provide a reliable service, but do not promise uninterrupted availability, error-free operation, or compatibility with every third-party service. Features may change as the product develops. We provide notice of material changes, discontinuation, and any export opportunity where required by law or an applicable agreement. Keep copies of work you need independently of the service.",
                },
            ],
        },
        {
            id: "termination",
            heading: "11. Suspension and ending use",
            blocks: [
                {
                    kind: "p",
                    text: "You may stop using Galleo and cancel a subscription through the available controls. Contact us for account deletion or export requests. Export work you need before permanent deletion; we do not promise a recovery window afterward. Shared-workspace content may remain with that workspace.",
                },
                {
                    kind: "p",
                    text: "We may suspend or terminate access for material breaches, nonpayment, security risks, legal requirements, or other lawful reasons. Where reasonably possible and consistent with safety and legal obligations, we provide notice and an opportunity to resolve the issue. Suspension does not remove statutory refund rights.",
                },
                {
                    kind: "p",
                    text: "Terms that by their nature should survive termination, including payment obligations already incurred, ownership provisions, and applicable liability and dispute provisions, continue to apply.",
                },
            ],
        },
        {
            id: "disclaimers",
            heading: "12. Disclaimers",
            blocks: [
                {
                    kind: "p",
                    text: "To the extent permitted by applicable law, the service is provided as available without warranties of uninterrupted operation, error-free results, merchantability, fitness for a particular purpose, or non-infringement. Mandatory statutory warranties and consumer rights are not excluded. You are responsible for reviewing generated material before use.",
                },
            ],
        },
        {
            id: "liability",
            heading: "13. Liability",
            blocks: [
                {
                    kind: "p",
                    text: "To the extent permitted by applicable law, neither party is liable under these terms for indirect or consequential losses. GalleoApp Inc.’s aggregate liability arising out of the service is limited to the greater of the fees you paid for the affected service in the 12 months before the event giving rise to the claim or US$100. These limits do not apply to fraud or any liability that applicable law does not allow to be excluded or limited.",
                },
            ],
        },
        {
            id: "governing-law",
            heading: "14. Governing law and disputes",
            blocks: [
                {
                    kind: "p",
                    text: "Delaware law governs these terms, without regard to its conflict-of-laws rules, and disputes are subject to the competent state and federal courts in Delaware. Mandatory consumer protections and any right to bring a claim in a local court that cannot lawfully be excluded remain unaffected. These terms do not require arbitration or waive class-action rights.",
                },
            ],
        },
        {
            id: "changes",
            heading: "15. Changes and general terms",
            blocks: [
                {
                    kind: "p",
                    text: "We may update these terms, with notice and an effective date for material changes as required by law. Where renewed acceptance is required, we will request it. Changes do not retroactively remove rights that applicable law protects.",
                },
                {
                    kind: "p",
                    text: "If a provision is unenforceable, the remaining provisions continue to apply to the extent permitted by law. Failure to enforce a provision is not a waiver. These terms and any applicable order or separately agreed terms form the agreement for the service; a separately signed agreement controls to the extent it expressly conflicts with these terms.",
                },
            ],
        },
        {
            id: "contact",
            heading: "16. Contact",
            blocks: [
                {
                    kind: "p",
                    text: "Questions, privacy requests, and legal notices may be sent to GalleoApp Inc. at support@galleo.app. To report suspected copyright infringement, identify the protected work, the material at issue and its location, your contact information, and the basis for your request.",
                },
            ],
        },
    ],
};

const DOCS: Record<LegalDocId, LegalDoc> = { privacy: PRIVACY, terms: TERMS };

const rule = "calc(var(--border-width) * 2) solid var(--color-ink)";
const PROSE_LINK =
    /(https:\/\/[^\s]+[a-zA-Z0-9/#]|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;

const Prose: Component<{ text: string }> = (props) => (
    <Index each={props.text.split(PROSE_LINK)}>
        {(part) => (
            <Show when={part().startsWith("https://") || part().includes("@")} fallback={part()}>
                <a
                    class="text-accent underline underline-offset-4 break-words"
                    href={part().startsWith("https://") ? part() : `mailto:${part()}`}
                >
                    {part()}
                </a>
            </Show>
        )}
    </Index>
);

// Static content, so a plain switch reads better here than a reactive Switch/Match chain.
function blockView(block: Block): JSX.Element {
    switch (block.kind) {
        case "p":
            return (
                <p class="mt-5 leading-relaxed text-soft">
                    <Prose text={block.text} />
                </p>
            );
        case "lead":
            return (
                <p class="mt-5 leading-relaxed text-soft">
                    <strong class="text-ink font-bold">{block.label}</strong>{" "}
                    <Prose text={block.text} />
                </p>
            );
        case "list":
            return (
                <ul class="mt-5 space-y-3 text-soft">
                    <For each={block.items}>
                        {(item) => (
                            <li class="flex gap-3 leading-relaxed">
                                <span class="text-accent" aria-hidden="true">
                                    ✺
                                </span>
                                <span>
                                    <Prose text={item} />
                                </span>
                            </li>
                        )}
                    </For>
                </ul>
            );
        case "table":
            return (
                <div
                    class="mt-6 overflow-x-auto"
                    style={{ border: rule, "border-radius": "var(--radius)" }}
                >
                    <table class="w-full min-w-168 border-collapse text-left text-sm">
                        <thead>
                            <tr class="band-ink">
                                <For each={block.columns}>
                                    {(col) => (
                                        <th class="lab px-4 py-3 align-bottom font-normal">
                                            {col}
                                        </th>
                                    )}
                                </For>
                            </tr>
                        </thead>
                        <tbody>
                            <For each={block.rows}>
                                {(row) => (
                                    <tr style={{ "border-top": rule }}>
                                        <For each={row}>
                                            {(cell, i) => (
                                                <td
                                                    class="px-4 py-3 align-top leading-relaxed"
                                                    classList={{
                                                        "text-ink font-bold": i() === 0,
                                                        "text-soft": i() > 0,
                                                    }}
                                                >
                                                    {cell}
                                                </td>
                                            )}
                                        </For>
                                    </tr>
                                )}
                            </For>
                        </tbody>
                    </table>
                </div>
            );
    }
}

export const LegalPage: Component<{ doc: LegalDocId }> = (props) => {
    const doc = (): LegalDoc => DOCS[props.doc];
    return (
        <div class="web h-full w-full overflow-y-auto bg-canvas font-body text-ink">
            <header
                class="sticky top-0 z-50"
                style={{ background: "var(--color-canvas)", "border-bottom": rule }}
            >
                <div class="max-w-[1280px] mx-auto px-5 md:px-8 h-16 flex items-center justify-between gap-4">
                    <BrandLink href="/" />
                    <nav class="hidden md:flex items-center gap-8 lab">
                        <For each={LEGAL_DOC_IDS}>
                            {(id) => (
                                <a
                                    href={LEGAL_PATHS[id]}
                                    aria-current={id === props.doc ? "page" : undefined}
                                    class="transition-colors"
                                    classList={{
                                        "text-accent": id === props.doc,
                                        "hover:text-accent": id !== props.doc,
                                    }}
                                >
                                    {DOCS[id].title}
                                </a>
                            )}
                        </For>
                    </nav>
                    <AuthCta />
                </div>
            </header>

            <main class="max-w-[1280px] mx-auto px-5 md:px-8 py-12 md:py-20">
                <div class="lab text-accent mb-4">Legal</div>
                <h1 class="display text-4xl md:text-6xl">{doc().title}</h1>
                <div class="lab text-muted mt-8 flex flex-wrap gap-x-8 gap-y-3">
                    <Show when={doc().effective}>
                        {(effective) => (
                            <span>
                                Effective date: <Prose text={effective()} />
                            </span>
                        )}
                    </Show>
                    <span>
                        Last updated: <Prose text={doc().updated} />
                    </span>
                </div>

                <div class="grid lg:grid-cols-12 gap-10 lg:gap-14 mt-12 md:mt-16">
                    <nav aria-label="On this page" class="lg:col-span-4 xl:col-span-3">
                        <div class="lg:sticky lg:top-24">
                            <div class="lab text-muted mb-4">On this page</div>
                            <ol class="space-y-2.5 text-soft">
                                <For each={doc().sections}>
                                    {(section) => (
                                        <li>
                                            <a
                                                href={`#${section.id}`}
                                                class="hover:text-accent transition-colors"
                                            >
                                                {section.heading}
                                            </a>
                                        </li>
                                    )}
                                </For>
                            </ol>
                        </div>
                    </nav>

                    {/* min-w-0: a grid item defaults to min-width:auto, which would let the
                        sub-processor table's min width widen the whole column past the viewport */}
                    <article class="lg:col-span-8 xl:col-span-9 min-w-0 max-w-[68ch]">
                        <p class="mt-8 text-lg leading-relaxed text-soft">
                            <Prose text={doc().intro} />
                        </p>

                        <For each={doc().sections}>
                            {(section) => (
                                <section class="mt-12 md:mt-14">
                                    <h2
                                        id={section.id}
                                        class="sec-title text-2xl md:text-3xl scroll-mt-24"
                                    >
                                        <a href={`#${section.id}`} class="hover:text-accent">
                                            {section.heading}
                                        </a>
                                    </h2>
                                    <For each={section.blocks}>{(block) => blockView(block)}</For>
                                </section>
                            )}
                        </For>
                    </article>
                </div>
            </main>

            <footer class="max-w-[1280px] mx-auto px-5 md:px-8 pb-16 md:pb-20">
                <div
                    class="pt-7 flex flex-col sm:flex-row items-center justify-between gap-4 lab text-muted"
                    style={{ "border-top": rule }}
                >
                    <span>© 2026 Galleo · Decks, docs and sites from one source.</span>
                    <span class="flex items-center gap-6">
                        <a href="/" class="hover:text-accent transition-colors">
                            Home
                        </a>
                        <For each={LEGAL_DOC_IDS}>
                            {(id) => (
                                <a
                                    href={LEGAL_PATHS[id]}
                                    class="hover:text-accent transition-colors"
                                >
                                    {DOCS[id].title}
                                </a>
                            )}
                        </For>
                    </span>
                </div>
            </footer>
        </div>
    );
};
