# Admin content guide: where each part of the public site is edited

A page-by-page map of the public website and the admin screen that controls each piece. All website screens are in the
**agency portal** under **Website** (`/agency/website/...`, permission `site.manage` unless noted). Changes go live at
once (no deploy), are recorded in the audit log, and use concurrency stamps (a stale edit gets "reload" instead of
overwriting someone else's work). The server-rendered HTML, the hydrated React page, the sitemaps, llms.txt and the
Markdown page versions all read the same data, so an edit shows everywhere together.

Shorthand used below:

| Shorthand | Screen | Path |
|---|---|---|
| **Settings → X** | Site settings, tab X | `/agency/website/settings` |
| **Texts → X** | Page texts, page group X (search box finds any text by wording or key; "Reset to default"; "View page") | `/agency/website/copy` |
| **SEO → X** | SEO, tab X (Pages, Crawlers & AI, robots.txt, Sitemaps, llms.txt) | `/agency/website/seo?tab=…` |
| **Pages** | Block-based CMS pages (About, How we work, legal pages, the CMS blocks under Pricing and Contact), with versions and scheduling | `/agency/website/pages` |
| **Services**, **Industries**, **Case studies**, **Testimonials**, **Team**, **Blog**, **Careers**, **Partners**, **Redirects** | The CMS lists of the same name | `/agency/website/…` |
| **Learning** | Admin → Learning (courses; `learning.manage`) | `/admin/learning` |
| **Landing pages** | Agency → Pages (client landing pages and forms) | `/agency/pages` |

Images are uploaded wherever an image field shows an uploader (stored as public content images, `/api/v1/files/…`), or
given as an https URL on an allowed image host.

## Every page (site chrome)

| Piece | Edited in |
|---|---|
| Site name, tagline (footer logo title, `og:site_name`, structured data) | Settings → General |
| Announcement bar (on/off, text, link) | Settings → General |
| **Logo** (header, footer, mobile menu; light and dark-background versions) and **browser icon (favicon)** | Settings → **Brand** (empty: the built-in Optimize All logo and icons) |
| Agency header menu (items, sub-items with descriptions) | Settings → Navigation (the Services mega-menu is built from published service categories) |
| Header button ("Book a consultation") | Settings → Navigation → Header button |
| Quiet header link ("Free Academy") | Settings → Navigation → **Quiet link next to the button** |
| Services mega-menu side panel texts | Texts → Shared site sections (`shared.header.mega*`) |
| Mobile menu "More from Optimize All" title / links | Texts → Shared (`shared.header.productsTitle`) / Settings → Footer → sibling products group |
| Footer blurb, link columns, legal links | Settings → Footer |
| Footer "More from Optimize All" and "Sign in" groups | Settings → Footer (links); Texts → Shared (`shared.footer.productLinksTitle`, `shared.footer.signInTitle`) |
| Footer newsletter title/text, copyright line (`{year}`) | Texts → Shared site sections |
| Contact details (email, phone, WhatsApp, address, hours) in footer and contact page | Settings → Contact & social |
| Social profiles (footer, `sameAs` in structured data) | Settings → Contact & social |
| Cookie banner texts | Texts → Shared site sections |
| Closing call-to-action band (title, text, buttons **and their links**) | Texts → Shared (`shared.cta.*`, `shared.cta.primaryUrl`, `shared.cta.secondaryUrl`) |
| Agency pages' closing call to action (eyebrow, buttons, links, points) | Texts → Agency pages: shared sections (`agency.cta.*`, `agency.cta.primaryUrl`, `agency.cta.secondaryUrl`) |
| Pricing labels "Most popular", "Custom quote" | Texts → Shared (`shared.pricing.*`) |
| 404 page, "not found" message | Texts → Shared site sections |
| Default title template, default title/description, default social image, X handle, site URL | Settings → SEO & organization |
| Organization structured data (legal name, logo, founding year, address, areas served) | Settings → SEO & organization (phone/email from Contact, `sameAs` from Social) |
| Analytics tags (GA4, GTM, Meta Pixel; loaded only after consent) | Settings → Analytics |
| Partner placements (home strip, footer slot, blog unit) | Partners |

## Home (`/`)

| Piece | Edited in |
|---|---|
| **Section order and visibility** (client logos, partner placements, services, results and case studies, how we work, industries, testimonials, latest articles, More from Optimize All, closing call to action and pricing, newsletter; the hero is always first) | Settings → **Page layout** → Home page |
| Hero eyebrow, headline (+ highlighted part), lead, proof points, button labels | Texts → Home page |
| Hero button **links** (`home.hero.primaryCtaUrl`, `home.hero.secondaryCtaUrl`) | Texts → Home page |
| Section eyebrows, titles, intros and "see all" labels | Texts → Home page |
| Service groups and services | Services (categories and services, published ones) |
| Result figures (labelled measured/estimated) | Settings → Home stats & logos |
| Client logos | Settings → Home stats & logos |
| Featured case studies | Case studies (featured flag) |
| Process steps | Texts → Home page (`home.process.steps`, one `Title \| Text` per line) |
| Industries, testimonials | Industries, Testimonials |
| Latest articles | Blog (published posts) |
| "More from Optimize All" band | Texts → Home page (`home.more.*`) |
| Closing call to action (texts, points, button labels and **links**) | Texts → Home page (`home.cta.*`, `home.cta.primaryUrl`, `home.cta.secondaryUrl`) |
| Pricing teaser | Services → packages (and Texts → Home page `home.pricing.*`) |
| Search title/description | Settings → SEO & organization (default title/description) |

## Agency pages

| Page | Content | Texts and SEO |
|---|---|---|
| `/services`, `/services/{slug}` | Services (hero, body, deliverables, process, FAQs, tools, packages, SEO panel) | Texts → Services pages |
| `/pricing` | Services → packages; CMS blocks of the `pricing` page in Pages | Texts → Pricing page |
| `/industries`, `/industries/{slug}` | Industries | Texts → Industries and case studies |
| `/case-studies`, `/case-studies/{slug}` | Case studies (metrics labelled measured/estimated), Testimonials | Texts → Industries and case studies |
| `/about`, `/how-we-work`, legal pages, any CMS page | Pages (blocks, versions, scheduled publishing, SEO panel) | — |
| `/team`, `/careers`, `/careers/{slug}` | Team, Careers | Texts → Team and careers |
| `/blog`, `/blog/{slug}`, topics | Blog (posts, categories, authors, SEO panel) | Texts → Blog |
| `/contact`, `/free-audit`, `/get-a-quote`, `/book-a-consultation` | Contact details (Settings), CMS blocks of the `contact` page; consultation availability in Consultations | Texts → Contact, audit, quote and booking |
| `/partners`, `/partners/{slug}` | Partners (profiles, offers, offerings, related partners) | Texts → **Partners pages** (headline, introductions with `{names}`, search title/description, labels) |
| Redirects of moved addresses | Redirects | — |

## Academy (`/learn`, `/verify`)

| Piece | Edited in |
|---|---|
| Header menu, header button, footer links, footer note and its link | Settings → **Academy & Creators** → Academy |
| Hub texts (hero, subjects, paths, certificates, catalog), course page section titles | Texts → Academy (/learn) |
| `/learn` search title and description | Texts → Academy (`academy.seo.title`, `academy.seo.description`) |
| Courses, lessons, exams, publishing; featured and order in the catalog | Learning |
| Hide a course from search (noindex) or from the sitemap | Learning → course → Catalog placement |

## Creators (`/creators`, `/creators/faq`, campaign pages)

| Piece | Edited in |
|---|---|
| **Section order and visibility** (how it works, earnings, rules, FAQ, call to action; hero first) | Settings → **Page layout** → Creators page |
| Header menu, header button, footer links and note | Settings → **Academy & Creators** → Creators |
| All texts, including button **links** (`creators.hero.primaryCtaUrl`, `creators.hero.secondaryCtaUrl`, `creators.cta.buttonUrl`, `creators.cta.secondaryUrl`) | Texts → Creators program page |
| Signed-out sign-in label in the Creators header | Texts → Shared (`shared.header.creatorSignIn`) |
| FAQ page (`/creators/faq`) questions | Admin → Content → FAQ (`content.manage`); header texts in Admin → Content → Portal texts |
| Campaign landing pages (`/c/{slug}`) | Campaigns (campaign manager) |

## Search engines and AI assistants

| Piece | Edited in |
|---|---|
| Each page's search title/description/canonical/noindex/social image | The content's SEO panel (CMS entities) or SEO → Pages → "Edit snippet" (built-in pages, stored as page texts) |
| Which crawler groups may crawl (search, AI search, AI training, scrapers) | SEO → Crawlers & AI (blocking search engines asks for a typed confirmation) |
| robots.txt additions (rules, extra groups, extra sitemaps) with live preview | SEO → **robots.txt** |
| Sitemap groups, single addresses (exclude/include/add), changefreq/priority | SEO → **Sitemaps** |
| Per-item "Hide from the sitemap" | The item's SEO panel; landing pages: page builder; courses: Learning |
| llms.txt summary, introduction, sections, custom sections, academy guide, on/off | SEO → **llms.txt** (on/off and IndexNow in Crawlers & AI) |
| Security contact (`/.well-known/security.txt`) | SEO → Crawlers & AI |

## MUST-CHANGE before go-live

A fresh production install ships with **no** demo content: the `Demo` seed profile (sample team, testimonials, case
studies, posts, jobs, leads, subscribers, home stats such as "$48M client revenue influenced", and the sample contact
details `+1 415 555 0100` / `100 Market Street, San Francisco, CA`) runs only where `Database:Seed` lists `Demo`
(development and staging, see DEMO.md). Never list it in a production `Database:Seed`. If a database was ever seeded
with it, replace or delete every item below before launch:

| Item | Where |
|---|---|
| Contact email, phone, WhatsApp, address, hours (footer, contact page, organization structured data) | Settings → Contact & social |
| Home statistics (each figure is labelled Measured or Estimated; the demo ones say "Sample figure") | Settings → Home stats & logos |
| Team members, testimonials, case studies, blog posts, job posts | Website → Team / Testimonials / Case studies / Blog / Jobs (unpublish or delete the `*-demo` items) |
| Newsletter subscribers and leads named `*@example.com` | Marketing / CRM (delete) |
| Legal name, founding year, address, areas served | Settings → SEO & organization |
| Security contact | SEO → Crawlers & AI |

## Inventory: what was hard-coded (October 2026) and what became editable

The public components were searched for literal user-facing strings, images, numbers, links, section order, menus,
footer groups, contact details, social links, CTA targets, pricing labels, FAQ lists, structured-data organisation
details and brand assets. Already editable before this pass (see DYNAMIC_CONTENT.md): all marketing texts of the
built-in pages, menus, footer columns, contact, social, announcement, organisation schema, default OG image, home stats,
trust logos and every CMS entity.

| Was hard-coded | Now |
|---|---|
| Home section order/visibility | Settings → Page layout |
| Creators page section order/visibility | Settings → Page layout |
| Home, creators, CTA-band and agency closing CTA button targets | Link page texts (`*Url`) |
| "Free Academy" header link (the setting existed but was neither shown in the admin nor read by the header) | Settings → Navigation |
| Academy and Creators header menus, buttons, footers and notes | Settings → Academy & Creators |
| Footer "More from Optimize All" and "Sign in" groups (titles and links), mobile-menu product group | Settings → Footer + Texts → Shared |
| Logo (header/footer) and favicon | Settings → Brand |
| "Most popular", "Custom quote" | Texts → Shared |
| "Creator sign in" label; product headers' "Optimize All" back link | Texts → Shared; the site name |
| Partners pages (headline, introductions, search title/description, profile labels) | Texts → Partners pages |
| `/learn` search title and description | Texts → Academy |
| robots.txt, sitemap and llms.txt content beyond the crawler toggles | SEO → robots.txt / Sitemaps / llms.txt |
| No "hide from sitemap" anywhere; no noindex for courses | Per-item switches (CMS entities, landing pages, courses) |

Still in code, deliberately (interface or legal text, not business content — the policy of DYNAMIC_CONTENT.md):

* **Form labels, validation messages, generic buttons and ARIA labels** (contact/audit/quote/booking/careers forms,
  newsletter field, cookie banner buttons, "Skip to content", "Open menu", search page labels, "min read").
* **Consent texts** (versioned in `Leads/ConsentTexts`; every stored consent references its version).
* **Utility and error pages**: newsletter confirm/unsubscribe results, the search page, route error and 403 pages,
  certificate verification messages — system messages, all `noindex`.
* **Measured/Estimated labels** on figures: an honesty rule, not wording to change.
* **Illustration labels** inside decorative artwork (`HomeArt`, `CreatorsArt`, `art.tsx`: "Growth overview",
  "Certificate earned", "Your name here"…): parts of the drawings, `aria-hidden`.
* **Campaign landing (`/c/…`) and invitation (`/join/…`) frames**: the campaign's own texts come from the campaign; the
  disclosure rules ("Paid posts are always disclosed") are policy text kept with the creator terms.
* **Academy structured-data description** and the built-in fallback menus (shown only if the settings cannot be
  loaded; they mirror the defaults).
* **Section designs and hero artwork**: sections can be reordered and hidden, not restyled; the hero illustrations follow
  the content (service categories, payout schedule text).

Known quirk kept as it was: the shipped footer columns include "More from Optimize All" and "Sign in" columns *and* the
footer renders its two dedicated groups of the same names, so a fresh install shows both. Remove the two columns in
Settings → Footer (or empty the groups) to show them once.
