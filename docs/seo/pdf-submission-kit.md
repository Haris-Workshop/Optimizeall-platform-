# PDF submission and outreach kit — PCI AI and Certuvo

This kit is for the Optimize All team to distribute the seven free PDF guides and the partner articles **by hand**,
from accounts the team controls. Nothing here has been posted anywhere yet: accounts on third-party sites must be
created and used by people, under each site's terms.

Replace `https://www.optimizeall.com` below with the live site origin if it differs (Website → SEO → Site URL). If the
origin differs, also rebuild the PDFs so the links inside them are right:
`SITE_URL=https://your-domain PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node content/downloads/build.mjs`.

## Ground rules (read first)

- **Quality over volume.** Publish each guide on a handful of relevant, reputable platforms — not dozens of
  "document directories". Mass submission to low-quality sites is a link scheme under Google's spam policies and can
  hurt optimizeall.com, pciai.org and certuvo.com.
- **One canonical home.** The canonical version of every guide is its URL on optimizeall.com (`/downloads/...pdf`) and
  the hub page `/blog/free-project-controls-and-exam-prep-guides`. Where a platform supports it, set the canonical URL
  to the original article. Where it does not (most document hosts), write an original description and link back,
  rather than pasting the full article text.
- **Republishing articles.** Only republish an article in full where you can set `rel=canonical` to the original
  (for example Medium's import tool, or a platform's "originally published at" canonical field). Otherwise publish a
  short summary (150–300 words) with a link to the full article.
- **Expect nofollow.** Most user-generated platforms (LinkedIn, Medium, SlideShare, Scribd, Issuu, Reddit, Quora) mark
  outbound links `nofollow`/`ugc`. Their value is referral traffic, brand searches and discovery by people who may then
  link editorially — not direct ranking credit. Do not chase "dofollow" lists.
- **Disclose the relationship.** Every description below ends with the disclosure. Keep it: Optimize All is the official
  marketing partner of PCI AI and Certuvo, and readers (and platforms' rules) expect commercial relationships to be clear.
- **Partner facts.** Do not add claims about PCI AI or Certuvo beyond what their own sites say (no pass rates,
  guarantees, accreditations or prices that the partners have not published and confirmed).
- **Space it out.** Publish one or two guides a week across the platforms. Respond to comments. Update the uploaded
  copy when the PDF changes.
- **UTM tags.** Use `?utm_source=<platform>&utm_medium=referral&utm_campaign=free-guides` on links back to
  optimizeall.com where the platform allows, so you can see what works in analytics. Never add UTM tags to canonical
  URLs.

## Recommended platforms

| Platform | What to post | Canonical / link-back | Notes |
|---|---|---|---|
| LinkedIn — company page posts and document (PDF carousel) posts | Upload the PDF as a document post with a 3–5 line summary | Link to the hub page in the post or first comment | Best fit for project professionals. Post from the Optimize All page; partners can reshare. |
| LinkedIn articles (newsletter) | Short summaries of the articles (not full copies) | Link to the full article | LinkedIn articles have no canonical field — never paste the full article. |
| Medium (own publication) | Selected articles imported with Medium's import tool | Import sets the canonical to the original | Use only the import tool so `rel=canonical` is set. |
| Substack or a newsletter tool | Monthly "free guides" issue with summaries | Links to articles and PDFs | Builds an owned audience. |
| SlideShare (Scribd) | Each PDF with an original description | Link to the hub page in the description | Choose the "Business" / "Education" categories. |
| Scribd | Each PDF | Link back in the description | Check the current upload terms. |
| Issuu | The guides as a "free guides" publication | Link back in the description | Good for a combined collection later. |
| Academia-style / resource sites run by professional communities | Only where the community accepts practitioner resources (e.g. PMI chapter resource libraries, AACE section newsletters, university PM societies) | Ask the editor to link to the hub page | Contact the chapter or editor; never post where resources are not invited. |
| Reddit (r/projectmanagement, r/pmp, r/CPA, r/nursing-related communities) | Answer specific questions and mention a guide only where it genuinely helps; follow each subreddit's self-promotion rules | Link to the specific guide or article | Many subreddits ban or limit self-promotion — read the rules and participate first. |
| Quora / Stack Exchange (Project Management) | Helpful answers; cite a guide where it adds value | Link to the article | Answers must stand on their own without the link. |

Avoid: generic "PDF submission site" lists, article spinners, private blog networks, paid link placements without
`rel="sponsored"`, and any site whose main purpose is hosting links.

## Copy for each PDF

Each block: title · description (paste as the upload description) · tags · canonical/link-back URL.

### 1. Earned Value Management Cheat Sheet

- **File:** `https://www.optimizeall.com/downloads/earned-value-management-cheat-sheet.pdf`
- **Description:** A two-page earned value management reference for project controls professionals: PV, EV, AC and BAC
  explained; CV, SV, CPI and SPI with how to read them; four EAC methods, VAC and TCPI with when to use each; a summary
  of progress measurement methods (rules of credit); a worked mini-example; and a five-question health check to run
  before you present CPI or SPI. Full guide with a worked example:
  https://www.optimizeall.com/blog/earned-value-management-explained — Published by Optimize All. Optimize All is the
  official marketing partner of PCI AI and Certuvo.
- **Tags:** earned value management, EVM, CPI, SPI, estimate at completion, project controls, cost control, PCL-AI
- **Link back:** https://www.optimizeall.com/blog/earned-value-management-explained

### 2. Schedule Health Check Template

- **File:** `https://www.optimizeall.com/downloads/schedule-health-check-template.pdf`
- **Description:** A printable template for the DCMA 14-point schedule assessment: each check with the thresholds
  commonly quoted, columns for your result and a justification for accepted exceptions, a six-step review workflow, a
  trend tracker and sign-off. Use it at baseline and every schedule update. How to read each failure and fix it:
  https://www.optimizeall.com/blog/dcma-14-point-schedule-assessment — Published by Optimize All. Optimize All is the
  official marketing partner of PCI AI and Certuvo.
- **Tags:** DCMA 14 point assessment, schedule quality, critical path, project scheduling, Primavera P6, planning,
  project controls
- **Link back:** https://www.optimizeall.com/blog/dcma-14-point-schedule-assessment

### 3. AI in Project Controls: A Practical Playbook

- **File:** `https://www.optimizeall.com/downloads/ai-in-project-controls-playbook.pdf`
- **Description:** A practical playbook for using AI in scheduling, cost control, forecasting, risk and reporting:
  use cases with the level of human review each needs, a governance checklist, prompt patterns that keep outputs
  grounded in your data, a review workflow for AI-assisted reports and a 30-day pilot plan. Background:
  https://www.optimizeall.com/blog/ai-for-project-scheduling — Published by Optimize All. Optimize All is the official
  marketing partner of PCI AI and Certuvo.
- **Tags:** AI in project controls, AI project scheduling, AI cost forecasting, AI governance, project management, PMO
- **Link back:** https://www.optimizeall.com/blog/ai-for-project-scheduling

### 4. Choosing a Project Controls Certification

- **File:** `https://www.optimizeall.com/downloads/choosing-a-project-controls-certification.pdf`
- **Description:** A two-page worksheet for planners, cost engineers and controls analysts comparing PCI AI's PCL-AI,
  AACE International's CCP, PSP and EVP, and PMI's PMI-SP, PMI-RMP and PMP by scope and audience, with a five-question
  decision worksheet and a pre-registration checklist. Always confirm requirements with the awarding body. Full
  comparison: https://www.optimizeall.com/blog/project-controls-certifications-compared — Published by Optimize All.
  Optimize All is the official marketing partner of PCI AI and Certuvo.
- **Tags:** project controls certification, PCL-AI, PCI AI, AACE, PSP, CCP, PMI-SP, career development
- **Link back:** https://www.optimizeall.com/blog/project-controls-certifications-compared

### 5. PMP Study Plan: 8-Week Checklist

- **File:** `https://www.optimizeall.com/downloads/pmp-study-plan-8-week-checklist.pdf`
- **Description:** A printable eight-week PMP study plan for people with full-time jobs: a typical weekly routine,
  weekly goals from orientation to consolidation, a four-question method for reviewing practice questions, an error
  log and mock exam dates. Starts with checking PMI's current exam content outline. Full guide:
  https://www.optimizeall.com/blog/pmp-study-plan — Published by Optimize All. Optimize All is the official marketing
  partner of PCI AI and Certuvo.
- **Tags:** PMP study plan, PMP exam, PMP 2026, project management certification, exam prep, study schedule
- **Link back:** https://www.optimizeall.com/blog/pmp-study-plan

### 6. Certification Exam Day Checklist

- **File:** `https://www.optimizeall.com/downloads/certification-exam-day-checklist.pdf`
- **Description:** A one-sheet exam day checklist for the PMP and other computer-based professional exams, online or at
  a test centre: the week before, the night before and the morning; a pacing worksheet with checkpoints and a
  flag-and-move rule; and a 60-second reset for moments of panic. Official exam rules always take precedence. Full
  guide: https://www.optimizeall.com/blog/pmp-exam-day-checklist — Published by Optimize All. Optimize All is the
  official marketing partner of PCI AI and Certuvo.
- **Tags:** exam day checklist, PMP exam day, online proctored exam, exam time management, exam anxiety
- **Link back:** https://www.optimizeall.com/blog/pmp-exam-day-checklist

### 7. Exam Readiness Scorecard

- **File:** `https://www.optimizeall.com/downloads/exam-readiness-scorecard.pdf`
- **Description:** Decide whether to sit or move your exam with evidence, not nerves: an eight-line weekly readiness
  scorecard, a mock exam log, guidance on when to move your date and a two-week repair plan. Works for the PMP, CPA,
  CMA, CIA, CISA, CFA, NCLEX and PCI AI exams. Full guide: https://www.optimizeall.com/blog/exam-readiness-checklist —
  Published by Optimize All. Optimize All is the official marketing partner of PCI AI and Certuvo.
- **Tags:** exam readiness, mock exam, certification exam, study plan, PMP, CPA, NCLEX
- **Link back:** https://www.optimizeall.com/blog/exam-readiness-checklist

## A four-week publishing schedule

| Week | LinkedIn (page) | SlideShare / Scribd / Issuu | Article summaries (LinkedIn / Medium import) |
|---|---|---|---|
| 1 | EVM cheat sheet (document post) | EVM cheat sheet | EVM explained (summary) |
| 2 | PMP study plan checklist | PMP checklist; exam day checklist | PMP study plan (Medium import, canonical) |
| 3 | Schedule health check template | Schedule health check; AI playbook | DCMA 14-point (summary) |
| 4 | Exam readiness scorecard; certification chooser | Readiness scorecard; certification chooser | PMP vs PCL-AI (summary) |

After week 4, publish one new article summary a week and share the hub page monthly.

## Outreach plan (earned, editorial links)

1. **Partner cross-linking (highest value, fully legitimate).**
   - Ask PCI AI to link to the relevant guides from its resources or candidate-preparation pages (e.g. EVM cheat sheet,
     schedule health check, choosing a project controls certification) and to the hub page.
   - Ask Certuvo to link to the PMP study plan, exam day checklist and readiness scorecard from its blog or help pages.
   - Ask both to mark paid or reciprocal placements appropriately (`rel="sponsored"` where the link is part of the
     commercial relationship). Avoid sitewide footer links and exact-match anchor text.
2. **Guest articles.** Pitch original articles (not copies) to project-controls and PM publications, PMI chapter and AACE
   section newsletters, construction and engineering trade blogs and accounting/audit education blogs. Each article links
   once, naturally, to the most relevant guide. Suggested pitches: "A schedule health check you can run in an hour",
   "What the 2026 PMP outline means for study plans", "Five questions before you trust a CPI".
3. **Communities.** Join PMI chapter events, AACE section meetings, LinkedIn groups for planners and cost engineers, and
   exam-prep communities. Share the guides when someone asks a question they answer; otherwise contribute without links.
4. **Resource pages.** Search for university and training resource pages that list free project controls or exam-prep
   templates (e.g. "project controls templates resources", "PMP study resources free"). Email the editor with one
   specific guide that fits their list.
5. **Digital PR (optional).** A short data-driven piece — for example an anonymised survey of how planners use AI —
   can earn links from trade media. Only publish data you actually collected.

Track outreach in a simple sheet: site, contact, date, guide pitched, response, link live (URL), rel attribute.

## Search console set-up for pciai.org and certuvo.com

These steps are for the partners' own teams (they own the domains). Share them with PCI AI and Certuvo.

### Google Search Console

1. Go to https://search.google.com/search-console and add a **Domain property** (`pciai.org` / `certuvo.com`).
2. Verify ownership with the **DNS TXT record** Google shows (add it at the domain's DNS host; wait for propagation,
   then click Verify).
3. Open **Sitemaps** and submit the sitemap URL (usually `https://pciai.org/sitemap.xml` or the sitemap index the
   site's CMS generates). Make sure `robots.txt` lists it with a `Sitemap:` line.
4. Use **URL inspection** on the key pages (certification pages, sample questions, exam prep pages) and click
   **Request indexing** after publishing important changes.
5. Check **Pages** (indexing) and **Core Web Vitals** monthly; fix "Crawled – currently not indexed" pages by improving
   content, internal links or removing thin duplicates.
6. Add Optimize All's team as a **restricted user** if the partners want us to monitor performance.

### Bing Webmaster Tools

1. Go to https://www.bing.com/webmasters and sign in.
2. Use **Import from Google Search Console** (fastest) or add the site and verify with a DNS record, meta tag or XML
   file.
3. Submit the same sitemap under **Sitemaps**.
4. Optionally enable **IndexNow** (supported by Bing and other engines) so new and updated URLs are submitted
   automatically. Optimize All's own site already supports IndexNow (Website → SEO).

### For optimizeall.com

Submit `https://www.optimizeall.com/sitemap.xml` (sitemap index generated by the API) in both consoles if not already
done, then use URL inspection on `/blog/free-project-controls-and-exam-prep-guides` and the new posts after deployment.
The PDFs are discovered through links from those pages; Search Console's URL inspection also works on PDF URLs.

## Measuring results

- Search Console (optimizeall.com): impressions and clicks for the new posts' primary keywords (see
  `docs/seo/partner-keyword-map.md`), and for `/downloads/*.pdf` URLs.
- Analytics: referral sessions from the platforms above (UTM `campaign=free-guides`), PDF downloads, and outbound
  partner clicks (the site tracks partner link clicks).
- Partners: ask PCI AI and Certuvo for referral traffic from optimizeall.com in their analytics each month.
