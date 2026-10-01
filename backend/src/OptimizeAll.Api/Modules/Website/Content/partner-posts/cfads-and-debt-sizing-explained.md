---
slug: cfads-and-debt-sizing-explained
title: CFADS and Debt Sizing in Project Finance Explained
description: CFADS explained from first principles, then used to size project finance debt by target DSCR and by gearing, with a worked example and stress test.
cluster: pci-ai
primaryKeyword: CFADS
categories: project-controls
tags: cfads, debt sizing, project finance, dscr, gearing, financial modelling
related: dscr-vs-llcr-vs-plcr, financial-close-in-project-finance, lenders-technical-adviser-role, pfl-ai-project-finance-leader-certification, ppp-and-concession-structures-explained, estimate-at-completion-formulas
publishedDaysAgo: 49
cover: project-controls
coverAlt: Dark blue cover with a cash flow waterfall and the words CFADS and debt sizing
---
Ask a project finance lender how much they will lend and the answer is rarely a multiple of profit or a share of the asset's value. It is a figure worked backwards from the cash the project will generate. That cash has a name, **CFADS**: cash flow available for debt service. Understand CFADS and the logic of debt sizing, and the rest of a project finance model starts to make sense.

Our guide to [DSCR, LLCR and PLCR](/blog/dscr-vs-llcr-vs-plcr) explains how to test a loan against forecast cash flow. This article goes one step earlier and asks how the size of the loan is chosen in the first place. It builds CFADS, sizes debt two ways, compares the results and stress-tests the answer, all with illustrative numbers.

## What CFADS is

CFADS is the cash a project has available, in each period, to pay interest and repay principal before anything is distributed to equity holders. In simplified form:

CFADS = revenue - operating costs - tax paid - increase in working capital - maintenance capital expenditure (where not funded from reserves)

The exact definition is set by the financing documents and varies between deals. Items such as insurance proceeds, reserve account movements, grants and hedging payments are treated differently from one agreement to the next. Always check the definition in the term sheet and loan agreement against the model.

### Why CFADS matters more than the ratios

Every coverage ratio and every sizing calculation inherits CFADS. A 5% error in revenue forecasting becomes a larger percentage error in CFADS, because costs are largely fixed. That operational gearing is why lenders probe revenue assumptions and operating forecasts so thoroughly, and often rely on an independent review; see [the lender's technical adviser role](/blog/lenders-technical-adviser-role).

### A first-year CFADS build

This example uses illustrative figures in millions.

| Line | Year 1 |
|---|---|
| Revenue | 60 |
| Operating costs | (20) |
| Tax paid | (6) |
| Increase in working capital | (2) |
| Maintenance capital expenditure | (6) |
| **CFADS** | **26** |

Lenders will read the quality of each line, not only the total. Revenue contracted under a long-term agreement is treated very differently from revenue exposed to market demand, and that difference shapes the sizing criteria.

## How debt is sized

Debt capacity is commonly the lower of two tests.

1. **A cash flow test:** the largest loan whose scheduled debt service keeps DSCR at or above a target in every period.
2. **A gearing test:** the largest loan allowed as a share of total funding, such as 65% of project cost.

The cash flow test reflects ability to repay. The gearing test reflects how much of their own money sponsors must put at risk. The binding constraint can differ from one project to another and from one set of assumptions to another.

### Sizing by target DSCR: the sculpting logic

If lenders require a DSCR of at least 1.30 in every period, the debt service in each period can be at most CFADS / 1.30. Repayments are then **sculpted** to follow the cash flow shape, rather than fixed as level instalments. The loan that exactly fits is the present value of that allowable debt service, using the loan's interest rate:

Debt capacity = sum of (CFADS / target DSCR) in each period, valued at the interest rate

This calculation is an inversion of the usual direction, because it solves for the loan from the cash flow rather than testing a loan against it.

## A worked example

This example uses illustrative figures. A project costs 200 million to build. The proposed loan has an eight-year repayment period starting after construction, at an interest rate of 7%. Lenders require a minimum DSCR of 1.30 and a maximum gearing of 65%.

### Step 1: allowable debt service and present values

| Year | CFADS | Allowable debt service (CFADS / 1.30) | Present value at 7% |
|---|---|---|---|
| 1 | 26.0 | 20.00 | 18.69 |
| 2 | 28.0 | 21.54 | 18.81 |
| 3 | 30.0 | 23.08 | 18.84 |
| 4 | 32.0 | 24.62 | 18.78 |
| 5 | 33.0 | 25.38 | 18.10 |
| 6 | 34.0 | 26.15 | 17.43 |
| 7 | 34.0 | 26.15 | 16.29 |
| 8 | 34.0 | 26.15 | 15.22 |
| **Total** | | | **142.2** |

The cash flow test supports a loan of about **142.2 million**.

### Step 2: the gearing test

65% of 200 million is **130 million**.

### Step 3: choose the binding constraint

| Test | Debt capacity (millions) |
|---|---|
| DSCR 1.30 sculpted | 142.2 |
| Gearing 65% | 130.0 |
| **Debt sized** | **130.0** |
| Equity | 70.0 |

Gearing binds. The sponsors would need to commit 70 million of equity, and the project has cash flow headroom: the average cover is above the 1.30 minimum. Because the loan is smaller than the cash flow could support, the sculpted DSCR at 130 million is 1.30 x 142.2 / 130 = about 1.42 in every year, and so is the LLCR.

If the sponsors argued for higher gearing, the lenders' response would depend on the downside analysis, not on the headline ratio.

## Stress-testing the answer

A sizing exercise is incomplete without a downside. Suppose CFADS turns out 10% lower in every year.

| Case | Debt | DSCR in each year (illustrative) |
|---|---|---|
| Sized on DSCR alone | 142.2 | 1.30 x 0.90 = 1.17 |
| Sized with gearing cap | 130.0 | 1.42 x 0.90 = 1.28 |

With debt of 142.2 million, a 10% shortfall brings cover to 1.17, which could breach a lock-up level in the documents. At 130 million, cover remains close to the original target. The lower debt is not wasted caution; it buys resilience, and that is what lenders are paying for with a lower gearing limit.

Notice also that the binding constraint can flip. If the lenders sized the deal on the downside case rather than the base case, the cash flow test would support only 142.2 x 0.90 = about 128.0 million, which is below the 130 million gearing cap. DSCR, not gearing, would then bind. This is why sizing discussions turn on which case is the sizing case and how severe it is, and why a sponsor who wants more debt has to argue about the evidence for the downside rather than about the ratio itself.

Other sensitivities worth running:

- **Completion delay.** Postponing operations by a quarter reduces early CFADS while construction interest continues to accrue. Capital cost and schedule forecasts therefore feed directly into debt capacity; see [estimate at completion formulas](/blog/estimate-at-completion-formulas) for how cost forecasts are built.
- **Interest rates.** For floating-rate debt, higher rates raise debt service. Hedging changes the picture.
- **Operating costs.** Fixed costs magnify revenue shortfalls.
- **Tail.** Check that the cash flow after the loan matures still has value, which is the idea behind the project life cover ratio.

## Reserve accounts and other features

Real deals add features that affect CFADS and sizing:

- **Debt service reserve account (DSRA).** A cash buffer held against forthcoming debt service, funded at financial close or from early cash flow. Six months of debt service is a common sizing in practice, but it is a negotiated term rather than a rule, and some deals use a letter of credit instead of cash. It lets a project ride out a short dip.
- **Maintenance reserve.** Smooths lumpy major maintenance, so that CFADS is not distorted in the year it is spent.
- **Cash sweep and lock-up.** Rules that trap or redirect cash when ratios weaken.
- **Different ratios for different phases.** Lenders may accept a lower DSCR for contracted revenue and require a higher one for merchant exposure.

The details come from the term sheet and the financing documents, not from a general rule.

## Common modelling mistakes

- **Using accounting profit instead of cash.** Depreciation, accruals and working capital timing matter.
- **Taxing the wrong base.** Tax depends on interest deductibility and loss carry-forward rules.
- **Circularity.** Interest affects tax, which affects CFADS, which affects debt service. Handle it deliberately, and document it.
- **Mixing real and nominal cash flows.** Keep one convention.
- **Inconsistent timing.** Period-end versus mid-period timing of the present value calculation changes capacity.
- **Unreviewed AI output.** AI tools can help summarise a model or draft assumptions, but a figure that lenders will rely on needs an independent check by a named person.

## Tools that help / Learn it properly

Project finance, financial modelling, capital structure and bankability are among the areas [PCI AI](https://pciai.org) lists for its PFL-AI credential, and CFADS underlies all of them; consult PCI AI's body of knowledge for the authoritative detail, since the sizing walkthrough here is our own. Our [PCI AI partner page](/partners/pci-ai) summarises the credentials, and Optimize All's free course [Project Finance and Financial Modelling](/learn/project-finance-and-financial-modelling) offers hands-on modelling exercises. For the wider credential, see our [PFL-AI certification guide](/blog/pfl-ai-project-finance-leader-certification), and for how public-sector projects structure payments, see [PPP and concession structures explained](/blog/ppp-and-concession-structures-explained).

## Frequently asked questions

### What does CFADS stand for?

Cash flow available for debt service: the cash a project has in a period to pay lenders their interest and principal, before distributions to equity.

### Why is debt sculpted rather than repaid in level instalments?

Sculpting matches repayments to the shape of CFADS, so that cover is steady and debt capacity is maximised for a given target ratio. Level instalments waste capacity in strong years and strain weak ones.

### Is gearing or DSCR the usual limit?

It depends on the project. Whichever test produces the lower debt amount is the binding one, and it can change as assumptions change.

### Are the example numbers typical of real deals?

No. They are illustrative and chosen to make the arithmetic clear. Real targets depend on sector, revenue risk, lenders and market conditions.

---

*Optimize All is the official marketing partner of PCI AI and Certuvo.*
