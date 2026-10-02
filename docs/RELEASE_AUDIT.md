# Release audit — public website (2026-10-02)

Audit of the redesigned public site (agency pages, company/blog/conversion pages, Academy, Creators) against the
release definition of done: performance, SEO, accessibility, security and quality. Every number below was measured on
this branch; fixes made during the audit are listed with before → after values.

## How it was measured

* **Stack**: API (`dotnet run -c Release`, SQLite, `Baseline,Demo` seed) behind the **production nginx configuration**
  (`scripts/serve-web-nginx.sh`: SSI shell, gzip, cache headers, security headers), i.e. what Lighthouse should judge.
* **Lighthouse 12** (CLI, default simulated throttling — mobile: Moto G Power, slow 4G, 4× CPU; desktop preset), 12
  pages × 2 presets, Chromium 141 headless.
* **Interaction latency**: `web-vitals` `onINP` + Event Timing in Playwright, phone profile with 4× CPU throttling
  (desktop 1×), scripted taps/typing per page.
* **Layout shift on slow phones**: PerformanceObserver (`layout-shift`) at 412×823 with 4× CPU on 22 public pages.
* **SEO crawl**: every URL of every sitemap (1,409 pages) fetched without JavaScript and checked.
* **Machine caveat**: the sandbox has 4 shared vCPUs; during the runs the load average was 6–24 (other agents' test
  runs, a niced video render). Lighthouse's simulated mobile throttling multiplies the *observed* main-thread time by 4,
  so mobile TBT/Performance are inflated and noisy here (the same page varied by ±10 points between runs). Desktop and
  the network-bound metrics (FCP, LCP, CLS) are much less affected. Scores were not tuned to the machine.

## Checklist

| # | Item | Result | Evidence |
|---|---|---|---|
| 1 | Lighthouse ≥ 95 **desktop** (Perf, SEO, A11y, BP) | **Pass** | After server rendering: Perf 97.5–100 (median of 3), A11y 100, SEO 100, BP 100 (96 on the lesson page, see below) |
| 1 | Lighthouse ≥ 95 **mobile** Performance | **Partial** (machine-bound) | After server rendering (median of 3, interleaved with the old build): 78–98, 5 of 12 pages ≥ 95 (old build in the same runs: 54–80); in the quietest run (load ≈ 4) 10 of 12 pages ≥ 95. What is left is Total Blocking Time from hydration on a shared 4-vCPU sandbox; see "Server-side rendering" |
| 1 | LCP < 2.5 s | **Pass** | Mobile simulated 2.10–2.41 s on all 12 pages (was 3.70–4.53 s); desktop 0.44–0.58 s (was 0.79–0.98 s) |
| 1 | INP < 200 ms | **Pass** except the mobile menu (232–432 ms, noisy) | /pricing 560 → 136 ms, /learn 984 → 176 ms, blog 144, contact 104, lesson 168 (4× CPU) |
| 1 | CLS < 0.1 | **Pass** | Lighthouse 0–0.054 on all 24 runs (was 0.18 /services, 0.23 lesson); 4×-CPU phone check ≤ 0.076 on 22 pages (was up to 0.28) |
| 1 | Responsive AVIF/WebP images | **Pass** (WebP) | Built-in partner logos now use 128/256 px WebP srcset; content images are uploads/YouTube thumbnails; OG cards are generated PNG (as social networks require) |
| 1 | Code-splitting and lazy loading | **Pass** | Entry JS 227 → 161 KiB gzip, entry CSS 50 → 27 KiB; every route and portal lazy |
| 1 | Bundle budgets enforced in CI | **Pass** (added) | `frontend/scripts/check-bundle-budget.mjs`, `npm run budget`, CI frontend job step |
| 2 | Unique title + meta description | **Pass** (fixed) | 1,409 pages: 0 missing, 0 duplicate titles; duplicate descriptions 1 → 0 |
| 2 | Canonical, Open Graph, Twitter cards | **Pass** | 0 pages missing; canonical = URL on every page |
| 2 | JSON-LD | **Pass** | every page ≥ 1 block |
| 2 | XML sitemap + robots.txt | **Pass** | robots.txt 200 with `Sitemap:`; index of 11 sitemaps; every listed URL answers 200 |
| 2 | Clean URLs, heading order, alt text | **Pass** | exactly one h1 per page, 0 skipped levels, 0 images without alt (server HTML) |
| 3 | WCAG 2.2 AA (axe `wcag22aa`) | **Pass** (fixed) | e2e `a11y` suite + Lighthouse A11y 100; fixed contrast and label-in-name findings |
| 3 | Keyboard navigation, visible focus, SR labels | **Pass** | e2e `a11y/keyboard.spec.ts` (dialogs, menus, focus trap/restore) |
| 4 | Security headers incl. strict CSP, HSTS, nosniff, Referrer-Policy | **Pass** (HSTS added) | `script-src 'self'`, `object-src 'none'`, `frame-ancestors 'none'`; HSTS 1 year on HTTPS; header dumps below |
| 4 | OWASP Top 10 review | **Pass with notes** | see Security |
| 4 | 2FA for staff/admin | **Pass** (added after the audit) | RFC 6238 TOTP + recovery codes, sign-in challenge after password and Google, admin setting `security.requireTwoFactorForStaff` with forced set-up, admin reset; see "Two-step verification" below and SECURITY.md § 1.2 |
| 4 | No secrets in code | **Pass** | pattern scan of all tracked files (AWS/Google/Stripe/GitHub/Slack/Anthropic/OpenAI keys, private keys, OAuth tokens): only test fakes; `tools/lecture-studio` holds no credentials (config/ledger files are git-ignored) |
| 5 | Loading / empty / error states | **Pass** | every public data view goes through `PublicQueryState` (skeleton / empty / error + retry); hero placeholders added |
| 5 | No TODOs / placeholder features | **Pass on the public site** | no TODO/FIXME in `frontend/src` or `backend/src`; documented portal limitations listed under "Still left" |
| 5 | All tests passing | **Pass** | see Tests |

## Lighthouse (production nginx, simulated throttling)

Scores are Performance / Accessibility / Best practices / SEO. "Before" is the branch as received; "after" is the final
build (a re-run is used where the first run hit a load-average spike: mobile `/`, desktop `/pricing`). Raw JSON reports:
`lh-before/`, `lh-final/`, `lh-final-rerun/` in the audit scratch directory.

**Mobile**

| Page | Before | After | LCP · TBT · CLS before | after |
|---|---|---|---|---|
| `/` | 60 / 100 / 96 / 100 | 65 / 100 / 100 / 100 | 4.20 s · 872 ms · 0 | 3.97 s · 812 ms · 0 |
| `/services` | 61 / 100 / 96 / 100 | 73 / 100 / 100 / 100 | 3.95 s · 510 ms · 0.18 | 3.68 s · 499 ms · 0 |
| `/services/seo` | 70 / 100 / 96 / 100 | 66 / 100 / 100 / 100 | 3.76 s · 511 ms · 0 | 3.76 s · 796 ms · 0 |
| `/pricing` | 55 / 100 / 96 / 100 | 66 / 100 / 100 / 100 | 4.42 s · 1071 ms · 0 | 3.93 s · 738 ms · 0 |
| `/case-studies/northwind-outdoors-organic-growth` | 70 / 100 / 96 / 100 | 76 / 100 / 100 / 100 | 4.04 s · 454 ms · 0 | 3.82 s · 382 ms · 0 |
| `/blog` | 65 / 96 / 96 / 100 | 64 / 100 / 100 / 100 | 4.07 s · 639 ms · 0.014 | 4.16 s · 733 ms · 0.014 |
| `/blog/google-business-profile-checklist` | 71 / 100 / 96 / 100 | 63 / 100 / 100 / 100 | 4.01 s · 435 ms · 0 | 3.77 s · 1032 ms · 0 |
| `/contact` | 72 / 100 / 96 / 100 | 78 / 100 / 100 / 100 | 4.15 s · 337 ms · 0 | 3.76 s · 334 ms · 0 |
| `/learn` | 62 / 100 / 96 / 100 | 63 / 100 / 100 / 100 | 4.08 s · 739 ms · 0 | 4.12 s · 815 ms · 0 |
| `/learn/prompt-engineering-foundations` | 75 / 100 / 96 / 100 | 78 / 100 / 100 / 100 | 4.05 s · 296 ms · 0 | 4.20 s · 207 ms · 0 |
| `/learn/prompt-engineering-foundations/how-ai-assistants-respond` | 60 / 100 / 96 / 100 | 72 / 100 / 96 / 100 | 4.52 s · 293 ms · 0.227 | 4.35 s · 367 ms · 0 |
| `/creators` | 81 / 100 / 96 / 100 | 75 / 100 / 100 / 100 | 3.56 s · 242 ms · 0 | 3.72 s · 456 ms · 0 |

Mobile FCP improved on every page (3.0–3.3 s → 2.4–2.7 s); TBT moves with the machine load (see caveat).

**Desktop**

| Page | Before | After | LCP · TBT · CLS before | after |
|---|---|---|---|---|
| `/` | 93 / 100 / 96 / 100 | 98 / 100 / 100 / 100 | 0.99 s · 178 ms · 0 | 0.92 s · 95 ms · 0 |
| `/services` | 92 / 100 / 96 / 100 | 99 / 100 / 100 / 100 | 0.84 s · 207 ms · 0.044 | 0.81 s · 28 ms · 0.001 |
| `/services/seo` | 99 / 100 / 96 / 100 | 98 / 100 / 100 / 100 | 0.85 s · 48 ms · 0 | 0.82 s · 110 ms · 0 |
| `/pricing` | 96 / 100 / 96 / 100 | 99 / 100 / 100 / 100 | 0.97 s · 125 ms · 0.021 | 0.88 s · 79 ms · 0.021 |
| `/case-studies/northwind-outdoors-organic-growth` | 99 / 100 / 96 / 100 | 99 / 100 / 100 / 100 | 0.81 s · 1 ms · 0 | 0.81 s · 18 ms · 0 |
| `/blog` | 99 / 96 / 96 / 100 | 99 / 100 / 100 / 100 | 0.88 s · 22 ms · 0 | 0.85 s · 7 ms · 0 |
| `/blog/google-business-profile-checklist` | 92 / 100 / 96 / 100 | 99 / 100 / 100 / 100 | 1.07 s · 187 ms · 0.049 | 0.79 s · 10 ms · 0.049 |
| `/contact` | 99 / 100 / 96 / 100 | 99 / 100 / 100 / 100 | 0.91 s · 12 ms · 0.007 | 0.87 s · 22 ms · 0.007 |
| `/learn` | 96 / 100 / 96 / 100 | 97 / 100 / 100 / 100 | 0.99 s · 109 ms · 0.054 | 1.08 s · 71 ms · 0.054 |
| `/learn/prompt-engineering-foundations` | 99 / 100 / 96 / 100 | 99 / 100 / 100 / 100 | 0.86 s · 16 ms · 0 | 0.91 s · 23 ms · 0 |
| `/learn/prompt-engineering-foundations/how-ai-assistants-respond` | 99 / 100 / 96 / 100 | 99 / 100 / 96 / 100 | 0.90 s · 40 ms · 0 | 0.95 s · 46 ms · 0 |
| `/creators` | 99 / 100 / 96 / 100 | 99 / 100 / 100 / 100 | 0.75 s · 29 ms · 0 | 0.79 s · 16 ms · 0 |

The lesson page's Best practices 96 is the sandbox: it cannot reach `i.ytimg.com`, so the video thumbnail logs a
network error (the facade then falls back to the branded stage). With network access the request succeeds.

**Why mobile Performance stayed below 95 (first pass).** Public pages were rendered by the API as plain, crawlable HTML,
but the designed page was client-rendered: the server HTML was hidden while JavaScript ran, so the first designed paint
needed HTML → CSS + 161 KiB of JS → page chunk → API data → render (~2.4 s FCP / ~3.7 s LCP simulated). Fixed by the
server-side rendering below.

## Server-side rendering (second pass, 2026-10-02)

**Approach.** The React app renders public website pages on the server and the browser hydrates them
(docs/SEO_CRO.md §9.1). A small Node renderer (`frontend/server/ssr-server.mjs`, the `vite build --ssr` bundle
`dist-ssr/entry-server.js`) runs **inside the existing web container** next to nginx (`nginx/40-optimizeall-ssr.sh`; no
new Render service, no Render setting changed). nginx's `@document` asks it for every page; it fetches the API's
`/_document` (status, redirects, SEO head and JSON-LD stay the API's), renders the app with the page's data (the app's own
React Query queries, run against the API with the visitor's forwarded headers) into `#root`, links the route's
stylesheets and embeds the query cache as JSON. If the renderer is down, nginx falls back to the API's document
(the previous behaviour). Every request is rendered (no cache), so CMS edits, posts, courses and case studies are live
immediately — the reason not to prerender at build/publish time. Chosen over making the API's HTML use the design's
markup (two implementations of every page would drift) and over prerendering (stale content, a publish pipeline).

**What makes the first paint cheap.** The page's CSS is render-blocking, nothing else is: the tiny entry
(`src/main.tsx`) waits for the reported first contentful paint, then fetches and evaluates the app in steps (libraries,
routes, app) and hydrates in a transition (time-sliced). Sections below a page's first one use
`content-visibility: auto`; hero headings and leads (the LCP elements) are never animated from transparent; entrance
effects keep what was already painted (IntersectionObserver, no forced layout); the visitor's scroll is kept on
hydration. Hydration is checked by j-seo on every public page (no console error, server elements kept).

**Lighthouse, median of 3 runs**, production nginx + API on SQLite (Baseline, Demo), simulated throttling, "before" =
the branch before this change and "after" = this change, **interleaved page by page in the same runs** so both saw the
same machine load (load average 10.6 / 7.4 / 4.2 in runs 1–3). Raw reports: `perf/lh-final/{before,after}/run{1,2,3}` in
the session scratch directory. Scores are Performance (the three runs in brackets for "after"); A11y and SEO are 100
everywhere, Best practices 100 (96 on the lesson page, i.ytimg.com is unreachable here), CLS 0–0.054 before, 0 after.

| Page (mobile) | Perf before | Perf after (runs) | LCP before → after | FCP before → after | TBT before → after |
|---|---|---|---|---|---|
| `/` | 54.5 | **89** (74, 92, 89) | 4.26 → 2.25 s | 2.57 → 1.50 s | 1805 → 370 ms |
| `/services` | 70.5 | **84** (81, —, 87) | 3.70 → 2.26 s | 2.58 → 1.51 s | 598 → 582 ms |
| `/services/seo` | 77 | **95** (88, 100, 95) | 3.74 → 2.25 s | 2.52 → 1.50 s | 377 → 210 ms |
| `/pricing` | 65 | **79** (79, 70, 98) | 3.87 → 2.26 s | 2.54 → 1.51 s | 929 → 772 ms |
| `/case-studies/northwind-outdoors-organic-growth` | 73 | **78** (70, 78, 98) | 3.81 → 2.25 s | 2.55 → 1.51 s | 476 → 868 ms |
| `/blog` | 61 | **90** (90, 90, 97) | 4.05 → 2.41 s | 2.53 → 1.50 s | 1081 → 317 ms |
| `/blog/google-business-profile-checklist` | 63 | **98** (87, 98, 98) | 4.13 → 2.25 s | 2.65 → 1.50 s | 790 → 33 ms |
| `/contact` | 80 | **98** (82, 98, 98) | 3.72 → 2.25 s | 2.45 → 1.50 s | 312 → 9 ms |
| `/learn` | 61 | **97** (85, 98, 97) | 4.53 → 2.34 s | 2.81 → 1.65 s | 765 → 32 ms |
| `/learn/prompt-engineering-foundations` | 77 | **97** (72, 97, 97) | 4.13 → 2.41 s | 2.84 → 1.66 s | 247 → 14 ms |
| `/learn/…/how-ai-assistants-respond` | 70 | **87** (85, 87, 97) | 4.33 → 2.40 s | 2.72 → 1.65 s | 435 → 413 ms |
| `/creators` | 77 | **93** (93, 90, 99) | 3.70 → 2.10 s | 2.41 → 1.21 s | 397 → 270 ms |

| Page (desktop) | Perf before → after | LCP before → after | TBT before → after |
|---|---|---|---|
| `/` | 97 → 97.5 | 0.92 → 0.52 s | 123 → 103 ms |
| `/services` | 96 → 100 | 0.91 → 0.52 s | 129 → 0 ms |
| `/services/seo` | 98 → 100 | 0.84 → 0.50 s | 116 → 13 ms |
| `/pricing` | 96 → 100 | 0.87 → 0.48 s | 136 → 19 ms |
| `/case-studies/northwind-outdoors-organic-growth` | 99 → 100 | 0.86 → 0.49 s | 61 → 2 ms |
| `/blog` | 99 → 100 | 0.92 → 0.54 s | 43 → 0 ms |
| `/blog/google-business-profile-checklist` | 99 → 100 | 0.82 → 0.50 s | 15 → 0 ms |
| `/contact` | 99 → 100 | 0.80 → 0.48 s | 11 → 0 ms |
| `/learn` | 98 → 100 | 0.98 → 0.58 s | 23 → 21 ms |
| `/learn/prompt-engineering-foundations` | 98 → 100 | 0.93 → 0.49 s | 21 → 0 ms |
| `/learn/…/how-ai-assistants-respond` | 98 → 100 | 0.96 → 0.49 s | 46 → 0 ms |
| `/creators` | 99 → 100 | 0.79 → 0.44 s | 18 → 0 ms |

**Reading the mobile numbers honestly.** FCP and LCP are now network-bound (HTML, CSS and the two self-hosted fonts:
LCP 2.10–2.41 s on every page and every run). What still varies is Total Blocking Time: Lighthouse multiplies the
main-thread time it *observes* by 4, and this sandbox has 4 shared vCPUs used by other agents' test runs, so the same
page scores 70 in a busy run and 98 in a quiet one (pricing, case study). The pages below 95 are the largest ones
(pricing ~1,400 elements, case study, services, home): hydrating them still costs 20–90 ms tasks of real CPU time here.
On the quietest run (run 3) ten of the twelve pages scored 95–99; the home page (89) and /services (87) did not
(/services' second run failed to record a trace three times and is missing). Next steps if a real mid-range phone confirms the gap: Suspense boundaries around below-
the-fold sections (smaller hydration commits) and fewer decorative effects on the largest pages.

**Costs.** Each page view costs the web container one React render or two (30–100 ms of CPU on this machine) on top of
the API's document; the renderer is capped at a 160 MB heap. The app's JavaScript starts after the first paint, so a
click in the first moments after the page appears can arrive before hydration (links still work as plain links).

## Bundle (gzip, `npm run budget`)

| | Before | After | CI budget |
|---|---|---|---|
| Entry JS (module script + modulepreloads) | 227.1 KiB | 161.4 KiB | 170 KiB |
| Entry CSS (render-blocking) | 49.9 KiB | 27.3 KiB | 30 KiB |
| Largest lazy chunk | 18.6 KiB | 19.0 KiB | 25 KiB |
| Largest lazy stylesheet | 9.1 KiB | 9.1 KiB | 12 KiB |
| All JavaScript | 965 KiB | 1,053 KiB (more, smaller chunks) | 1,150 KiB |

The entry is now below Lighthouse's 500 KB "large script without a source map" threshold (raw 562 → 325 KB); source
maps stay disabled in production.

## Security

**Headers** (production nginx with `X-Forwarded-Proto: https`): pages, the app shell and static files send
`Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:
blob: https://i.ytimg.com; font-src 'self' data:; connect-src 'self'; media-src 'self' blob:; frame-src 'self'
https://www.youtube-nocookie.com; worker-src 'self' blob:; manifest-src 'self'; object-src 'none'; base-uri 'self';
form-action 'self'; frame-ancestors 'none'`, `Strict-Transport-Security: max-age=31536000` (new; HTTPS only, sent once),
`X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`,
`Permissions-Policy`, `Cross-Origin-Opener-Policy: same-origin`; portals and sign-in pages add `X-Robots-Tag: noindex,
nofollow`; gzip on HTML/JS/CSS; hashed assets `immutable`. API responses: `default-src 'none'` CSP, nosniff, DENY,
Referrer-Policy, CORP, `Cache-Control: no-store`, HSTS (one year) on HTTPS outside Development. Checked in CI by
`scripts/test-web-nginx.sh` (HSTS present once on https, absent on http).

**OWASP Top 10 review**

| Risk | State |
|---|---|
| A01 Broken access control | Permission-based authorization on every API area; portal guards; IDOR/impersonation covered by `j-auth` (60 tests) and integration tests |
| A02 Cryptographic failures | ASP.NET Identity PBKDF2 password hashing; JWT signing key required ≥ 32 bytes; refresh cookie HttpOnly + Secure + SameSite=Strict, path-scoped; credentials vault for stored provider secrets |
| A03 Injection | EF Core parameterized queries (the two raw queries use internal table names and parameters); Markdown rendered without `dangerouslySetInnerHTML`; server HTML encoded |
| A04 Insecure design | Rate limits per endpoint class; lockout; signed form tokens with honeypot and minimum fill time |
| A05 Security misconfiguration | Swagger off in Production by default; dev mailbox and test sign-in refused in Production; strict headers |
| A06 Vulnerable components | `dotnet list package --vulnerable`: none. `npm audit --omit=dev`: react-router 6.x open-redirect advisory (GHSA-wrjc-x8rr-h8h6) — mitigated: every user-supplied redirect goes through `safeNextPath`, which rejects backslashes, `//` and other origins; the fix exists only in react-router 7 (major upgrade) |
| A07 Identification & authentication | Refresh rotation with reuse detection, CSRF header on cookie endpoints, session revocation on password change; TOTP two-step verification, required for staff by policy (below) |
| A08 Software & data integrity | Lockfiles committed; CI builds from lockfiles |
| A09 Logging & monitoring | Audit log for staff actions and impersonation |
| A10 SSRF | Image hosts allow-listed (`Content:AllowedImageHosts`); outbound integrations use configured base URLs |

## Accessibility

Fixed: blog topic counts (contrast 3.5:1 → ≥ 4.5:1), Academy/Creators brand links and the lecture video button (WCAG
2.5.3 Label in Name). The `a11y` e2e suite (axe WCAG 2.0–2.2 A/AA in light theme + dark-theme contrast at 360/768/1280
px, keyboard and dialog focus tests) now waits for entrance animations to finish before auditing; it measured
half-faded text on a loaded machine before.

## SEO crawl (1,409 sitemap URLs, no JavaScript)

0 non-200, 0 missing title/description/canonical/OG/Twitter/JSON-LD, 0 canonical mismatches, 1 h1 per page, 0 heading
skips, 0 images without alt, 0 duplicate titles. 1 duplicate description (two EU AI Act lessons opened with the same
"Not legal advice" callout) → fixed: lesson descriptions skip a leading callout; a unit test keeps all lesson
descriptions unique.

## Tests run on the final code

* Frontend: `npm run typecheck`, `npm run lint`, `npx vitest run` (118 files, 936 tests), `npm run build`,
  `npm run budget`.
* Backend: integration tests Auth/SecurityHeaders/Impersonation on SQLite (92 incl. the new session-hint test), new
  unit tests `LessonSummaryTextTests`.
* E2E (SQLite, prebuilt API + web), final code: `smoke` 40/40, `j-seo` 71/71 with vite and 71/71 with the production
  nginx, `a11y` 37/37 (failed 3/37 in CI on the same pages — /team, /careers, /blog, /get-a-quote — before the fixes
  above), `j-learning` 11/11, `j-auth` 60/60, `j-partners` 4/4, `j-content` 22/22, `crawl` 20/20.
* `scripts/test-web-nginx.sh` (nginx error mapping + security headers).

## Two-step verification (added after the audit)

Built to the scoped plan, with these deviations: the staff policy is an administrator setting
(`security.requireTwoFactorForStaff`, Admin → Settings → Security) covering every holder of any staff permission
(built-in or custom role) instead of a configured permission list, so it can be changed without a deployment; secrets
use the Data Protection key ring with their own purpose rather than the credential vault's dictionary API (same keys,
same at-rest protection); the QR code is drawn by a small built-in encoder (`frontend/src/lib/qr`, checked against
an independent decoder for every mask and versions 1–38) instead of a dependency.

* API: `POST /auth/login` and the Google callback return a Data-Protection-signed, single-use, 5-minute challenge
  (5 tries, void after a password change) instead of a session; `/auth/2fa/verify` (app or recovery code),
  `/auth/2fa/enroll/*` (forced set-up), `/auth/2fa` settings (set up, confirm, new recovery codes, turn off with
  password + code), `/admin/users/{id}/two-factor/reset` (reason, audited, ends sessions). Replay protection per time
  step, lockout after 10 wrong codes (15 min), every event audited, security emails on enable/disable/reset/recovery
  code use. Unenrolled staff under the policy: sessions end at refresh, no impersonation, forced set-up at sign-in.
* Web: code step on the sign-in and Google callback pages, forced set-up with QR code and recovery codes, a
  two-step verification card on Account security (now in every portal, `/account/security`), status and reset on the
  admin user page, the policy on the settings page.
* Tests: unit (RFC 6238/4226 vectors, recovery codes, replay, attempt limits, lockout, encryption at rest), integration
  (enrolment, sign-in, recovery, disable, admin reset, policy and forced set-up, Google, impersonation, DefaultDeny),
  vitest (sign-in step, set-up, card, admin reset, QR encoder), e2e `j-auth/10a-two-factor.spec.ts` with real time.
* Results on the final code: backend unit 1,753/1,753, integration (SQLite) 1,275/1,275 incl. HostileInput,
  Permission and DefaultDeny contracts, migrations `--check` clean for MySQL and SQLite; frontend typecheck, lint,
  vitest 956/956, build and bundle budget; e2e `j-auth` 64/64 and `smoke` 40/40.
* Not built: "remember this device"; WebAuthn/passkeys.

## Still left

1. **Mobile Lighthouse Performance ≥ 95 on the largest pages under load.** Server-side rendering is done (see
   "Server-side rendering"): mobile LCP < 2.5 s everywhere, 5 of 12 pages ≥ 95 in the median and 10 of 12 in the
   quietest run. The remaining gap is hydration CPU (TBT) on pricing, case studies, services and the home page; measure on a real
   mid-range phone before investing in Suspense-split hydration.
2. **2FA (TOTP) for staff and admin accounts** — done, see "Two-step verification" below.
3. **Demo accounts on the Render blueprint.** `render.yaml` seeds the `Demo` profile, whose accounts have documented
   passwords. Fine for a demo/staging site; a production deployment must drop `Database__Seed__1=Demo` (not changed
   here: deployment settings were out of scope).
4. **CSP `style-src 'unsafe-inline'`.** Kept for style attributes (UI/chart libraries, server-rendered pages' inline
   style block). Scripts are strict. Tightening means hashing the server style block (`style-src-elem`) and auditing
   attribute styles.
5. **react-router 6 advisory** (above): mitigated by `safeNextPath`; upgrade to react-router 7 when the router is next
   touched.
6. **Mobile menu interaction latency** 232–432 ms at 4× CPU on a loaded machine (other interactions ≤ 176 ms): the drawer
   toggles page-wide styles (scroll lock); worth profiling on a real mid-range phone.
7. **Documented portal limitations** (not public-site placeholders): social token exchange for LinkedIn/TikTok/YouTube
   and X media upload are not implemented and say so in the UI/API.
