# Partner keyword map — PCI AI and Certuvo

Optimize All is the official marketing partner of **PCI AI** (pciai.org) and **Certuvo** (certuvo.com). This map plans
the partner content on the Optimize All blog (`backend/src/OptimizeAll.Api/Modules/Website/Content/partner-posts/`):
which search intent each post serves, the one **primary keyword** it owns, its secondary keywords and how posts link to
each other, to the partner pages (`/partners/pci-ai`, `/partners/certuvo`), to the Academy (`/learn/...`), to the free
PDF guides (`/downloads/*.pdf`) and out to the partner sites.

Principles (Google's spam policies and helpful-content guidance):

- **One primary keyword per page.** `PartnerPostLibraryTests` enforces unique primary keywords; check this map before
  adding a post so two pages never compete for the same query (cannibalisation).
- **People-first.** Every post answers a real question with steps, worked examples or checklists. Keywords appear where
  they read naturally (title, description, first paragraph, one or two headings) — no stuffing, no doorway pages, no
  spun variants of the same article for different keywords.
- **Facts.** Partner facts come only from the partners' own sites (as recorded in `PartnerBaselineSeeder`). Exam rules
  (PMI, AACE, IIA, ISACA, IMA, AICPA/NASBA, NCSBN) are stated generally, and every post tells readers to confirm the
  current requirements with the official body.
- **Links.** 1–3 links per post to pciai.org / certuvo.com (enforced), a link to the matching partner page, at least
  one Academy course, and related posts. Every new post is linked from at least two other posts.
- **Disclosure.** Every post ends with "Optimize All is the official marketing partner of PCI AI and Certuvo."

Search intent legend: **I** informational (learn/how-to), **C** commercial investigation (compare/choose),
**N** navigational/brand, **T** transactional-adjacent (templates, downloads, checklists).

## Cluster 1 — PCI AI: project controls, AI in controls, careers and certification

Pillar pages: `/partners/pci-ai` (brand/navigational: "PCI AI", "PCL-AI", "PFL-AI", "PML-AI") and the existing pillar
post `what-is-project-controls`.

### Existing posts (keep their primary keywords; do not target these again)

| Post | Primary keyword |
|---|---|
| what-is-project-controls | what is project controls |
| earned-value-management-explained | earned value management |
| earned-schedule-explained | earned schedule |
| estimate-at-completion-formulas | estimate at completion |
| critical-path-method-explained | critical path method |
| schedule-risk-analysis-monte-carlo | schedule risk analysis |
| project-controls-kpis-dashboard | project controls KPIs |
| project-controls-vs-project-management | project controls vs project management |
| how-to-become-a-project-controls-professional | project controls career |
| ai-in-project-controls | AI in project controls |
| ai-governance-policy-for-project-teams | AI governance for projects |
| ai-prompts-for-project-managers | AI prompts for project managers |
| agile-vs-hybrid-project-delivery-with-ai | agile vs hybrid project management |
| choosing-a-project-management-certification | project management certification |
| what-is-pcl-ai-certification | PCL-AI certification |
| pfl-ai-project-finance-leader-certification | PFL-AI certification |
| pml-ai-project-management-leader-certification | PML-AI certification |
| cfads-and-debt-sizing-explained | CFADS |
| dscr-vs-llcr-vs-plcr | DSCR vs LLCR vs PLCR |
| ppp-and-concession-structures-explained | PPP concession structure |
| financial-close-in-project-finance | financial close in project finance |
| lenders-technical-adviser-role | lender's technical adviser |

### New posts (this batch)

| Sub-topic | Post (`/blog/...`) | Intent | Primary keyword | Secondary keywords | PDF |
|---|---|---|---|---|---|
| Scheduling quality | dcma-14-point-schedule-assessment | I/T | DCMA 14-point assessment | schedule health check, schedule quality metrics, CPLI, BEI, missing logic | Schedule health check template |
| Scheduling | resource-levelling-explained | I | resource levelling | resource smoothing, resource histogram, resource-driven critical path | Schedule health check template |
| Scheduling tools | project-scheduling-software-guide | C | project scheduling software | Primavera P6 vs Microsoft Project, planning tools, XER/MPP exchange, CPM software | Schedule health check template |
| Scheduling / claims | delay-analysis-methods | I | delay analysis methods | time impact analysis, windows analysis, as-planned vs as-built, collapsed as-built, fragnet | Schedule health check template |
| AI in scheduling | ai-for-project-scheduling | I/C | AI for project scheduling | AI scheduling tools, AI schedule review, AI planning assistant | AI in project controls playbook |
| Scope | work-breakdown-structure-guide | I | work breakdown structure | WBS dictionary, 100% rule, control accounts, work package | — |
| Cost control | how-to-build-a-cost-baseline | I | cost baseline | time-phased budget, planned value, performance measurement baseline | EVM cheat sheet |
| Cost / risk | contingency-vs-management-reserve | I | contingency vs management reserve | cost contingency, risk reserve, contingency drawdown, P80 | — |
| Estimating | cost-estimate-classification-aace | I | cost estimate classification | AACE estimate classes, class 5 estimate, class 3 estimate, basis of estimate | — |
| Governance | project-change-control-process | I/T | project change control | change log template, change request process, change control board | — |
| EVM | progress-measurement-methods | I | progress measurement methods | rules of credit, weighted milestones, 50/50 rule, level of effort | EVM cheat sheet |
| EVM / reporting | s-curve-project-management | I | S-curve in project management | planned vs earned vs actual, cumulative cost curve | EVM cheat sheet |
| Forecasting / AI | ai-cost-forecasting-for-projects | I/C | AI cost forecasting | machine learning EAC, cost anomaly detection, forecast ranges | AI playbook, EVM cheat sheet |
| Finance x controls | project-cash-flow-forecasting | I | project cash flow forecasting | cost vs cash, retention, payment terms, funding requirement | — |
| Reporting | project-controls-monthly-report | I/T | project controls monthly report | project status report template, variance narrative, executive summary | AI playbook |
| Careers | project-controls-interview-questions | I | project controls interview questions | planner interview questions, cost controller interview, EVM interview | EVM cheat sheet, certification chooser |
| Certification | project-controls-certifications-compared | C | project controls certification | PCL-AI vs AACE, PSP vs PMI-SP, CCP, EVP, PMI-RMP | Choosing a project controls certification |

## Cluster 2 — Certuvo: certification exam preparation

Pillar pages: `/partners/certuvo` (brand: "Certuvo", "Certuvo AI Coach", "<exam> exam prep") and the existing posts
`pmp-exam-prep-pmbok-7` (PMP), `how-to-choose-an-exam-question-bank` and `spaced-repetition-and-active-recall-for-exams`.

Certuvo lists preparation for CIA, CISA, CMA, CPA, CFA, PMP, NCLEX-RN, NCLEX-PN and PCI AI's PCL-AI, PFL-AI and PML-AI.
Credentials Certuvo does **not** list (CAPM, PMI-SP, PMI-RMP, AACE, PRINCE2) are covered only for comparison/context, never
implying Certuvo prepares for them.

### Existing posts (keep)

| Post | Primary keyword |
|---|---|
| pmp-exam-prep-pmbok-7 | PMP exam prep |
| pmp-agile-situational-questions | PMP agile questions |
| how-to-pass-the-cpa-exam / cpa-exam-sections-explained / cpa-task-based-simulations-guide | how to pass the CPA exam / CPA exam sections / CPA task-based simulations |
| cma-exam-study-plan / cma-essay-questions-technique | CMA exam study plan / CMA essay questions |
| cia-exam-preparation-guide / cia-part-1-essentials-of-internal-auditing | CIA exam preparation / CIA Part 1 |
| cisa-exam-preparation-guide / cisa-domain-5-protection-of-information-assets | CISA exam preparation / CISA domain 5 |
| cfa-exam-study-strategies / cfa-level-1-study-schedule | CFA exam study strategies / CFA Level 1 study schedule |
| asc-606-vs-ifrs-15-study-notes | ASC 606 vs IFRS 15 |
| nclex-ngn-question-types / nclex-rn-vs-nclex-pn / nclex-prioritization-frameworks / nclex-delegation-questions | NGN question types / NCLEX-RN vs NCLEX-PN / NCLEX prioritization / NCLEX delegation questions |
| how-to-choose-an-exam-question-bank, how-to-review-a-mock-exam, spaced-repetition-and-active-recall-for-exams, how-to-use-an-ai-study-coach, study-for-certification-while-working-full-time | exam question bank, mock exam review, spaced repetition for exams, AI study coach, study for certification while working |

### New posts (this batch)

| Sub-topic | Post (`/blog/...`) | Intent | Primary keyword | Secondary keywords | PDF |
|---|---|---|---|---|---|
| PMP plan | pmp-study-plan | I/T | PMP study plan | 8 week PMP study plan, PMP study schedule, how to study for PMP while working | PMP 8-week checklist, readiness scorecard |
| PMP eligibility | pmp-eligibility-requirements | I | PMP eligibility requirements | 35 contact hours, PMP experience requirements, PMP audit, PMP application | — |
| PMP vs CAPM | capm-vs-pmp | C | CAPM vs PMP | CAPM or PMP first, CAPM eligibility, entry-level project management certification | — |
| PMP practice | pmp-practice-questions | I/C | PMP practice questions | PMP question bank, PMP mock exam, PMP error log | PMP checklist, readiness scorecard |
| PMP exam day | pmp-exam-day-checklist | I/T | PMP exam day | PMP online exam checklist, PMP test centre, PMP ID requirements | Exam day checklist |
| PMP renewal | pmp-renewal-pdus | I | PMP PDUs | PMP renewal, Talent Triangle PDUs, CCR, earn PDUs | — |
| PMP 2026 update | pmp-exam-changes-2026 | I | PMP exam changes 2026 | new PMP exam content outline, PMP ECO 2026, PMBOK 8 PMP | PMP checklist |
| Exam skills | exam-anxiety-strategies | I | exam anxiety | test anxiety tips, calm down during exam, exam nerves | Exam day checklist |
| Exam skills | exam-time-management-strategies | I | exam time management | exam pacing, time per question, flagging questions | Exam day checklist |
| Exam skills | exam-readiness-checklist | I/T | exam readiness | am I ready for my exam, when to reschedule exam, mock exam score | Readiness scorecard |
| Planning | certification-study-plan-template | T | certification study plan | study plan template, exam study schedule, gap analysis | Readiness scorecard |
| Accounting | cma-vs-cpa | C | CMA vs CPA | CMA or CPA, management accountant vs CPA | — |
| Audit | cia-vs-cisa | C | CIA vs CISA | internal audit vs IT audit certification, CISA domains | — |
| Nursing | nclex-study-plan | I/T | NCLEX study plan | NCLEX 6 week study plan, NGN study plan, NCLEX daily questions | Readiness scorecard |

## Cluster 3 — Cross (both partners)

| Post | Intent | Primary keyword | Secondary keywords | Notes |
|---|---|---|---|---|
| how-to-prepare-for-pci-ai-exams (existing) | I | PCL-AI exam preparation | PFL-AI exam, PML-AI exam | Links both partner pages |
| scenario-based-exam-questions-technique (existing) | I | scenario-based exam questions | situational questions | |
| pmp-vs-pcl-ai (new) | C | PMP vs PCL-AI | project management vs project controls certification | Bridges Certuvo's PMP audience to PCI AI |
| free-project-controls-and-exam-prep-guides (new) | T | free project controls PDF guides | EVM cheat sheet PDF, PMP study plan PDF, schedule health check template | Hub for all seven PDFs (crawlable resources listing) |

## Free PDF guides (`frontend/public/downloads/`, sources in `content/downloads/`)

| PDF | Primary audience | Linked from (posts) | Also linked from |
|---|---|---|---|
| earned-value-management-cheat-sheet.pdf | PCI AI | cost baseline, S-curve, progress measurement, interview questions, AI cost forecasting, hub | PCI AI partner description (new installs) |
| schedule-health-check-template.pdf | PCI AI | DCMA 14-point, resource levelling, scheduling software, delay analysis, hub | PCI AI partner description |
| ai-in-project-controls-playbook.pdf | PCI AI | AI for scheduling, AI cost forecasting, monthly report, hub | PCI AI partner description |
| choosing-a-project-controls-certification.pdf | PCI AI / cross | certifications compared, interview questions, PMP vs PCL-AI, hub | PCI AI partner description |
| pmp-study-plan-8-week-checklist.pdf | Certuvo | PMP study plan, PMP practice questions, PMP exam changes 2026, PMP vs PCL-AI, hub | Certuvo partner description |
| certification-exam-day-checklist.pdf | Certuvo | PMP exam day, exam time management, exam anxiety, hub | Certuvo partner description |
| exam-readiness-scorecard.pdf | Certuvo | exam readiness, study plan template, PMP study plan, PMP practice questions, NCLEX study plan, hub | Certuvo partner description |

PDFs are not listed in the XML sitemaps: every sitemap URL must render a page (the crawl e2e opens each one in the
browser and `ISitemapContributor` paths must be server-rendered). They are discovered through ordinary links from the
posts, the hub post and the partner pages, which is how Google finds and indexes PDFs.

## Internal-link plan

1. **Hub and spoke.** Pillars (`what-is-project-controls`, `earned-value-management-explained`, `pmp-exam-prep-pmbok-7`,
   the partner pages) link out to the new spokes through their `related` lists; spokes link back to pillars in the body.
2. **Sibling links.** Posts in the same sub-topic link to each other in the body where the reader needs the next step
   (e.g. cost baseline → contingency → change control → monthly report; PMP eligibility → study plan → practice
   questions → readiness → exam day → PDUs).
3. **Cross-cluster bridges.** `pmp-vs-pcl-ai`, `project-controls-certifications-compared` and
   `free-project-controls-and-exam-prep-guides` connect the two partner audiences.
4. **Academy.** PCI AI posts → `/learn/project-controls-with-ai` (plus project finance / PM leadership where relevant);
   Certuvo posts → `/learn/professional-certification-exam-success` (plus PM leadership for PMP topics).
5. **Partner sites.** At most three links per post to pciai.org / certuvo.com, in context (official exam facts →
   pciai.org; practice and AI Coach → certuvo.com). The site renders them as partnership links (`rel="sponsored"`).
6. **Existing installs.** The partner-content seeder is insert-only, so `related` changes to existing posts and the new
   partner-page paragraphs reach only fresh databases. On production, editors can add the same links in Website → Blog
   and Website → Partners if wanted; the new posts themselves are inserted on the next deploy.

## Next keyword opportunities (not yet written)

- PCI AI: "basis of estimate template", "schedule narrative", "earned value for agile", "project controls in
  construction", "look-ahead schedule", "risk register template", "PFL-AI study plan", "PML-AI study plan".
- Certuvo: "CFA Level 2 study plan", "CPA FAR study plan", "CISA practice questions", "CIA Part 2", "NCLEX-PN study
  plan", "how to retake a failed certification exam".
- Before writing, check the primary keyword is not already owned above and that the post can add something genuinely
  new (a worked example, a template or a decision framework).
