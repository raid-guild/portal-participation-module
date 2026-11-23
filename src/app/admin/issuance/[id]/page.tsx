import { ArrowLeft, Download, ShieldAlert } from 'lucide-react'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'

import { AppShell } from '@/components/AppShell'
import { StatusPill } from '@/components/StatusPill'
import type { IssuancePayload } from '@/lib/issuance/build'
import { getIssuanceReview, IssuanceReviewError } from '@/lib/issuance/service'
import { getCurrentSession } from '@/lib/portal/session'

export default async function IssuanceReviewPage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ review?: string }>
}) {
  const session = await getCurrentSession()
  if (!session) redirect('/portal/auth-error?reason=login_required')
  if (!session.isAppAdmin) redirect('/?auth=forbidden')
  const { id } = await params
  let review
  try { review = await getIssuanceReview(id) }
  catch (error) { if (error instanceof IssuanceReviewError && error.status === 404) notFound(); throw error }
  const { snapshot, decisions, stale, latest } = review
  const payload = snapshot.payload as IssuancePayload
  const query = await searchParams
  const approved = decisions.some((decision) => decision.decision === 'approved' && decision.payloadSha256 === snapshot.payloadSha256)
  const mayReview = latest && snapshot.createdByUserId !== session.id && decisions.length === 0
  return <AppShell><main className="admin-main">
    <Link className="back-link" href="/admin"><ArrowLeft size={15} /> Administration</Link>
    <section className="admin-hero"><div><span className="eyebrow">Frozen issuance evidence · {payload.periodKey} · revision {snapshot.revision}</span><h1>Monthly issuance review</h1><p>Snapshot SHA-256: <code>{snapshot.payloadSha256}</code></p></div><StatusPill tone={approved && !stale && latest ? 'good' : 'warning'}>{stale ? 'Stale' : !latest ? 'Superseded' : approved ? 'Independently approved' : 'Awaiting review'}</StatusPill></section>
    {query.review === 'recorded' ? <div className="portal-notice">Independent decision recorded.</div> : null}
    <section className="section-card"><div className="section-heading"><div><span className="eyebrow">Pinned evidence</span><h2>Source and policy</h2></div><a className="button button--outline" href={`/api/admin/issuance/${id}/export`}><Download size={16} /> Export JSON</a></div>
      <p>UTC cutoff {payload.cutoffAt} · Gnosis block {payload.membership.cutoffBlockNumber} · {payload.membership.cutoffBlockHash}</p>
      <p>DAO {payload.membership.daoAddress} · shares token {payload.membership.sharesTokenAddress}</p>
      <p>Policy {payload.policy.version} · basis {payload.policy.paymentBasis} · $2.50 per RG · $200 maximum per member</p>
      {payload.blockers.length ? <div className="admin-warning"><ShieldAlert size={20} /><p>Approval blocked: {payload.blockers.join(' ')}</p></div> : null}
      {stale ? <div className="admin-warning"><ShieldAlert size={20} /><p>Underlying payment, wallet, or membership evidence changed. Freeze a new revision before approving or using this artifact.</p></div> : null}
    </section>
    <section className="section-card admin-table-card"><div className="section-heading"><div><span className="eyebrow">Included · {payload.included.length}</span><h2>Proposed recipients</h2></div></div><div className="table-scroll"><table><thead><tr><th>Recipient</th><th>Payments</th><th>Paid</th><th>Estimated RG</th></tr></thead><tbody>{payload.included.map((line) => <tr key={line.recipientAddress}><td className="mono-cell">{line.recipientAddress}</td><td>{line.paymentIds.join(', ')}</td><td>${(line.amountMinorUnits / 100).toFixed(2)}</td><td>{BigInt(line.shareAmountRaw) / 10n ** 18n}</td></tr>)}</tbody></table></div></section>
    <section className="section-card"><div className="section-heading"><div><span className="eyebrow">Excluded · {payload.excluded.length}</span><h2>Exceptions</h2></div></div>{payload.excluded.length ? payload.excluded.map((line) => <p key={line.paymentId}>{line.paymentId} · {line.reason}</p>) : <p>No excluded member-plan payments.</p>}</section>
    <section className="section-card"><div className="section-heading"><div><span className="eyebrow">Independent admin decision</span><h2>Review record</h2></div></div>{decisions.map((decision) => <p key={decision.id}>{decision.decision} · reviewer {decision.reviewerUserId} · {decision.createdAt.toISOString()} · hash {decision.payloadSha256.slice(0, 16)}… · {decision.note}</p>)}
      {mayReview ? <form action={`/api/admin/issuance/${id}/review`} method="post"><label htmlFor="review-note">Review note (required)</label><textarea id="review-note" name="note" minLength={10} maxLength={1000} required /><button className="button button--outline" name="decision" value="rejected" type="submit">Reject</button><button className="button button--primary" disabled={stale || payload.blockers.length > 0} name="decision" value="approved" type="submit">Approve frozen hash</button></form> : <p>Only a different, currently assigned app admin may decide the latest revision. A recorded decision is final for that revision.</p>}
      <p className="fine-print">Approval is review evidence only. This module has no mint authority and does not submit or sponsor DAO proposals.</p>
    </section>
    {approved && latest && !stale && payload.blockers.length === 0 ? <section className="section-card"><div className="section-heading"><div><span className="eyebrow">Governance preparation</span><h2>Simulate one batch mintShares proposal</h2></div></div>
      <p>Build from this frozen hash only. The intended submitter address is used to test delegated-vote auto-sponsorship and the exact proposal offering. A different app admin must approve the resulting artifact.</p>
      <form action={`/api/admin/issuance/${id}/proposal`} method="post"><label htmlFor="proposal-submitter">Connected submitter wallet (Gnosis)</label><input id="proposal-submitter" name="submitterAddress" type="text" required pattern="0x[a-fA-F0-9]{40}" placeholder="0x…" /><button className="button button--outline" type="submit">Build and simulate proposal artifact</button></form>
      <p className="fine-print">This does not submit, sponsor, vote on, process, execute, or mint shares.</p>
    </section> : null}
  </main></AppShell>
}
