# User journey audit

Every persona was walked end to end as a real user: the real API (SQLite, Baseline + Demo seed, file-mode mail) behind
`vite preview`, driven with Playwright at 1280 px and at 390 px (touch), reading the screenshots, the console and the
failed network calls of every step. The existing suites (`j-*`, `crawl`, `a11y`) were not trusted: each journey below was
re-walked by hand-written probes, and a defect was only counted when it reproduced in the browser.

Fix commits are on `claude/optimize-all-platform-i3j5id`. Every fix has a regression test (named in the last column).
"Steps" are distinct steps; most were run on desktop and on a phone, and some several times.

| Journey | Steps walked | Defects found | Fixed |
|---|---|---|---|
| 1 Visitor → lead → CRM | 21 | 4 | 4 |
| 2 Academy: course → certificate → verify | 17 | 1 | 1 |
| 3 Creator: sign up → proof → payout | 24 | 0 | 0 |
| 4 Client portal | 7 | 0 | 0 |
| 5 Agency staff: lead → deal → proposal | 8 | 0 new (the missing CRM link, counted in 1) | |
| 6 Admin | 7 | 0 | 0 |
| 7 Auth | 34 | 1 | 1 |
| 8 Partners | 14 | 2 | 2 |
| Cross-cutting (404s, mail links, newsletter) | 12 | 0 | 0 |
| **Total** | **144** | **8** | **8** |

## 1. Visitor → home → services → pricing → contact / booking → email → CRM

| # | Step | Result | Issue | Fix |
|---|---|---|---|---|
| 1 | Home loads, one h1, CTAs | ok | | |
| 2 | Home → services → a service page | ok | | |
| 3 | Service page: book, quote, partner card, share links | ok | | |
| 4 | Pricing → "Get a quote" on a package | ok: service and package pre-selected, summary follows | | |
| 5 | Contact: empty send | ok: every field error and the consent error | | |
| 6 | Contact: bad email, short name | ok | | |
| 7 | Contact: valid, double click | ok: exactly one POST | | |
| 8 | Contact: confirmation | **defect** | After sending, the long form was replaced by a short card and the page stayed at the old offset: the visitor landed on the footer with "Thanks — message received" above the fold (desktop and phone; same for audit, quote, booking, careers) | `19cc862`, `17564e6` · `website.test.tsx` (booking) |
| 9 | Contact: confirmation email | **defect** | No email at all for contact, free audit and quote (only bookings were confirmed). The visitor kept an on-screen reference and nothing in the inbox | `c7bf2c8` · `WebsiteFormsTests`, `EmailTemplateTests` |
| 10 | Contact on a phone with autofill (sent in under 3 s) | ok: "That was quick" message, second tap sends | | |
| 11 | Book: no slot, no consent | ok | | |
| 12 | Book: slot + details → confirmation + email | ok: reference, time zone, "confirmed" email | | |
| 13 | Back button after success | ok | | |
| 14 | Quote: step validation, then browser Back on step 2 | **defect** | Back left the form and lost every answer (step was component state) | `fff4383` · `website.test.tsx` |
| 15 | Free audit: empty send, then valid | ok: seven errors | | |
| 16 | Newsletter: invalid, no consent, valid → mail → confirm (double click) → unsubscribe | ok | | |
| 17 | Admin: sign in → Website → Inquiries shows the lead | ok | | |
| 18 | Admin: Consultations shows the booking | ok | | |
| 19 | Sales: the lead is a CRM contact, company (free-mail excluded) and deal "New" | ok | | |
| 20 | Inquiry page → CRM | **defect** | The inquiry page said it creates a CRM lead but linked nowhere; staff had to search the CRM by hand | `f98c770` · `leadsExport.test.tsx`, `crmEditing.test.tsx` |
| 21 | CRM deal → "New proposal" | ok | | |

## 2. Visitor → academy → course → sign up → lessons → exam → certificate → verify → LinkedIn

| # | Step | Result | Issue | Fix |
|---|---|---|---|---|
| 1 | `/learn` hub, a course, a public lesson | ok | | |
| 2 | Lesson video | ok: lecture shows "Coming soon" with chapters and transcript when no video is attached (as in this seed) | | |
| 3 | "Enrol for free" signed out | ok: register with `next=/learn/…?enrol=1` | | |
| 4 | Register, check-email page, verification link opened in a fresh browser | ok: `next` survives, copy says "Sign in and start learning" | | |
| 5 | Sign in | ok: returns to the course, enrols, opens lesson 1 | | |
| 6 | Lessons, exam fail/retake/pass, certificate PDF, LinkedIn links, verification page, revocation | covered by `j-learning` (not repeated) | | |
| 7 | `/verify`: type the credential ID printed on the certificate (`OA-XXXX-XXXX`) | **defect** | The form asks for a "credential ID" but the page looked the typed text up as a certificate GUID: the API answered 401 and the visitor saw a grey skeleton forever | `45fc24d` · `chrome.test.tsx` (hit and miss) |
| 8 | `/verify` with a pasted link, with a wrong code | ok after fix: inline "We couldn't find a certificate with that ID" | | |
| 9 | Certificate for an unknown id | ok: 404 state with a way on | | |

## 3. Creator / participant

| # | Step | Result | Issue |
|---|---|---|---|
| 1 | `/creators` → "Create your creator account" (audience copy, participant rules) | ok | |
| 2 | Register, verify, sign in | ok | |
| 3 | First-run home: setup checklist, 90-day profile rule explained | ok | |
| 4 | Campaigns, campaign detail on a phone (sticky "Submit proof" disabled with the reason) | ok | |
| 5 | Submissions, earnings, payouts, referrals, notifications, achievements, learning, codes, support (390 px) | ok: no overflow, no console errors | |
| 6 | Submit proof dialog: empty, bad URL, missing screenshot | ok | |
| 7 | Payout details, "payouts on hold" state, estimated amount, minimum | ok (payouts are scheduled by finance; there is no withdraw button by design) | |
| 8 | Unverified, suspended, on-hold and not-yet-eligible accounts | ok: every state explains itself | |
| 9 | Review and payout side | covered by `j-participant`, `j-finance` | |

## 4. Client (invite → sign in → approvals / reports / invoices)

| # | Step | Result | Issue |
|---|---|---|---|
| 1 | Client owner signs in → `/client`, navigation on a phone, sign out | ok | |
| 2 | Invitation, set-password link, approvals, reports, invoices, pay | covered by `j-delivery`, `j-lead-to-cash` (not repeated) | |

## 5. Agency staff (lead → proposal → invoice → payment → delivery)

| # | Step | Result | Issue |
|---|---|---|---|
| 1 | Sales rep signs in, inquiries, inquiry detail | ok | the missing CRM link above |
| 2 | CRM contact → deal → New proposal | ok | |
| 3 | Proposal → contract → invoice → payment → delivery | covered by `j-lead-to-cash`, `j-delivery` | |

## 6. Admin

| # | Step | Result | Issue |
|---|---|---|---|
| 1 | Sign in, navigation drawer and sign-out on a phone (all seven roles) | ok | |
| 2 | Users, roles, log in as, site content, SEO files, partners | covered by `j-admin`, `j-content`, `j-partners` (not repeated) | |

## 7. Auth

| # | Step | Result | Issue | Fix |
|---|---|---|---|---|
| 1 | Deep link signed out (`/app/submissions?status=Approved#list`) | ok: `/login?next=…` keeps query and hash; sign-in returns to it | | |
| 2 | Empty sign-in, wrong password, register link keeps `next` | ok | | |
| 3 | Register: empty, weak password, valid | ok | | |
| 4 | Verification link, replayed link | replay is a failure screen | **defect** | A used link (second click, or a mail scanner that opened it) read "This link has expired", even for a verified, signed-in person | `df57c23` · `audience.test.tsx` |
| 5 | Sign in before verifying | ok: onboarding state and resend | | |
| 6 | Signed in on `/login`, `/admin` as a participant | ok: redirected; 403 page with "Switch account" | | |
| 7 | 2FA set-up (wrong code, right code, ten recovery codes), sign out, challenge (wrong code, recovery code) | ok | | |
| 8 | Forgot password (known and unknown email identical), reset link, replay | ok | | |
| 9 | Lockout after five wrong passwords | ok (generic message, "paused for 15 minutes" shown up front) | | |
| 10 | Session dies mid-use (every API call 401) | ok: `/login?expired=1&next=/app/payouts`, sign-in returns there | | |
| 11 | Sign out; Back button | ok | | |

## 8. Partners (ad card → `/go/pciai`, `/go/certuvo` → partner page → share)

| # | Step | Result | Issue | Fix |
|---|---|---|---|---|
| 1 | Home strip cards, `rel="sponsored noopener"`, click redirect with UTM | ok | | |
| 2 | `/go/pciai`, `/go/certuvo` | ok: 302 with UTM tags | | |
| 3 | Partner pages, share (LinkedIn, X, WhatsApp, e-mail, copy) | ok | | |
| 4 | `/go/<retired alias>` in a browser | **defect** | A raw `application/problem+json` blob on a white page (these links live in newsletters and bios) | `bbadd64` · `WebsitePartnersTests`, `j-partners/03-placements.spec.ts` |
| 5 | `/partners/<unknown>`, and the service, article, industry, case-study and job equivalents | **defect** | A message with no h1 and only "Go to the homepage" | `bc4d8cb` · `queryState.test.tsx` |

## Cross-cutting

Unknown campaign code (`/join/…`), `/c/…`, `/p/…`, `/i/…`, `/email/unsubscribe`, portal paths signed out, search with and
without results, careers application validation: all ok.

## What remains

- Careers applicants get an on-screen reference but no email (the contact receipt added here is the same pattern).
- Sign-in's brand panel is the creator pitch for every audience (clients, learners, creators all see "Get paid to share brands").
- The deep parts of journeys 3–6 (review, payout batches, client approvals, proposals, invoices, roles, log-in-as) were
  read from their suites, not re-walked.
- The workspace's `node_modules` is on react-router 6 while `package.json` asks for 7: `npm run build` (`entry-server`) fails
  until `npm ci` is run on the shared checkout. Not part of this audit's changes.
