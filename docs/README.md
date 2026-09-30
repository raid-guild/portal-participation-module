# RaidGuild Participation Shares

This directory records design discussion for optional member contributions and
possible DAO share issuance. Cohort participation and graduate recognition are
free; the mostly async cohort format will be designed separately. A discounted
member share rate is proposed, pending DAO approval. No payment issues shares.

The broader product direction is documented in
[Participation Dashboard Product Spec](./participation-dashboard-product-spec.md).
Its historical paid-cohort and approved-share assumptions are superseded by the
current policy direction at the top of that spec.

Implementation and payment setup are described in the
[Next.js Module Technical Spec](./nextjs-module-technical-spec.md) and
[Payment Provider Integration](./payment-provider-integration.md). The
[Entitlement Service API](./entitlement-service-api.md) defines the boundary
for Portal, Discord, manual operators, and future agents. The
[Prism Participation Metrics](./prism-participation-metrics.md) runbook defines
the weekly admin-only snapshot integration.
Deliberately deferred production and governance work is tracked in the
[Future Feature Checklist](./future-feature-checklist.md).

Two share-issuance approaches have been discussed:

1. [Manual payment review and batch `mintShares`](./stripe-batch-mint.md) — reconcile
   optional member payments to the DAO treasury and submit a reviewed batch
   share issuance through a normal DAO proposal, if the SOP is approved.
2. [Onchain subscription Shaman](./onchain-subscription-shaman.md) — hold wxDAI
   in member escrows and settle subscriptions onchain each month.

The manual batch proposal is the proposed starting point. It uses the DAO's
existing governance path and does not give a new contract ongoing Manager
permissions. The Shaman remains a possible later step if manual monthly
reconciliation becomes too burdensome.

## Current assumptions

- Network: Gnosis Chain (`0x64`)
- Baal DAO: `0xf02fd4286917270cb94fbc13a0f4e1ed76f7e986`
- Treasury Safe: `0x181eBDB03cb4b54F4020622F1B0EAcd67A8C63aC`
- RG shares token: `0x372fc5a6b0B12aE174F09f6Fc849A83dE6b503B6`
- wxDAI: `0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d`
- Reference standard RG share price: $5, subject to governance confirmation
- Proposed member issuance price: $2.50 / 2.5 wxDAI per RG (50% discount)
- Proposed maximum contribution: 200 wxDAI per member per month
- Proposed maximum issuance at that price: 80 RG shares per member per month
- RG shares use 18 decimal places.

If approved, the discounted price and cap imply `200 / 2.5 = 80` shares per monthly period. A member
can accumulate more than 100 shares over multiple periods, but cannot receive
more than 80 shares in one period under these proposed terms.

## Important governance consideration

RG shares are not just subscription receipts. Moloch v3 shares carry voting
rights and may carry a proportional ragequit claim on treasury assets. Selling
them at a fixed price can dilute existing members or create economic arbitrage
if the treasury value per RG share is greater than the subscription price.

Before launch, governance should explicitly approve:

- whether full RG shares are the intended reward;
- whether shares are calculated from gross payments or net receipts after fees;
- member eligibility and how canonical DAO membership is checked;
- monthly and lifetime issuance limits; and
- the accounting and review process used before each mint proposal.

## References

- [DAOhaus membership contracts](https://docs.daohaus.club/contracts/membership)
- [DAOhaus Shaman permissions](https://docs.daohaus.club/contracts/shamans/write-a-shaman)
- [Existing DAOhaus Subscription Shaman](https://github.com/HausDAO/baal-shamans/blob/main/contracts/subscriptions/Subscriptions.sol)
- [Moloch v3 proposal model](https://moloch.daohaus.fun/)
