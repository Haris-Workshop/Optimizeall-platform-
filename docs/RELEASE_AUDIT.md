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
| 1 | Lighthouse ≥ 95 **desktop** (Perf, SEO, A11y, BP) | **Pass** | Perf 97–99, A11y 100, SEO 100, BP 100 (96 on the lesson page, see below) |
| 1 | Lighthouse ≥ 95 **mobile** Performance | **Fail** | Perf 63–78 (was 55–81); A11y/SEO 100, BP 100 |
| 1 | LCP < 2.5 s | Desktop **pass** (0.8–1.1 s) / mobile simulated **fail** (3.7–4.4 s) | Lighthouse; in-browser LCP 0.4–0.7 s (j-seo, unthrottled) |
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
| 4 | 2FA for staff/admin | **Fail — not implemented** | no TOTP support in the code base; plan below |
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

**Why mobile Performance stays below 95.** Public pages are rendered by the API as plain, crawlable HTML (perfect for
SEO), but the designed page is client-rendered: the server HTML is hidden while JavaScript runs, so the first designed
paint needs HTML → CSS + 161 KiB of JS → page chunk → API data → render. Under simulated slow 4G and a 4× slower CPU
that floor is ~2.4 s FCP / ~3.7 s LCP plus 0.3–1 s of main-thread work for 1,000–1,400-element pages. Reaching 95 needs
the designed page in the first HTML response: server-side rendering of the React pages with hydration (or build-time /
publish-time prerendering of the public routes). See "Still left".

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
| A07 Identification & authentication | Refresh rotation with reuse detection, CSRF header on cookie endpoints, session revocation on password change; **no 2FA** (below) |
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

* Frontend: `npm run typecheck`, `npm run lint`, `npx vitest run` (118 files, 934+ tests), `npm run build`,
  `npm run budget`.
* Backend: integration tests Auth/SecurityHeaders/Impersonation on SQLite (92 incl. the new session-hint test), new
  unit tests `LessonSummaryTextTests`.
* E2E (SQLite, prebuilt API + web): `j-auth` 60/60, `j-seo` 71/71 with vite and with the production nginx, `smoke`
  40/40, `a11y`, `j-learning` — see the final report for the last run's counts.
* `scripts/test-web-nginx.sh` (nginx error mapping + security headers).

## Still left

1. **Mobile Lighthouse Performance ≥ 95 / mobile LCP < 2.5 s (simulated).** Needs the designed page in the first HTML
   response. Plan: render the public routes with React on the server (a small Node renderer the API's `/_document` calls,
   or publish-time prerendering of CMS pages into the shell) and `hydrateRoot` on the client; seed React Query from JSON
   embedded in the document so pages render without API round trips. Estimated 1–2 weeks with the SEO/e2e suites as
   the safety net. Interim options measured as low value: further icon/nav splitting (~7 KiB gzip).
2. **2FA (TOTP) for staff and admin accounts** — not present. Scoped plan: `UserTwoFactor` (secret encrypted with the
   existing credential vault, enabled-at, hashed recovery codes, last used time step) + migrations for MySQL and
   SQLite; endpoints to set up (otpauth URI, QR rendered locally), confirm, disable (password + code) and regenerate
   recovery codes; login returns a short-lived single-use challenge when 2FA is on, completed by `POST /auth/2fa/verify`
   (rate-limited, lockout, replay protection), also after Google sign-in; policy `Security:RequireTwoFactorFor`
   (permissions such as settings.manage, users.manage, payouts.*) that forces enrolment after sign-in and before
   impersonation; admin reset with audit log; RFC 6238 test vectors, integration and `j-auth` journeys. ~3 days.
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
