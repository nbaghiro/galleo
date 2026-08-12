// The "grown" demo context: a whole company knowledge base, so the demo workspace has one context
// with many sources and a hundred-plus chunks. Everything stays consistent with the Lumen facts
// in seed-contexts.ts (prices, specs, dates), so cross-source retrieval demos hold together.

const section = (title: string, lines: string[]): string => `## ${title}\n\n${lines.join("\n")}`;

export const LUMEN_HANDBOOK = `# Lumen — company handbook (v6, July)

Lumen makes quiet machines for healthy rooms. One product today (Lumen One), a second in
development (Lumen Mini, working title). Founded 2023, 31 people, remote-first with a Lisbon
studio. This handbook is the operating manual: how we decide, how we communicate, and what we
refuse to do.

${section("Mission and the one-sentence test", [
    "Mission: make clean air unremarkable — something a home just has, like hot water.",
    "Every project must pass the one-sentence test: explain the user benefit in one sentence",
    "without the words smart, platform, or ecosystem. If you can't, the project is cut.",
    "We sell hardware at honest margins. We do not sell data; the device has no microphone,",
    "no camera, no wifi. This is a product decision first and a values decision second:",
    "the quietest machine is one that has nothing to phone home about.",
])}

${section("How we decide", [
    "Decisions live in decision docs — one page, five headings: context, options, call,",
    "owner, revisit-by date. A decision without a revisit date is a belief, not a decision.",
    "Disagree in the doc, commit in the room. Re-litigating a decided call without new data",
    "is the one meeting behavior we escalate on.",
    "Default owner: the person closest to the customer consequence, not the most senior.",
    "Anything reversible in under a week doesn't need a doc; just do it and note it in the",
    "weekly ship log.",
])}

${section("Communication norms", [
    "Async first. A meeting needs an agenda in the invite or it gets declined guilt-free.",
    "Write plainly. Internal writing follows the same voice rules as external copy:",
    "short sentences, concrete nouns, numbers rounded honestly.",
    "Response expectations: same-day for customer-impacting threads, 48h for everything else.",
    "No DMs for decisions. If it changed a plan, it happened in a channel.",
    "The weekly ship log (Fridays) lists what actually shipped — not what progressed.",
])}

${section("Product principles", [
    "One dial beats three menus. Physical controls, visible state, no app required — ever.",
    "Quiet is the feature. Every engineering tradeoff resolves toward the lower decibel.",
    "Repairable by a tired person at 11pm: filter changes take one hand and no tools.",
    "We publish real numbers (CADR 210 m³/h, 18 dB night mode) and never invent categories.",
    "If a feature needs explaining twice, the feature is wrong, not the explanation.",
])}

${section("Support philosophy", [
    "Support is the product's second interface. Target: first response under 4 business hours,",
    "resolution under 2 days. NPS sits at 61; the number we actually watch is contact rate —",
    "currently 3.1 contacts per 100 units in the first 90 days.",
    "Refunds are granted, not fought. The 60-night return policy is honored to the letter and",
    "in spirit; a customer arguing edge cases has already told us the product missed.",
    "Every support agent ships a weekly 'voice of customer' note — three quotes, verbatim.",
])}

${section("Hiring and the bar", [
    "We hire for evidence of finishing: portfolios of shipped things beat credentials.",
    "Every candidate does a paid work sample scoped to under four hours; nobody whiteboards.",
    "References are called, and we ask one question: 'would you work for them?'",
    "Offers state salary in the first call. Negotiation theater wastes everyone's week.",
])}

${section("What we refuse to do", [
    "No subscriptions for features the hardware already has. The filter subscription exists",
    "because filters are consumable, and it is cancellable in two clicks.",
    "No dark patterns: the unsubscribe link is in the first screen of every email.",
    "No Black Friday pricing games. The pre-order discount is the only discount, all year.",
    "No press embargo exclusives that trade access for coverage tone.",
])}

${section("Rituals and cadence", [
    "Monday: 25-minute all-hands, standing agenda — numbers (5 min), one customer story told",
    "verbatim by support (5 min), what's blocking whom (15 min). No slides, ever.",
    "Wednesday: office hours with the founders, open calendar, no agenda required. Half the",
    "product roadmap traces back to a Wednesday conversation nobody scheduled.",
    "Friday: ship log posted by 4pm Lisbon; the week ends when it's posted, not before.",
    "Quarterly: a two-day 'teardown week' where every team dismantles one of its own processes",
    "and rebuilds or deletes it. Support killed its phone line this way; nobody misses it.",
    "Annually: the whole company spends one day doing support tickets. The CEO's macro",
    "acceptance rate is tracked and mocked.",
])}

${section("Budgets and spending", [
    "Anyone can spend up to €500 on anything work-related without asking; post the receipt",
    "and one sentence of reasoning in the spend channel. Abuse rate to date: zero.",
    "Tools require a one-line decision doc if they introduce a recurring cost — the recurring",
    "part is the decision, not the amount.",
    "Travel: trains beat planes under 6 hours; nobody red-eyes to save the company €90.",
    "Hardware lab spending is pre-approved to €2,000/month; broken prototypes are a cost of",
    "learning, and the lab wall of failed rotors is a monument, not a shame board.",
])}

${section("Security and privacy posture", [
    "The product's privacy story is structural: no radio, no mic, no camera means the",
    "device cannot leak what it cannot sense. Keep it that way in every roadmap conversation.",
    "Customer data we do hold: orders, support threads, subscription state. Retention is",
    "24 months post-last-order, then automated erasure; the script runs monthly and its log",
    "is reviewed like a financial control.",
    "Access: support sees order and thread data; nobody sees payment numbers (processor-side",
    "only). Every access grant has an owner and an expiry — 'permanent' is not an expiry.",
    "Incident rule: customers hear from us within 72 hours of a confirmed exposure, in plain",
    "language, with what we know, what we don't, and what changes. Draft templates live in",
    "the crisis folder so nobody writes them at 2am.",
])}

${section("Glossary (words that mean something specific here)", [
    "Duo — one HEPA+carbon filter unit. MPPS — most penetrating particle size, 0.3 µm.",
    "Night/Standard/Boost — the three dial stops; capitalized because they're product nouns.",
    "Ship log — the Friday list of shipped things. Decision doc — one page, five headings.",
    "Contact rate — support contacts per 100 units in the first 90 days; the health metric.",
    "Batch code — the four-character production run stamp inside the base; first thing",
    "support asks for on hardware tickets.",
    "The teaspoon — the visual of a filter's lifetime dust capture; our most-quoted image.",
])}`;

export const LUMEN_SUPPORT = `# Lumen One — support playbook (agent copy, August)

The voice: a calm, competent neighbor. Never scripted-sounding, never defensive. Apologize once,
fix it fast, write like a person.

${section("Issue 1 — amber filter LED earlier than expected", [
    "The LED shifts green→amber at 15% filter life. At 8 h/day that's about month five; heavy",
    "use (24/7, wildfire weeks, renovation dust) can bring it to month three. That is the filter",
    "doing its job, not failing.",
    "Macro: 'The light is telling the truth — your air had more to catch than average. Heavy-use",
    "homes hit amber early. If it feels too early, reply with your typical daily hours and I'll",
    "sanity-check it; if a filter genuinely underperformed we replace it free.'",
    "Escalate if: amber within 30 days at normal use → ship a free Filter Duo, flag batch code.",
])}

${section("Issue 2 — 'it's louder than 18 dB'", [
    "18 dB is Night mode measured at 1 m in a treated room. Standard is 31 dB, Boost 44 dB.",
    "Most 'too loud' tickets are units set to Standard, or placed on a resonant surface",
    "(bookshelf acting as a soundboard).",
    "Macro: 'Two quick checks: the dial's first stop is Night — the other modes are meant to be",
    "audible. And try it on the floor or a rug rather than furniture; a shelf can amplify the",
    "motor like a guitar body. If Night mode still sounds like more than a whisper from across",
    "the room, video me 10 seconds and I'll swap the unit.'",
    "Escalate if: rattle/click on Night → likely fan imbalance, prepaid swap, no return needed.",
])}

${section("Issue 3 — shipping delays on pre-orders", [
    "Pre-orders ship in stated 6 weeks; the current batch is on time. When a batch slips we",
    "email before the customer notices — if someone writes first, we already failed.",
    "Macro: 'Your unit is in the current batch, on schedule for the week of [date]. You'll get",
    "tracking the moment the label prints. If the date moves even a day, the email comes from",
    "us before you have to ask.'",
    "Never: blame the freight company, promise a specific day before label print.",
])}

${section("Issue 4 — returns inside 60 nights", [
    "Policy: 60 nights, free label, no restocking fee, refund on carrier scan (not warehouse",
    "receipt). Ask the reason once, lightly — it feeds the product log — then process.",
    "Macro: 'Done — label attached, refund releases the moment the carrier scans it. If you're",
    "open to sharing what didn't fit, one line helps us build a better machine. Either way,",
    "thanks for giving it a real try.'",
    "Data note: top return reasons last quarter — 41% 'room larger than 38 m²', 22% 'expected",
    "app control', 15% gift/duplicate.",
])}

${section("Issue 5 — filter subscription management", [
    "Pause, skip, or cancel is two clicks from the account page or one reply to any filter",
    "email. Agents can do it in-thread; never send someone to a portal to leave.",
    "Macro: 'Paused/cancelled, effective now — confirmation in your inbox. You can restart",
    "any time and the quarterly price stays $12 whenever you do.'",
])}

${section("Warranty and swaps", [
    "3 years, transferable, receipt optional if the serial checks out. Swap-first policy:",
    "confirmed hardware faults get a replacement shipped before the faulty unit returns.",
    "Fault taxonomy for the log: FAN (noise/imbalance), LED (indicator wrong), PWR (dead/",
    "intermittent), SENS (auto mode misreads), COSM (finish/fit). One code per ticket.",
])}

${section("Escalation ladder", [
    "L1 agent → L2 (hardware triage, video review) → engineering on-call (48h SLA).",
    "Anything safety-adjacent (smell of burning, hot casing) skips the ladder: immediate",
    "recall-track flag, prepaid return, engineering same-day. Zero incidents to date;",
    "the process exists so that stays true.",
])}

${section("Issue 6 — auto mode reads the room wrong", [
    "Auto mode holds Night until the particle sensor sees a sustained spike, then steps up.",
    "Two honest limitations: cigarette smoke directly beside the intake saturates the sensor",
    "(it steps to Boost and stays there ~20 min), and very dry winter air can read slightly",
    "high for an hour after heating starts.",
    "Macro: 'Auto is deliberately slow to step down — it waits for the air to be boring for",
    "ten straight minutes before quieting, so it never yo-yos while you cook. If it's staying",
    "loud in visibly clean air for more than an hour, power-cycle it: the sensor re-baselines",
    "in about ten minutes and that clears 90% of these.'",
    "Escalate if: re-baseline doesn't hold twice → SENS code, swap-first.",
])}

${section("Issue 7 — arrived with cosmetic damage", [
    "Crushed corner on the box is common; damage to the unit itself is under 0.4%.",
    "Macro: 'That's not the condition it should reach you in. Photo of the mark and the box",
    "corner, and I'll ship a replacement shell panel today — or a full unit swap if you'd",
    "rather, your call. Keep the current one running meanwhile; no need to box anything",
    "until the replacement lands.'",
    "Never: ask the customer to argue with the carrier — that's our fight, not theirs.",
    "Log COSM with the batch code; three COSM on one batch triggers a packaging review.",
])}

${section("Issue 8 — voltage and international use", [
    "The PSU is 100–240 V auto-switching; only the plug shape differs by region. Moving a",
    "unit between the EU and UK needs a €6 cable, not a converter.",
    "Macro: 'Good news — the machine itself doesn't care about the voltage. You need the",
    "local cable, not a converter brick: link below, or any C7 figure-eight cable you",
    "already own works.'",
    "Warranty stays valid across regions; returns route to the nearest hub (Lisbon or Leeds).",
])}

${section("Refund edge cases, decided", [
    "Night 61: honor it. The policy is a promise, not a stopwatch. Same for 65; at 90+ offer",
    "a replacement or credit first, refund if pressed, flag for pattern only.",
    "Gifts: receipts optional, serial suffices; refund to the purchaser, replacement to",
    "the recipient — never make a gift awkward.",
    "Bundle returns: hardware back, opened Duos stay theirs, refund the bundle minus $12 per",
    "opened Duo at most; when in doubt round toward the customer.",
    "Subscription after a return: cancel it proactively in the same action and say so —",
    "a charge after a refund is the single fastest trust-killer we know.",
])}

${section("Tone, shown not told", [
    "Cold: 'Per our policy, your return window has expired.' Ours: 'You're past the 60",
    "nights, but tell me what's wrong first — if it's a fault, the warranty picks up",
    "where the trial ends and that's three years long.'",
    "Cold: 'The product is functioning within specifications.' Ours: 'That level of sound",
    "is what Standard mode makes — the first dial stop is the silent one. If Night still",
    "sounds like anything from across the room, that's not right and I'll swap it.'",
    "Cold: 'We apologize for any inconvenience.' Ours: 'That's on us — here's what I've",
    "done about it, today.'",
    "Sign-offs are human: 'Enjoy the quiet — Rui'. No 'best regards', no ticket numbers",
    "in the salutation.",
])}`;

export const LUMEN_PRODUCT_DOCS = `# Lumen One — product documentation (web copy source)

${section("Setup in three sentences", [
    "Take it out of the box, put it on the floor near where you sleep or work, and plug it in.",
    "Turn the dial to the first stop for Night, second for Standard, third for Boost.",
    "That's the whole setup — the filter is pre-installed and the machine is already running.",
])}

${section("The three modes, honestly", [
    "Night (18 dB, 4.5 W): quieter than rustling bedsheets. Cleans a 38 m² room roughly every",
    "90 minutes. This is the mode most units live in.",
    "Standard (31 dB, 14 W): a soft hum, like a fridge two rooms away. Full room roughly every",
    "35 minutes. Use after cooking or vacuuming.",
    "Boost (44 dB, 27 W): audible on purpose. Full room in about 11 minutes. Use it when smoke",
    "or pollen actually arrives, then step back down.",
])}

${section("The filter, demystified", [
    "One Filter Duo = HEPA-13 layer (99.95% of particles at 0.3 µm) + activated-carbon prefilter",
    "(odors, VOCs). Life is about 6 months at 8 h/day; the LED goes amber at 15% remaining.",
    "Swapping takes one hand: twist the base a quarter-turn, drop the old Duo out, drop the new",
    "one in, twist back. No tools, no alignment, under 20 seconds.",
    "The fabric prefilter face is vacuumable — a monthly pass extends the Duo noticeably.",
    "Subscription: $12/quarter, free shipping, pausable; one-off Duo: $19.",
])}

${section("Placement that actually matters", [
    "Floor beats furniture: shelves resonate, floors don't. Leave a hand's width of clearance",
    "around the intake. Corners are fine; closets are not.",
    "One unit per closed room. Airflow doesn't turn corners well — a hallway unit does not",
    "clean the bedroom behind a door.",
    "Bedrooms: within 2 m of the bed on Night mode gives the cleanest breathing zone while",
    "you sleep, which is where the health evidence is strongest.",
])}

${section("Troubleshooting quicklist", [
    "Won't power on: check the cable seats fully into the base recess — it clicks.",
    "New smell for the first hours: carbon layer off-gassing its packaging; gone within a day.",
    "Ticking on Night: something is touching the casing (curtain, cable) or it sits on a",
    "resonant shelf. Floor it and the tick goes.",
    "LED amber early: heavy particulate season; see the filter section — the LED reads usage,",
    "not calendar time.",
    "Auto-mode misjudging (rare): power-cycle recalibrates the sensor baseline in 10 minutes.",
])}

${section("Spec table (canonical numbers)", [
    "CADR 210 m³/h · coverage 38 m² · HEPA-13 + carbon · 18/31/44 dB · 4.5/14/27 W ·",
    "standby <0.5 W · 46 cm tall · ⌀22 cm · 3.4 kg · cable 1.8 m · CARB compliant ·",
    "Energy Star · Quiet Mark pending · warranty 3 years · returns 60 nights.",
    "These numbers are the only ones marketing may quote. If a page needs a number not on",
    "this line, the page is wrong.",
])}

${section("Care and cleaning", [
    "Monthly: vacuum the fabric prefilter face with a brush attachment — thirty seconds,",
    "extends the Duo's life noticeably in pet homes.",
    "Quarterly: wipe the casing with a barely-damp cloth; the finish hates solvents and",
    "loves boredom. The intake ring pops off with a fingernail for a rinse — fully dry",
    "before it goes back.",
    "Never: run it filterless (the motor is tuned against the Duo's back-pressure), oil",
    "anything, or vacuum the HEPA layer itself — the fibers tear invisibly and the 99.95%",
    "quietly stops being true.",
    "Storing it for a season: run Boost for an hour, bag the Duo separately, and it keeps.",
])}

${section("Living with pets", [
    "Dander is large-particle by HEPA standards — easy capture. The carbon layer handles",
    "the smell nobody admits their house has.",
    "Pet homes hit amber roughly a month earlier; the vacuum-the-prefilter habit claws",
    "most of that back.",
    "Cats sit on it. This is fine: the top surface stays barely warm and the intake is",
    "side-mounted. A cat asleep on a running Lumen One is our most reposted customer photo.",
    "Boost after brushing or litter changes, ten minutes, then back down — the spike is",
    "brief and the machine is faster than the smell.",
])}

${section("Energy costs, computed for you", [
    "Night mode all night, every night: 4.5 W × 8 h × 365 = 13 kWh/year — about €4 or $5",
    "at typical rates. The standby drain (<0.5 W) rounds to under €1.5/year.",
    "Realistic mixed use (Night sleeping, Standard evenings): ~30 kWh/year, a tenner.",
    "For comparison: one incandescent bulb left on the same hours costs 4× more. The",
    "machine's lifetime electricity costs less than two Filter Duos.",
])}

${section("Accessibility notes", [
    "The dial has firm detents — mode changes are countable by feel, no sight needed.",
    "Modes are also distinguishable by ear at close range (deliberately distinct tones).",
    "The filter LED is position-coded, not just color-coded: solid vs slow pulse, so",
    "color-blind users get the same information.",
    "Filter swap requires one hand and no pinch strength: quarter-turn, gravity, drop-in.",
    "We test this with oven mitts on; if it works in mitts it works for most hands.",
])}

${section("FAQ, the real one", [
    "Does it help with cooking smells? Yes — carbon layer plus Boost. Fish is a ten-minute",
    "problem, not an evening one.",
    "Can it run 24/7? Designed for it. Duty cycle is continuous; bearings are rated for",
    "5 years of always-on before audible wear.",
    "Why no air-quality display? Numbers on a box invite staring at anxiety. The machine",
    "responds; you sleep. (Auto mode holds the sensor so you don't have to.)",
    "Ozone? None. No ionizer, no plates, nothing that makes it — verified in CARB testing.",
    "Does it cool or heat? Neither; it moves air gently, less than a desk fan on low.",
    "Loudest honest sentence: Boost is audible on purpose and you'll use it ten minutes",
    "at a time.",
    "Can I use third-party filters? They fit if they copy our dimensions, and the machine",
    "runs — but the 99.95% is our filter's number, and the warranty covers our motor",
    "against our filter's back-pressure, not whatever a marketplace clone measures.",
    "What breaks first? Statistically: nothing in year one (0.4% hardware fault rate);",
    "the fan bearing is the long-run wear item, and it's the swap-first fault we replace",
    "whole units for.",
])}`;

export const LUMEN_RESEARCH = `# Air quality research primer (internal, not medical advice)

Why this document: everyone who writes copy, answers tickets, or briefs press should understand
the actual science at a dinner-party level. Sources on file with the research folder.

${section("PM2.5 in one paragraph", [
    "Particles under 2.5 µm stay airborne for hours and reach deep into lungs; chronic exposure",
    "is associated with cardiovascular and respiratory harm in large cohort studies. Indoor",
    "levels track outdoor air plus indoor sources: cooking (especially searing and frying),",
    "candles, fireplaces, and renovation dust. Cooking spikes routinely hit 10× baseline for",
    "an hour — this surprises people and demos beautifully.",
])}

${section("What HEPA actually does", [
    "HEPA-13 captures 99.95% at 0.3 µm — the hardest size, called MPPS (most penetrating",
    "particle size). Counterintuitively, both larger AND smaller particles capture more easily",
    "(impaction and interception for big, Brownian diffusion for small). So 'captures 99.95%",
    "of particles as small as 0.3 microns' is accurate and legally cleared; 'captures",
    "everything' is neither.",
])}

${section("CADR math anyone can do", [
    "CADR 210 m³/h into a 38 m² room with 2.5 m ceilings (95 m³) = about 2.2 air changes per",
    "hour on the highest tested setting. The often-cited target for meaningful reduction is",
    "2–3 ACH. This is the honest basis of the '38 m²' coverage claim — bigger rooms don't",
    "break the machine, they just dilute the changes per hour.",
    "Night mode moves less air by design; overnight in a closed bedroom it still holds a",
    "measurably lower particle count because the source load is low while you sleep.",
])}

${section("Wildfire smoke guidance (approved framing)", [
    "Smoke is dominantly fine particulate — squarely what HEPA catches. Approved claim:",
    "'captures fine smoke particles (PM2.5)'. Not approved: health outcomes, 'protects your",
    "family from wildfires', or anything implying sealing a leaky house.",
    "Practical guidance we may publish: close windows, run Boost until the visible haze",
    "clears, then Standard; replace the filter sooner after a heavy smoke season.",
])}

${section("What we do not claim", [
    "Viruses: filtration of aerosol carriers is real physics, but outcome claims are medical",
    "claims — never make them. Allergies: 'reduces exposure to common allergens' is the",
    "ceiling. Ozone: Lumen One produces none (no ionizer, by design); saying 'ozone-free'",
    "is cleared and differentiating — several competitors can't say it.",
])}

${section("Numbers that make copy vivid (all cleared)", [
    "A single burnt slice of toast can triple bedroom PM2.5 for an hour.",
    "Indoor air is commonly 2–5× more polluted than outdoor per EPA framing.",
    "People spend ~90% of time indoors; the bedroom is a third of life by hours.",
    "One Filter Duo holds roughly a teaspoon of captured fine dust by end of life —",
    "unglamorous, persuasive.",
])}

${section("VOCs and carbon, honestly", [
    "Volatile organic compounds — solvents, off-gassing furniture, cooking byproducts —",
    "pass through HEPA untouched; that's the carbon layer's job. Activated carbon adsorbs",
    "them until its surface saturates, which is why heavy-VOC homes (fresh renovation,",
    "new furniture) should count filter life in months-of-smell, not the LED alone.",
    "Cleared claim: 'the carbon layer reduces common household odors and VOCs'. Not",
    "cleared: any specific chemical percentages — adsorption varies too much by compound",
    "and humidity to print a number we'd stand behind.",
    "Formaldehyde deserves its own honesty: meaningful reduction needs more carbon mass",
    "than any consumer purifier carries. If a customer's concern is formaldehyde",
    "specifically, the honest answer is source removal and ventilation first, us second.",
])}

${section("Humidity, mold, and what we are not", [
    "A purifier removes airborne mold spores (HEPA catches them easily) but does nothing",
    "about the damp wall producing them. Support sees this weekly: the machine helps the",
    "symptom while the bathroom grows the cause.",
    "Approved framing: 'captures airborne spores; fixing damp is the real cure and we'd",
    "rather tell you that than sell you serenity.' This sentence has been quoted in two",
    "reviews as a reason to trust us.",
    "We do not dehumidify, humidify, or measure humidity. When asked for a combo device:",
    "'combining a water tank with a paper filter is how you get a mold farm with a fan.'",
])}

${section("Reading third-party lab tests", [
    "CADR (AHAM AC-1) is the comparable number — look for smoke/dust/pollen triplets.",
    "Ours: 210/205/220 m³/h. A brand quoting only 'coverage' without CADR is quoting a",
    "marketing department, not a lab.",
    "Decibel claims: demand the distance and the mode. '18 dB' means at 1 m on Night;",
    "a competitor's '19 dB' measured at 3 m is a louder machine in the same room.",
    "Filtration percentages without a particle size ('99.9% of pollutants!') are",
    "unfalsifiable and usually hide the MPPS dip. Ask 'at 0.3 microns?' and watch.",
    "Energy Star listings are public — a claimed certification takes ninety seconds to",
    "verify, and we've caught two competitors' pages claiming what the database doesn't.",
])}

${section("Common myths, retired", [
    "'Plants purify indoor air' — the NASA study extrapolation fails at real-room scale by",
    "orders of magnitude; you'd need a jungle per bedroom. Plants are lovely; they are decor.",
    "'Opening windows defeats the purpose' — ventilation and filtration are teammates:",
    "windows dilute CO2 and VOCs, HEPA catches particulates; smoke days invert the advice.",
    "'HEPA filters get less effective as they load' — capture efficiency actually rises",
    "with loading (packed fibers catch more); airflow drops instead. The LED tracks the",
    "airflow story, which is the one that matters.",
    "'Ionizers are a feature' — they make particles stick to your walls and can generate",
    "ozone. We consider omitting one a specification.",
])}`;

export const LUMEN_LAUNCH_RETRO = `# Q2 launch retro — Lumen One pre-order (written July, warts kept in)

${section("The headline numbers", [
    "Pre-orders: 4,180 units in the 6-week window against a 3,000 plan (139%).",
    "Bundle attach: 38% took the $289 filters-for-a-year bundle — double the model.",
    "CAC blended $31; organic/press-driven share of orders 44%.",
    "Return rate from the first shipped batch: 5.7%, inside the 8% underwriting.",
    "Press: 9 reviews; the Quiet Mark pending status cost us two 'best of' lists.",
])}

${section("What worked", [
    "The 18 dB claim carried everything. Every top-performing ad, the two biggest reviews,",
    "and the highest-converting page section all led with sleep and silence, not filtration.",
    "Publishing real specs built trust visibly: the spec table was the second-most-visited",
    "section and the live decibel demo video converted at 2.3× the page average.",
    "The single-discount policy (pre-order only) created honest urgency; day-42 spike was 3×.",
])}

${section("What missed", [
    "We under-communicated room size. 41% of returns said 'room larger than 38 m²' — the",
    "number was on the page but not in the buying flow. Fix shipped: room-size selector",
    "before checkout, expected coverage stated in plain language.",
    "'Expected app control' returns (22%) tell us the no-app position needs to be a selling",
    "point on the page, not a footnote — 'nothing to pair, nothing to update' now leads",
    "section three.",
    "Retail conversations started too late; Foundry Home and Nest & North both asked for",
    "60 days more lead time than we gave ourselves. Q1 retail now has a real critical path.",
])}

${section("Decisions taken (with revisit dates)", [
    "Keep $299 list post-launch; revisit after retail sell-through data (January).",
    "Hold the no-app line for Lumen Mini; revisit only if return-reason share exceeds 30%.",
    "Quiet Mark certification is a launch gate for Mini, not a nice-to-have (December check).",
    "Every future claim ships with its evidence linked in the page footer (standing policy).",
])}

${section("Channel by channel", [
    "Press/organic (44% of orders, effectively €0 CAC): two flagship reviews drove",
    "identifiable spikes of 610 and 380 orders. The pitch that worked was the anti-pitch:",
    "spec sheet, loan unit, no embargo, 'measure it yourself'.",
    "Paid social (31%, $52 CAC): the only creative that beat break-even was the decibel",
    "demo filmed on a phone next to a sleeping baby monitor readout. Polished studio",
    "cuts underperformed it 3:1 — keep shipping the honest-looking thing.",
    "Search (17%, $38 CAC): 'quiet air purifier' converts double 'best air purifier'.",
    "Intent about the adjective, not the category. Bid accordingly.",
    "Newsletter sponsorships (8%, $29 CAC): two sleep-focused letters outperformed every",
    "tech letter combined. The audience match is the product truth again: sleep, not gadgets.",
])}

${section("Ops and fulfillment retro", [
    "The 3PL held: 96% of batch one shipped inside the promised week. The 4% taught us the",
    "real lesson — customs paperwork for UK orders needed a second HS-code line, found the",
    "hard way by 170 delayed parcels and one very patient agent named Rui.",
    "Packaging survived carriers well (0.4% damage) but opened poorly: 12% of early support",
    "photos showed the quick-start card unread inside the lid. Card moved to sit on top of",
    "the unit; 'how do I start it' tickets fell by half.",
    "Serial-batch logging paid for itself in week two: the FAN ticket cluster traced to one",
    "afternoon shift's rotor torque setting within a day. 41 units, proactive outreach,",
    "nine swaps, zero reviews mentioning it.",
])}

${section("Press learnings, kept honest", [
    "What earned coverage: the published spec table (cited in 7 of 9 reviews), the no-app",
    "stance (the headline of 3), and the 60-night return policy (called 'confident' twice).",
    "What earned nothing: the founding story, the design-award submission, the renders.",
    "Reviewers photographed the real unit in real rooms; renders signaled vapor.",
    "The two 'best of' lists we missed required an in-hand certification we filed late",
    "(Quiet Mark). Calendar-driven lesson, now a launch gate; nothing philosophical.",
])}

${section("The counterfactuals we argued about", [
    "Would a $199 pre-order have done 2×? The elasticity test says orders yes, margin no,",
    "and the discount-training cost is permanent. Standing by the call.",
    "Should we have launched with the Mini alongside? Ops says the batch complexity would",
    "have eaten the calendar; interviews say the missing product was LARGER, not smaller.",
    "The roadmap listened (see Jonas, interviews doc).",
    "Was skipping influencer seeding right? The two we declined posted competitor content",
    "the same month; zero measurable dent. The honest-review flywheel out-earned it.",
])}`;

export const LUMEN_VOICE_KIT = `# Lumen — voice and copy kit (marketing canonical, June)

Lumen sounds like a good engineer explaining something to a friend: warm, precise, a little dry.
We are never breathless. The product is calm; the copy is calm.

${section("The rules", [
    "Lead with the felt benefit (sleep, quiet, one dial), support with the real number.",
    "One claim per sentence. A sentence with two numbers is two sentences.",
    "Plain words: use 'quiet', not 'whisper-quiet acoustic architecture'.",
    "Numbers are rounded honestly and sourced: 18 dB, 38 m², $249. Never 'up to'.",
    "Humor is allowed in small doses and never about the customer's air.",
])}

${section("Words we never use", [
    "smart, ecosystem, revolutionary, game-changing, medical-grade, hospital-grade,",
    "purify (as an absolute), sanitize, 99.99% (ours is 99.95 and we say so),",
    "breathe easy (cliché quota exceeded industry-wide), unleash, elevate.",
])}

${section("Approved boilerplate", [
    "Short: 'Lumen One is a quiet air purifier for bedrooms and small studios. One dial,",
    "no app, 18 decibels on Night mode. $299, with a 60-night honest trial.'",
    "Founder bio line: 'Lumen was started in 2023 by three people who wanted the air in a",
    "rented flat to be as good as the coffee.'",
    "Press contact block and full spec line live in /press; never retype them by hand.",
])}

${section("Copy examples — before and after", [
    "Before: 'Experience revolutionary whisper-quiet purification technology.'",
    "After: 'It runs at 18 decibels. That's quieter than the sound of turning this page.'",
    "Before: 'Advanced HEPA-13 medical-grade filtration eliminates 99.99% of pollutants.'",
    "After: 'The HEPA-13 filter catches 99.95% of particles down to 0.3 microns — smoke,",
    "pollen, and the dust you can see in a sunbeam.'",
    "Before: 'Subscribe and save with our filter ecosystem!'",
    "After: 'Filters are $12 a quarter, shipped when you need one. Pause anytime.'",
])}

${section("Email rules", [
    "Subject lines state the content: 'Your filter ships Monday', never 'A little something'.",
    "First sentence is the point. No 'we hope this finds you well'.",
    "Every email, including receipts, is signed by a person with a real name.",
    "Unsubscribe is one click, first screen, no guilt copy beneath it.",
])}

${section("Social voice", [
    "We post like a person who makes things, not a brand that hired one: workshop photos,",
    "failed rotor prototypes, the teaspoon of dust, a cat asleep on the unit.",
    "Reply to everything genuine within a day; never reply to bait. The block button is",
    "brand management.",
    "No engagement questions ('what's YOUR sleep routine? 👇'), no trend-jacking, no memes",
    "about products we compete with. If a post needs a disclaimer, it needs deleting.",
    "Customer photos get asked-permission reposts with credit, and we send a Filter Duo",
    "as thanks — a policy, not a bribe: it started as one agent's habit.",
])}

${section("Crisis comms starters (pre-drafted, pray unused)", [
    "Shipping slip: subject 'Your Lumen One is late — here's the honest picture'. Body",
    "names the new week, the cause in one sentence, and a no-questions cancel link.",
    "Hardware fault cluster: lead with who is affected (batch codes, count), what we're",
    "doing (swap-first, prepaid), what we don't know yet, and a date we'll update by —",
    "then meet that date even if the update is 'no news'.",
    "Bad review response: we don't rebut reviews. If it's wrong on facts, one comment",
    "with the published test link, said once, never argued.",
    "Price change: announce before it applies, honor every cart and pre-order at the old",
    "number, and say the reason in one sentence ('carbon costs doubled') or don't change it.",
])}

${section("Photography direction", [
    "Real rooms, slightly imperfect: a cable visible, a book mid-read, morning light.",
    "Renders are for engineering, never for customers.",
    "The machine is a supporting actor — the subject is the room being ordinary. Hero",
    "shots of the product on white exist for retail partners only.",
    "People sleep in the photos. Nobody smiles at an air purifier; nobody should.",
    "Color grade stays warm and unfiltered-looking; if a photo looks 'campaign', reshoot.",
])}

${section("Naming rules", [
    "Products are Lumen + one plain word (One, Mini). No Pro, Max, Ultra, Plus — the",
    "ladder words promise a hierarchy we'd then have to invent.",
    "Modes are verbs of the room, not tech words: Night, Standard, Boost — never Turbo,",
    "Eco, Smart.",
    "The filter is the Duo everywhere, including invoices; internal part codes stay",
    "internal. One name per thing, and the support glossary is the tiebreaker.",
])}`;

export const LUMEN_PRICING_NOTES = `# Pricing and packaging notes (strategy log, rolling)

${section("Where the numbers came from", [
    "$299 list: parity with the mid-tier of the credible field (Coway/Levoit tops, Blueair",
    "mids) while undercutting the design-led tier ($400+) we resemble aesthetically.",
    "$249 pre-order: 17% off reads as real without training discount-waiting behavior;",
    "it is the only discount we run, ever, and that fact is itself a message.",
    "$12/quarter filters: at 8 h/day usage that's $48/year — beneath the $60 psychological",
    "line for consumable dread, and cheaper than every competitor's equivalent at $18–29.",
])}

${section("Experiments run", [
    "A/B on bundle framing (May): 'filters for a year, $40 off' beat '13% off bundle' by 31%",
    "relative on attach. People buy time, not percentages. Standing rule: frame in time.",
    "Monthly vs quarterly filter billing (June): monthly $4.33 halved cancellations-at-bill",
    "but tripled support contacts about 'another charge'. Quarterly stays; revisit never.",
    "De-listing the one-off $19 Duo from the homepage (July): subscription attach rose 6 pts",
    "with zero support noise — the one-off remains available in account and support flows.",
])}

${section("What we won't do (pricing edition)", [
    "No haggling in support threads; agents may comp filters, never discount hardware.",
    "No regional price testing that punishes loyalty (one price per currency).",
    "No 'msrp theater' — the strikethrough price must be a price we actually charged.",
    "Refurb program (planned Q1) prices at $219 with full warranty; refurbs are plainly",
    "labeled and photographed as the unit you receive.",
])}

${section("Open questions (owners assigned)", [
    "Does the Mini cannibalize One in small-flat markets, or expand? (Modeling — Sofia, Oct.)",
    "Retail margin structure vs the single-discount promise: outlets want promo windows we",
    "don't run. Current line: retail matches web price, we fund displays not discounts.",
    "(Marco, before Foundry Home contract signature.)",
])}

${section("The competitive price map, annotated", [
    "Under $150: Levoit Core 300S ($150) and the marketplace clones beneath it. We don't",
    "chase this floor; our COGS structure can't and our positioning shouldn't.",
    "$150–300, the fighting tier: Coway AP-1512 ($229 street), Winix 5500-2 ($199),",
    "Blueair 411i ($169). We enter at $299 with the quietest published number and the",
    "cheapest annual filter cost — the spreadsheet a diligent buyer builds favors us.",
    "$300–450, design tier: Blueair mid-range, Molekule Air Mini+ ($359). Buyers here pay",
    "for the object in the room; we match the aesthetics from below.",
    "Above $450: Dyson, IQAir. Different customer, different conversation; we win the",
    "'why is this cheaper AND quieter' moment without saying a word.",
])}

${section("Refurb economics (Q1 program)", [
    "Return units average 5.7% of sales; 80% test as new after a Duo swap and casing pass.",
    "Refurb at $219: covers refurbishment labor (€14/unit), fresh Duo, new box, and keeps",
    "a 41% margin — thinner than new (52%) but recovers units that were written to zero.",
    "Full 3-year warranty on refurbs, plainly photographed. The trust upside likely",
    "exceeds the margin: a $219 entry point that isn't a discount on new preserves the",
    "single-discount promise while opening a price door.",
    "Cap the channel at actual return volume; never manufacture 'refurbs' to hit a price",
    "point — the moment refurb supply outruns returns, the label is a lie.",
])}

${section("Retail margin math, plainly", [
    "Foundry Home asks keystone-ish (45 pts); Nest & North asks 40 with co-op funds.",
    "At $299 retail our landed COGS leaves both workable, but only because the filter",
    "annuity stays direct: subscriptions attach to the serial at registration regardless",
    "of purchase channel — the retail box carries a first-Duo-free card to drive it.",
    "The non-negotiable: retail price equals web price, always. We fund end-caps and demo",
    "units (the 18 dB demo needs physical presence anyway) instead of promo windows.",
    "If a partner marks down unilaterally, contract says we may pause supply — the",
    "single-discount promise is worth more than any single purchase order.",
])}

${section("Currency and regional policy", [
    "One price per currency, set at launch, reviewed twice a year — not floated on FX.",
    "€299/£279/$299 currently; we eat swings inside ±8% and reprice beyond it, announced",
    "ahead per the crisis-comms rule.",
    "No regional promo asymmetry: a German customer discovering a French discount is a",
    "trust incident, not a growth hack.",
    "VAT is always in the shown price in VAT countries. '+ tax' surprises at checkout",
    "are a conversion tax we refuse to pay.",
])}`;

export const LUMEN_INTERVIEWS = `# Customer interviews — summer round (8 sessions, verbatim quotes marked)

${section("Interview 1 — Nadia, 34, nurse, night-shift sleeper", [
    "Sleeps 9am–4pm; bought for blackout-room stuffiness. Runs Night mode continuously.",
    "'I stopped noticing it, which is the whole point. My white-noise app is louder.'",
    "Filter LED went amber at month four; found the swap 'stupidly easy'. Subscribed after.",
    "Ask: a physical way to check filter life without looking at the LED (she sleeps in dark).",
])}

${section("Interview 2 — Tom, 41, allergic to the dog he loves", [
    "Spring pollen plus a golden retriever. Boost after brushing the dog, Standard otherwise.",
    "'The teaspoon of dust thing sold me. I wanted to see the gross evidence and I did.'",
    "Complaint: wanted a second unit discount for the bedroom; annoyed there's no bundle.",
    "Note for pricing: two-unit household bundle keeps coming up (4 of 8 interviews).",
])}

${section("Interview 3 — Priya, 29, studio flat, works from home", [
    "One room is kitchen, office, and bedroom; cooking spikes were her trigger to buy.",
    "'I fry something, hit the third click, and by the next call the air is boring again.'",
    "Uses the dial exactly as designed; never wanted an app: 'my dishwasher has an app. I",
    "have never opened it.'",
    "Ask: a shorter cable or cable management — 1.8 m coils awkwardly in her corner spot.",
])}

${section("Interview 4 — Marcus, 55, wildfire-adjacent suburb", [
    "Bought two during last season's smoke week after seeing the PM2.5 framing.",
    "'Everyone else was shouting about smart sensors. You told me what it catches and how",
    "fast. That's all I wanted.'",
    "Replaced filters after the season on support's advice; called that advice 'the reason",
    "I'll buy the next thing you make.'",
    "Ask: a published 'smoke season protocol' page he can send his neighbors. (Shipped since.)",
])}

${section("Interview 5 — Elif, 38, new parent", [
    "Nursery use; the 18 dB claim was the entire purchase decision.",
    "'I measured it with an app out of spite. It was quieter than my phone said my fridge is.'",
    "Wants a clip or shelf mount out of toddler reach — floor placement conflicts with a",
    "climbing child. Design note logged for Mini.",
])}

${section("Interview 6 — Jonas, 47, returned his unit", [
    "Return reason: 62 m² open-plan living room — double the coverage spec.",
    "'Nothing wrong with the machine. It was honest about what it covers; I wasn't honest",
    "with myself about my room.' Return flow rated 'the best I've used'.",
    "Would buy a larger model at $400–450: 'same silence, more room'. Logged for roadmap.",
])}

${section("Interview 7 — Aoife, 31, asthma, skeptical buyer", [
    "Researched for a month; the research primer content (published as blog posts) converted",
    "her: 'you explained MPPS like I was smart. Everyone else explained it like I was scared.'",
    "Reports fewer night symptoms but resists attributing: 'could be the season. The machine",
    "doesn't ask me to believe anything, which I appreciate.'",
    "Copy note: her phrasing 'the machine doesn't ask me to believe anything' — near-perfect",
    "brand line, cleared for use anonymized.",
])}

${section("Interview 8 — Dmitri, 44, bought for the office he rents out", [
    "Landlord use case we didn't design for: furnished rental amenity.",
    "'Tenants ask about air now. It photographs well and I never get support calls about it.'",
    "Wants invoice-friendly multi-unit ordering (5+ units, one receipt). Logged for ops.",
    "Flag: he referred to it as 'the Dyson-looking one' — aesthetic association to monitor.",
])}

${section("Interview 9 — Hana, 27, musician with a home studio", [
    "Bought for dust control around equipment; stayed for the noise floor.",
    "'I record vocals with it running on Night. It doesn't show up on the track. That's",
    "the whole review.'",
    "Uses Boost between sessions, never during. Asked whether the motor is brushless",
    "(it is) before buying — spec-literate segment exists and reads the real numbers.",
    "Ask: a 'studio' colorway (matte black). Third such request this round; logged.",
])}

${section("Interview 10 — Piotr, 62, retired engineer, gift recipient", [
    "Daughter bought it; he intended to return it ('another gadget') and kept it.",
    "'It has one knob. It does what the knob says. Do you know how rare that is now?'",
    "Reads the filter LED skeptically and vacuum-tests the prefilter monthly with visible",
    "satisfaction. The repairability story converts engineers of every generation.",
    "Quote cleared for use: 'the first appliance in years that doesn't want my wifi password.'",
])}

${section("Interview 11 — Sofía, 36, two kids, one with dust allergies", [
    "Pediatrician suggested bedroom filtration as part of a broader plan; she researched",
    "for a month (overlapping Aoife's path: the primer posts, then the spec table).",
    "Reports the child's morning congestion 'noticeably better most weeks' and volunteers",
    "the honest confound: they also switched bedding. 'Your blog told me not to over-",
    "attribute. I trust the machine more because you undersold it.'",
    "Runs Night 24/7 in the kid's room; filter hit amber at month four (heavy use case,",
    "matches the support model).",
    "Ask: child-lock on the dial — toddler discovers Boost is a button to press. Logged;",
    "Mini design already carries a hold-to-change dial for this reason.",
])}

${section("Interview 12 — Ben, 33, returned it, then bought again", [
    "Round one: open-plan loft, same story as Jonas — honest 38 m² spec, dishonest",
    "self-assessment. Returned in week three, 'best return flow I've used' (verbatim twice",
    "now; the flow is a moat).",
    "Round two: moved flats, bought again within a week of the move. 'The bedroom is",
    "finally bedroom-sized, and I already knew the machine was good — mostly I remembered",
    "that leaving was easy, which made coming back easy.'",
    "The pattern to keep: a generous exit is a re-acquisition channel. Marketing may not",
    "use this insight as copy ('our returns are great!') — it works precisely because",
    "it's unadvertised.",
])}

${section("Cross-interview patterns (what the round actually says)", [
    "Quiet is the purchase driver in 9 of 12; filtration efficacy is assumed, not shopped.",
    "The spec-table-plus-primer path converted the three most skeptical buyers — publishing",
    "real evidence is our highest-leverage marketing surface, not a compliance chore.",
    "Two-unit households and a larger-room model are the two loudest roadmap signals;",
    "an app appeared zero times as a wish and four times as a relief.",
    "Return-flow praise appeared unprompted in three sessions. The exit is part of the",
    "product.",
])}`;

export const LUMEN_COMPETITIVE = `# Competitive landscape (sales + product shared copy, July)

How to use this: know the field cold, never trash-talk it in customer-facing writing. Our line
in public: 'there are several good machines; here is exactly what ours does.'

${section("The field in four tiers", [
    "Design-led ($400+): Molekule, Dyson. Beautiful, loud marketing, mixed independent lab",
    "results. We match their looks at $299 and beat them on published honesty.",
    "Spec-value ($150–300): Coway, Levoit, Winix. Excellent CADR per dollar, hotel-lobby",
    "aesthetics, app-heavy. This is the tier we actually fight in.",
    "Budget (<$150): fine machines, 50+ dB at useful settings, disposable feel.",
    "Medical-cosplay: 'hospital-grade' claims at every price. We never join that language.",
])}

${section("Head-to-head: Coway AP-1512 (the benchmark)", [
    "Their strengths: legendary reliability, CADR 233 slightly above ours, $229 street.",
    "Their weaknesses: 24.4 dB minimum (vs our 18), plastic-forward design, ionizer mode",
    "(ozone conversation we win), filter costs ~$50/year vs our $48 with nicer UX.",
    "Sales line: 'If you want the proven workhorse, the Coway is great. If the machine lives",
    "in your bedroom, ours is the one you'll forget is on.'",
])}

${section("Head-to-head: Levoit Core 300S", [
    "Their strengths: $150 price, huge review base, compact.",
    "Their weaknesses: 22 m² honest coverage, app-dependent features, 24 dB 'sleep' mode",
    "that reviewers measure higher, filter subscription costs creep.",
    "Sales line: 'Half the price, half the room. For a desk or a dorm, genuinely fine.'",
])}

${section("Head-to-head: Dyson Purifier Cool", [
    "Their strengths: brand gravity, fan+purifier combo, stunning industrial design.",
    "Their weaknesses: $429+, 56 dB at max, CADR unpublished (independent tests place it",
    "well below ours), filters $79/year.",
    "Sales line: never named in our copy; if asked directly: 'lovely fan. As a purifier,",
    "compare the numbers each company is willing to publish.'",
])}

${section("Moats we actually have", [
    "The 18 dB night mode is a real engineering artifact (oversized slow rotor + acoustic",
    "chamber), not a marketing rounding — nobody in the field publishes lower with a mic",
    "in the room.",
    "The no-app position converts the privacy-tired and ages well with every IoT breach",
    "headline. It is also permanent cost structure others carry and we don't.",
    "Published-evidence habit: every claim links its test. Cheap for us, expensive to copy",
    "for anyone whose numbers were optimistic.",
])}

${section("Emerging entrants worth watching", [
    "Windmill Air (US, design-led window units moving into purifiers): strong aesthetic",
    "instincts, no published CADR yet. If they publish honest numbers they become the",
    "closest philosophical competitor; watch their next launch page's footnotes.",
    "The Xiaomi/Smartmi pipeline: relentless value, app-mandatory, EU pricing creeping up.",
    "They win every spreadsheet that doesn't have a decibel column; keep the decibel",
    "column in every comparison we influence.",
    "'Filterless' ionic startups (two funded this year): physics says walls-as-filters and",
    "ozone questions; history says a recall. We never name them, we just keep 'no ozone,",
    "verified' on the spec line.",
    "Ikea (FÖRNUFTIG/STARKVIND): the real long-term threat — 'good enough' at furniture",
    "prices in a store people already trust. Our answer stays: measurably quieter, honest",
    "numbers, and a product that looks chosen rather than provisioned.",
])}

${section("Win/loss notes from real support threads", [
    "Wins we see: 'chose you over Coway for the bedroom' (the decibel column), 'the return",
    "policy made trying it feel safe' (the exit as a feature), 'your blog explained MPPS'",
    "(published evidence converting skeptics).",
    "Losses we see: room-size mismatch (their honesty, our checkout — selector shipped),",
    "'wanted app + purifier in one ecosystem' (a customer we're honestly wrong for; let",
    "them go warmly), price floor shoppers (Levoit serves them well; say so and mean it).",
    "The threads to learn from are the polite losses: nobody who leaves angry teaches",
    "anything except tone.",
])}

${section("The comparison-page policy", [
    "We publish comparison pages with real numbers, including the rows we lose (price",
    "vs Levoit, CADR-per-dollar vs Coway). Losing a row on purpose is what makes the",
    "winning rows believable.",
    "Every figure cites its source: their published spec, or a named third-party lab.",
    "No 'independent' tests we commissioned wearing a trench coat.",
    "Update cadence: quarterly, or within a week of a competitor's real spec change.",
    "A stale comparison is a lie with a timestamp.",
])}`;

export interface KnowledgeDoc {
    title: string;
    body: string;
}

export const LUMEN_KNOWLEDGE: KnowledgeDoc[] = [
    { title: "company-handbook.md", body: LUMEN_HANDBOOK },
    { title: "support-playbook.md", body: LUMEN_SUPPORT },
    { title: "product-docs-lumen-one.md", body: LUMEN_PRODUCT_DOCS },
    { title: "air-quality-research-primer.md", body: LUMEN_RESEARCH },
    { title: "q2-launch-retro.md", body: LUMEN_LAUNCH_RETRO },
    { title: "voice-and-copy-kit.md", body: LUMEN_VOICE_KIT },
    { title: "pricing-and-packaging-notes.md", body: LUMEN_PRICING_NOTES },
    { title: "customer-interviews-summer.md", body: LUMEN_INTERVIEWS },
    { title: "competitive-landscape.md", body: LUMEN_COMPETITIVE },
];
