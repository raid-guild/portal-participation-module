import { Activity, ArrowLeft, Download, FileCheck2, ShieldAlert, Users } from 'lucide-react'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { AppShell } from '@/components/AppShell'
import { StatusPill } from '@/components/StatusPill'
import { getAdminParticipationReport } from '@/lib/admin/report'
import { getLatestParticipationMetricSnapshot } from '@/lib/metrics/import'
import { getMetricApproval } from '@/lib/metrics/approval'
import { listIssuanceReviews } from '@/lib/issuance/service'
import { getCurrentSession } from '@/lib/portal/session'

function money(amountMinorUnits: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(
    amountMinorUnits / 100,
  )
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ refresh?: string; metrics?: string }>
}) {
  const session = await getCurrentSession()
  if (!session) redirect('/portal/auth-error?reason=login_required')
  if (!session.isAppAdmin) redirect('/?auth=forbidden')
  const [report, metrics, query, frozenReviews] = await Promise.all([
    getAdminParticipationReport(),
    getLatestParticipationMetricSnapshot(),
    searchParams,
    listIssuanceReviews(),
  ])
  const previousPeriod = new Date(Date.UTC(Number(report.periodKey.slice(0, 4)), Number(report.periodKey.slice(5, 7)) - 2, 1)).toISOString().slice(0, 7)
  const metricApproval = metrics ? await getMetricApproval(metrics.import.id) : null

  return (
    <AppShell>
      <main className="admin-main">
        <Link className="back-link" href="/"><ArrowLeft size={15} /> Dashboard</Link>
        <section className="admin-hero">
          <div>
            <span className="eyebrow">App administration · Live preview and frozen reviews</span>
            <h1>Participation operations</h1>
            <p>Review subscription health and prepare a governance-safe monthly issuance batch.</p>
          </div>
          <StatusPill tone="signal">Explicit app admin</StatusPill>
        </section>

        <section className="admin-stats">
          <article><Users size={21} /><span><strong>{report.activePayments}</strong> confirmed payers</span></article>
          <article><FileCheck2 size={21} /><span><strong>{report.totalShares} RG</strong> review total</span></article>
          <article><ShieldAlert size={21} /><span><strong>{report.exceptions}</strong> exceptions need review</span></article>
        </section>

        {query.refresh === 'succeeded' ? <div className="portal-notice">Gnosis membership snapshot refreshed.</div> : null}
        {query.metrics === 'approved' ? <div className="portal-notice">Prism snapshot approved for participant display.</div> : null}

        <section className="section-card admin-table-card admin-metrics-card">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Prism · Admin-only · Provisional</span>
              <h2>Weekly participation snapshot</h2>
            </div>
            <Activity aria-hidden="true" size={26} />
          </div>
          {metrics ? (
            <>
              <p className="source-note">
                {metrics.import.snapshotKey} · cycle {metrics.import.cycleKey} · generated {metrics.import.generatedAt.toLocaleString('en-US', { timeZone: 'UTC' })} UTC · {metrics.import.matchedCount}/{metrics.import.memberCount} wallets matched to Portal
              </p>
              <div className="table-scroll">
                <table>
                  <thead><tr><th>Participant</th><th>Wallet</th><th>Engagement</th><th>Stewardship</th><th>Contribution</th><th>Total</th><th>Review</th></tr></thead>
                  <tbody>
                    {metrics.lines.map((line) => (
                      <tr key={line.walletAddress}>
                        <td>{line.portalDisplayName ?? line.displayName ?? 'Unmatched participant'}</td>
                        <td className="mono-cell">{`${line.walletAddress.slice(0, 8)}…${line.walletAddress.slice(-6)}`}</td>
                        <td>{line.engagementScore}</td>
                        <td>{line.stewardshipScore}</td>
                        <td>{line.contributionScore}</td>
                        <td><strong>{line.totalScore}</strong></td>
                        <td>
                          <StatusPill tone={!line.portalUserId || line.auditFlags.length ? 'warning' : 'neutral'}>
                            {!line.portalUserId ? 'Wallet unmatched' : line.auditFlags.length ? `${line.auditFlags.length} flags` : 'Provisional'}
                          </StatusPill>
                        </td>
                      </tr>
                    ))}
                    {!metrics.lines.length ? <tr><td colSpan={7}>Prism reported no participants for this snapshot.</td></tr> : null}
                  </tbody>
                </table>
              </div>
              <p className="fine-print">This snapshot is evidence for administrator review only. It cannot change access, subscription status, DAO membership, or issue RG shares.</p>
              {metricApproval ? <p className="source-note">Approved {metricApproval.approvedAt.toLocaleString()} · content {metricApproval.contentSha256.slice(0, 16)}…</p> : metrics.import.contentSha256 ? <form action={`/api/admin/metrics/${metrics.import.id}/approve`} method="post"><button className="button button--outline" type="submit">Approve for participant display</button></form> : <p className="source-note">Legacy import requires a new Prism run with a server-computed content hash before approval.</p>}
            </>
          ) : (
            <div className="empty-state empty-state--compact">
              <Activity aria-hidden="true" size={30} />
              <h3>Waiting for the first Prism snapshot.</h3>
              <p>The weekly task will publish provisional Participation Steward scores here.</p>
            </div>
          )}
        </section>

        <section className="section-card admin-table-card">
          <div className="section-heading"><div><span className="eyebrow">Immutable monthly evidence</span><h2>Frozen issuance reviews</h2></div></div>
          <p className="fine-print">Freeze a closed UTC month into a hashed, revisioned review artifact. A different app admin must approve it. This does not submit a DAO proposal or mint shares.</p>
          <form action="/api/admin/issuance" method="post"><label htmlFor="freeze-period">Closed period</label><input id="freeze-period" name="periodKey" type="month" defaultValue={previousPeriod} required /><button className="button button--outline" type="submit">Freeze review snapshot</button></form>
          {frozenReviews.length ? <div className="capability-list">{frozenReviews.slice(0, 12).map((snapshot) => <div className="capability-row" key={snapshot.id}><span><strong>{snapshot.periodKey} · revision {snapshot.revision}</strong><small>SHA-256 {snapshot.payloadSha256.slice(0, 20)}…</small></span><Link className="text-action" href={`/admin/issuance/${snapshot.id}`}>Review</Link></div>)}</div> : <p>No frozen monthly reviews yet.</p>}
        </section>

        <section className="section-card admin-table-card">
          <div className="section-heading">
            <div>
              <span className="eyebrow">{report.periodKey} · proposed $2.50 per share · live preview only</span>
              <h2>Current subscription preview</h2>
            </div>
            <div className="admin-actions">
              <form action="/api/admin/dao-membership/refresh" method="post">
                <button className="button button--outline" type="submit">Refresh chain data</button>
              </form>
              <a className="button button--primary" href="/api/admin/report.csv"><Download size={16} /> Export CSV</a>
            </div>
          </div>
          <p className="source-note">
            {report.run
              ? `Onchain snapshot: block ${report.run.cutoffBlockNumber?.toString()} · ${report.run.cutoffBlockHash?.slice(0, 12)}… · ${report.run.walletCount} verified wallets`
              : 'No successful onchain snapshot yet. Refresh chain data before reviewing eligibility.'}
          </p>
          <div className="table-scroll">
            <table>
              <thead><tr><th>Participant</th><th>Verified wallet</th><th>RG balance</th><th>Paid</th><th>Shares</th><th>Status</th></tr></thead>
              <tbody>
                {report.rows.map((row) => (
                  <tr key={row.portalUserId}>
                    <td>{row.displayName}</td>
                    <td className="mono-cell">{row.wallets[0] ? `${row.wallets[0].slice(0, 8)}…${row.wallets[0].slice(-6)}` : '—'}</td>
                    <td>{row.balance} RG</td><td>{money(row.amountMinorUnits)}</td><td>{row.shares}</td>
                    <td><StatusPill tone={row.status === 'Ready for review' ? 'good' : 'warning'}>{row.status}</StatusPill></td>
                  </tr>
                ))}
                {!report.rows.length ? <tr><td colSpan={6}>No Portal-linked participants yet.</td></tr> : null}
              </tbody>
            </table>
          </div>
          <div className="admin-warning">
            <ShieldAlert aria-hidden="true" size={20} />
            <p>This is a mutable live preview, not an approved issuance artifact. Eligibility requires a Portal-verified Gnosis wallet holding at least 100 RG at the recorded block plus a confirmed payment for this period. Export is review-only; this app cannot mint shares.</p>
          </div>
        </section>
      </main>
    </AppShell>
  )
}
