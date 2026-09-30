'use client'

import {
  ArrowRight,
  BookOpen,
  BriefcaseBusiness,
  Check,
  CircleDollarSign,
  Clock3,
  DoorOpen,
  ExternalLink,
  ShieldCheck,
  Sparkles,
  Users,
  WalletCards,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import Link from 'next/link'

import {
  calculateMemberShares,
  deriveCapabilities,
  MEMBER_SUBSCRIPTION_DISCOUNT_PERCENT,
  MEMBER_SUBSCRIPTION_SHARE_PRICE_USD,
  participationClassLabel,
  resolveParticipationClass,
  STANDARD_SHARE_PRICE_USD,
  type BillingStatus,
  type Capability,
} from '@/lib/domain/participation'
import {
  mockActivity,
  mockBillingStatuses,
  mockPersonas,
  type MockPersonaKey,
} from '@/lib/mock/fixtures'

import { StatusPill, type StatusTone } from './StatusPill'

const capabilityCopy: Record<Capability, { description: string; label: string }> = {
  'bounties.access': { description: 'Find scoped ways to contribute.', label: 'Bounty board' },
  'coworking.apprentice': { description: 'Join apprentice rooms and working sessions.', label: 'Apprentice spaces' },
  'coworking.guild': { description: 'Enter member and guild workspaces.', label: 'Guild spaces' },
  'coworking.standard': { description: 'Work alongside the wider community.', label: 'Digital coworking' },
  'learning.library': { description: 'Browse practical guild knowledge.', label: 'Learning library' },
  'learning.live_programming': { description: 'Join workshops and brown bags.', label: 'Live programming' },
  'networking.access': { description: 'Meet builders across the network.', label: 'Community network' },
  'raids.full_priority_1': { description: 'First consideration when raid needs align.', label: 'Raid priority 1' },
  'raids.full_priority_2_apprentice': { description: 'Apprentice consideration after members.', label: 'Raid priority 2' },
  'shares.subscription_eligible': { description: 'Eligible for review in a manual DAO proposal.', label: 'Proposed share program' },
}

const billingCopy: Record<BillingStatus, { detail: string; label: string; tone: StatusTone }> = {
  active: { detail: 'Current month confirmed', label: 'Paid', tone: 'good' },
  past_due: { detail: 'Payment needs attention', label: 'Past due', tone: 'warning' },
  canceled: { detail: 'No automatic renewal', label: 'Canceled', tone: 'neutral' },
  not_started: { detail: 'No contribution this month', label: 'Not started', tone: 'signal' },
}

type ParticipationDashboardProps = {
  initial?: {
    amountUSD: number
    billingStatus: BillingStatus
    credentials: Parameters<typeof resolveParticipationClass>[0]
    displayName: string
    handle: string
    hasMembershipSnapshot: boolean
  }
  showPrototypeControls?: boolean
}

export function ParticipationDashboard({ initial, showPrototypeControls = false }: ParticipationDashboardProps) {
  const [personaKey, setPersonaKey] = useState<MockPersonaKey>('member')
  const [billingStatus, setBillingStatus] = useState<BillingStatus>(initial?.billingStatus ?? 'active')
  const [memberAmount, setMemberAmount] = useState(initial?.amountUSD || 80)
  const mockPersona = mockPersonas[personaKey]
  const persona = initial
    ? {
        avatarInitials: initial.displayName.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase(),
        credentials: initial.credentials,
        handle: initial.handle,
        name: initial.displayName,
      }
    : mockPersona
  const participationClass = resolveParticipationClass(persona.credentials)
  const capabilities = useMemo(
    () => deriveCapabilities({ billingStatus, credentials: persona.credentials }),
    [billingStatus, persona.credentials],
  )
  const isMember = participationClass === 'member'
  const eligibleShares = isMember && billingStatus === 'active' ? calculateMemberShares(memberAmount) : 0
  const billing = billingCopy[billingStatus]
  const stablecoinHref = showPrototypeControls
    ? `/payments/mock/stablecoin?amount=${memberAmount}&member=true`
    : `/payments/wxdai?amount=${memberAmount}`

  return (
    <main>
      {showPrototypeControls ? <section className="mock-toolbar" aria-label="Mock preview controls">
        <div>
          <span className="eyebrow">Prototype controls</span>
          <p>Preview trusted identity and provider-neutral payment states.</p>
        </div>
        <div className="control-group">
          <label htmlFor="mock-persona">Persona</label>
          <select
            id="mock-persona"
            onChange={(event) => setPersonaKey(event.target.value as MockPersonaKey)}
            value={personaKey}
          >
            <option value="member">RaidGuild member</option>
            <option value="graduate">Cohort graduate</option>
            <option value="participant">Cohort participant</option>
          </select>
        </div>
        <div className="control-group">
          <label>Payment rail</label>
          <span className="control-value">wxDAI · card coming soon</span>
        </div>
        <div className="control-group">
          <label htmlFor="mock-billing">Billing</label>
          <select
            id="mock-billing"
            onChange={(event) => setBillingStatus(event.target.value as BillingStatus)}
            value={billingStatus}
          >
            {mockBillingStatuses.map((status) => (
              <option key={status} value={status}>{billingCopy[status].label}</option>
            ))}
          </select>
        </div>
      </section> : null}

      <section className="hero-section">
        <div className="hero-copy">
          <span className="eyebrow">Your participation</span>
          <h1>Welcome back, <em>{persona.name.split(' ')[0]}.</em></h1>
          <p>
            Your standing, access, and contribution signals in one place.
          </p>
        </div>
        <div className="profile-chip">
          <span className="avatar">{persona.avatarInitials}</span>
          <span>
            <strong>{persona.name}</strong>
            <small>@{persona.handle} · Portal verified</small>
          </span>
          <ShieldCheck aria-label="Verified through Portal" size={21} />
        </div>
      </section>

      <section className="summary-grid">
        <article className="summary-card summary-card--dark">
          <span className="eyebrow eyebrow--inverse">Participation status</span>
          <div className="summary-card__main">
            <h2>{participationClassLabel[participationClass]}</h2>
            <StatusPill tone={isMember ? 'good' : 'neutral'}>{isMember ? 'Onchain verified' : 'Portal verified'}</StatusPill>
          </div>
          <p>{isMember ? 'Membership is verified from your Portal-linked wallet at the latest Gnosis snapshot.' : 'Cohort participation and graduate recognition are free. Payment is not required to keep your standing.'}</p>
        </article>

        <article className="summary-card">
          <span className="eyebrow">{isMember ? 'Optional monthly contribution' : 'Cohort participation'}</span>
          <div className="summary-card__main">
            <h2>{isMember ? `$${memberAmount} / month` : 'Free'}</h2>
            {isMember ? <StatusPill tone={billing.tone}>{billing.label}</StatusPill> : <StatusPill tone="good">No dues</StatusPill>}
          </div>
          <p>{isMember ? getBillingDetail(billingStatus) : 'Join the cohort path and keep your Portal recognition without a payment.'}</p>
        </article>

        <article className="summary-card summary-card--highlight">
          <span className="eyebrow">Next action</span>
          <h2>{isMember ? getNextAction(billingStatus) : 'Build and share your work'}</h2>
          {isMember && billingStatus !== 'active' ? <Link className="text-action" href={stablecoinHref}>
            {getPaymentActionLabel(billingStatus)}
            <ArrowRight aria-hidden="true" size={17} />
          </Link> : isMember ? <p>Confirmed payment awaits reconciliation and DAO proposal review.</p> : <p>Cohort activities are moving toward an async build challenge. Details will be shared when ready.</p>}
        </article>
      </section>

      <section className="content-grid">
        <div className="section-card access-card">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Available now</span>
              <h2>Your access</h2>
            </div>
            <StatusPill tone={capabilities.length ? 'good' : 'neutral'}>
              {capabilities.length} capabilities
            </StatusPill>
          </div>
          {capabilities.length ? (
            <div className="capability-list">
              {capabilities.filter((capability) => capability !== 'shares.subscription_eligible').map((capability) => (
                <div className="capability-row" key={capability}>
                  <span className="capability-icon">{iconForCapability(capability)}</span>
                  <span>
                    <strong>{capabilityCopy[capability].label}</strong>
                    <small>{capabilityCopy[capability].description}</small>
                  </span>
                  <Check aria-hidden="true" size={18} />
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <DoorOpen aria-hidden="true" size={30} />
              <h3>Access details are being updated.</h3>
              <p>Your Portal recognition remains available without payment.</p>
            </div>
          )}
        </div>

        <div className="section-card share-card">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Member program</span>
              <h2>Share issuance</h2>
            </div>
            <CircleDollarSign aria-hidden="true" size={26} />
          </div>
          {isMember ? (
            <>
              <div className="share-total">
                <span className="share-price-heading">
                  Estimated for review
                  <StatusPill tone="signal">Proposed {MEMBER_SUBSCRIPTION_DISCOUNT_PERCENT}% discount</StatusPill>
                </span>
                <strong>{eligibleShares} RG</strong>
                <small>
                  {billingStatus === 'active'
                    ? `$${memberAmount} ÷ $${MEMBER_SUBSCRIPTION_SHARE_PRICE_USD.toFixed(2)} per RG`
                    : 'No confirmed member contribution this month'}
                </small>
              </div>
              <div className="price-comparison" aria-label="Share price comparison">
                <span><small>Standard RG price</small><s>${STANDARD_SHARE_PRICE_USD.toFixed(2)}</s></span>
                <span><small>Proposed member rate</small><strong>${MEMBER_SUBSCRIPTION_SHARE_PRICE_USD.toFixed(2)}</strong></span>
              </div>
              <label className="range-label" htmlFor="member-amount">
                <span>Monthly amount</span>
                <strong>${memberAmount}</strong>
              </label>
              <input
                disabled={billingStatus === 'active'}
                id="member-amount"
                max="200"
                min="20"
                onChange={(event) => setMemberAmount(Number(event.target.value))}
                step="20"
                type="range"
                value={memberAmount}
              />
              <div className="issuance-timeline">
                <div className="timeline-row"><Clock3 size={16} /><span>Current month</span><strong>{eligibleShares ? `${eligibleShares} RG estimated` : 'No eligible payment'}</strong></div>
                <div className="timeline-row"><Clock3 size={16} /><span>Next step</span><strong>Manual DAO proposal review</strong></div>
              </div>
              <p className="fine-print">The discounted share program is proposed and needs DAO approval. A confirmed contribution does not issue shares. Any shares require review, a DAO proposal, approval, and onchain execution.</p>
            </>
          ) : (
            <div className="empty-state empty-state--compact">
              <Sparkles aria-hidden="true" size={30} />
              <h3>Share proposals are for members.</h3>
              <p>Cohort participation is free and does not include RG shares.</p>
            </div>
          )}
        </div>
      </section>

      {showPrototypeControls ? <section className="activity-section">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Participation signals</span>
            <h2>Your recent activity</h2>
          </div>
          <span className="source-note">Prototype activity data</span>
        </div>
        <div className="metric-grid">
          {mockActivity.map((metric) => (
            <article className="metric-card" key={metric.label}>
              <strong>{metric.value}</strong>
              <span>{metric.label}</span>
              <small>{metric.detail}</small>
            </article>
          ))}
          <article className="metric-card metric-card--signal">
            <Users aria-hidden="true" size={24} />
            <span>Community pulse</span>
            <small>42 people active this month</small>
          </article>
        </div>
      </section> : (
        <section className="activity-section">
          <div className="section-heading"><div><span className="eyebrow">Participation signals</span><h2>Your recent activity</h2></div></div>
          <div className="empty-state"><Clock3 aria-hidden="true" size={30} /><h3>Activity connections are next.</h3><p>Your billing and membership evidence are live. Portal and Discord activity metrics will appear here after their read-only connectors are enabled.</p></div>
        </section>
      )}

      {isMember ? <section className="billing-callout">
        <div>
          <WalletCards aria-hidden="true" size={28} />
          <span>
            <strong>Optional member contribution: wxDAI directly to the RaidGuild Safe.</strong>
            <small>
              Each monthly transfer is manual. Email, personal sites, and AI assistant access are ideas under review, not active perks.
            </small>
          </span>
        </div>
        {billingStatus !== 'active' ? <Link className="button button--secondary" href={stablecoinHref}>
          {showPrototypeControls ? 'Preview transfer' : 'Pay with wxDAI'} <ExternalLink aria-hidden="true" size={16} />
        </Link> : null}
      </section> : null}
    </main>
  )
}

function getBillingDetail(status: BillingStatus): string {
  if (status === 'active') return 'Current month wxDAI payment confirmed on Gnosis Chain'
  if (status === 'past_due') return 'This month’s optional payment has not been confirmed'
  if (status === 'canceled') return 'No automatic renewal · prior period complete'
  return 'No payment required for membership standing'
}

function getPaymentActionLabel(status: BillingStatus): string {
  return status === 'past_due' ? 'Review wxDAI payment' : 'Pay with wxDAI'
}

function getNextAction(status: BillingStatus): string {
  if (status === 'past_due') return 'Review optional contribution'
  if (status === 'active') return 'Review share estimate'
  return 'Explore member contribution'
}

function iconForCapability(capability: Capability) {
  if (capability.startsWith('coworking')) return <DoorOpen aria-hidden="true" size={19} />
  if (capability.startsWith('raids')) return <BriefcaseBusiness aria-hidden="true" size={19} />
  if (capability.startsWith('learning')) return <BookOpen aria-hidden="true" size={19} />
  if (capability === 'bounties.access') return <CircleDollarSign aria-hidden="true" size={19} />
  return <Users aria-hidden="true" size={19} />
}
