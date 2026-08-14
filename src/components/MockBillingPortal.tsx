import {
  ArrowLeft,
  Check,
  CreditCard,
  ExternalLink,
  WalletCards,
} from 'lucide-react'
import Link from 'next/link'

import { StatusPill } from './StatusPill'

export function MockBillingPortal() {
  return (
    <main className="billing-portal-main">
      <Link className="back-link" href="/">
        <ArrowLeft size={15} /> Return to participation dashboard
      </Link>

      <section className="billing-portal-hero">
        <div>
          <span className="eyebrow">Future payment rail</span>
          <h1>Card payments are coming soon.</h1>
          <p>RaidGuild is launching participation payments with wxDAI on Gnosis Chain.</p>
        </div>
        <StatusPill tone="neutral">Not yet available</StatusPill>
      </section>

      <section className="billing-portal-grid">
        <article className="section-card portal-plan-card">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Available in the prototype</span>
              <h2>Pay directly with wxDAI</h2>
            </div>
            <WalletCards aria-hidden="true" size={25} />
          </div>
          <p>
            Make one wallet-confirmed payment for the current participation period. Funds go
            directly to the RaidGuild Safe and no payment processor takes custody.
          </p>
          <Link className="button button--primary" href="/payments/mock/stablecoin?amount=20&member=false">
            Preview wxDAI payment <ExternalLink size={16} />
          </Link>
        </article>

        <article className="section-card">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Planned convenience rail</span>
              <h2>Card and automatic renewal</h2>
            </div>
            <CreditCard aria-hidden="true" size={25} />
          </div>
          <div className="coming-soon-list">
            <span><Check size={16} /> Hosted card checkout</span>
            <span><Check size={16} /> Automatic monthly renewal</span>
            <span><Check size={16} /> Self-service cancellation and receipts</span>
          </div>
          <p className="fine-print">
            No card provider has been selected. The future adapter will use the same normalized
            payment and entitlement contract as the stablecoin rail.
          </p>
        </article>
      </section>

      <div className="admin-warning">
        <CreditCard aria-hidden="true" size={20} />
        <p>No card details are collected, stored, or processed by this prototype.</p>
      </div>
    </main>
  )
}
