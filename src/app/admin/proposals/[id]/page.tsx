import { ArrowLeft, ShieldAlert } from 'lucide-react'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'

import { AppShell } from '@/components/AppShell'
import { ProposalPreparationPanel } from '@/components/ProposalPreparationPanel'
import { StatusPill } from '@/components/StatusPill'
import type { ProposalArtifactPayload } from '@/lib/governance/service'
import { getProposalArtifact, GovernancePreparationError } from '@/lib/governance/service'
import { getCurrentSession } from '@/lib/portal/session'

export default async function ProposalArtifactPage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ review?: string }>
}) {
  const session = await getCurrentSession()
  if (!session) redirect('/portal/auth-error?reason=login_required')
  if (!session.isAppAdmin) redirect('/?auth=forbidden')
  const { id } = await params
  let state
  try { state = await getProposalArtifact(id) }
  catch (error) { if (error instanceof GovernancePreparationError && error.status === 404) notFound(); throw error }
  const { record, decision, review, expired, latest, ready } = state
  const artifact = record.artifact as ProposalArtifactPayload
  const { encoded, simulation } = artifact
  const query = await searchParams
  const mayReview = !decision && latest && !expired && !review.stale && review.latest && record.builderUserId !== session.id
  return <AppShell><main className="admin-main">
    <Link className="back-link" href={`/admin/issuance/${record.snapshotId}`}><ArrowLeft size={15} /> Frozen issuance review</Link>
    <section className="admin-hero"><div><span className="eyebrow">Proposal artifact · revision {artifact.revision}</span><h1>Batch mintShares review</h1><p>Artifact SHA-256: <code>{record.artifactSha256}</code></p><p>Frozen snapshot SHA-256: <code>{record.snapshotSha256}</code></p></div><StatusPill tone={ready ? 'good' : 'warning'}>{ready ? 'Approved for preparation' : decision?.decision ?? (expired ? 'Expired' : 'Awaiting independent review')}</StatusPill></section>
    {query.review === 'recorded' ? <div className="portal-notice">Independent decision recorded.</div> : null}
    {!latest || expired || review.stale || !review.latest ? <div className="admin-warning"><ShieldAlert size={20} /><p>Artifact is expired, superseded, or underlying evidence is stale. Build a new artifact and repeat independent review.</p></div> : null}
    <section className="section-card"><div className="section-heading"><div><span className="eyebrow">Decoded transaction layers</span><h2>Exactly one DAO action</h2></div></div>
      <p>Gnosis chain 100 · Baal proposal target <code>{encoded.dao}</code> · 0 xDAI mint action value</p>
      <p>Safe avatar/target <code>{simulation.config.safe}</code> · MultiSend library <code>{encoded.multisend}</code></p>
      <p>Action: Baal <code>mintShares(address[],uint256[])</code> · operation CALL · {encoded.recipients.length} recipients · no extra actions.</p>
      <p>Wrapper: MultiSend <code>multiSend(bytes)</code> · Baal <code>submitProposal(bytes,uint32,uint256,string)</code></p>
      <p>Operation hash: <code>{encoded.proposalDataHash}</code></p><p>Mint calldata keccak256: <code>{encoded.mintCalldataHash}</code> · submission calldata keccak256: <code>{encoded.submitCalldataHash}</code></p><p>Mint calldata: <code>{encoded.mintCalldata}</code></p><p>Submission calldata: <code>{encoded.submitCalldata}</code></p>
      <p>Details: {encoded.details}</p>
      <div className="table-scroll"><table><thead><tr><th>Recipient</th><th>RG raw units</th></tr></thead><tbody>{encoded.recipients.map((recipient, index) => <tr key={recipient}><td className="mono-cell">{recipient}</td><td className="mono-cell">{encoded.amountsRaw[index]}</td></tr>)}</tbody></table></div>
    </section>
    <section className="section-card"><div className="section-heading"><div><span className="eyebrow">Pinned block simulation</span><h2>Execution and submission checks</h2></div></div>
      <p>Block {simulation.config.blockNumber} · {simulation.config.blockHash} · config hash {simulation.configHash}</p>
      <p>Safe master copy <code>{simulation.config.executableDependencies.safeMasterCopy}</code> · code hash <code>{simulation.config.executableDependencies.safeMasterCopyCodeHash}</code></p>
      <p>Safe proxy code hash <code>{simulation.config.executableDependencies.safeProxyCodeHash}</code></p>
      <p>Shares implementation <code>{simulation.config.executableDependencies.sharesImplementation}</code> · code hash <code>{simulation.config.executableDependencies.sharesImplementationCodeHash}</code></p>
      <p>Shares proxy code hash <code>{simulation.config.executableDependencies.sharesProxyCodeHash}</code> · Baal implementation code hash <code>{simulation.config.executableDependencies.baalImplementationCodeHash}</code></p>
      <p>Safe action returned success: {String(simulation.actionSuccess)} · submitProposal returned success: {String(simulation.submissionSuccess)} · simulated proposal ID {simulation.simulatedProposalId}</p>
      <p>Submitter {simulation.submitter} · delegated votes {simulation.delegatedVotesRaw} · sponsor threshold {simulation.config.sponsorThreshold}</p>
      <div className="admin-warning"><ShieldAlert size={20} /><p>{simulation.autoSponsor ? 'This submitter meets the delegated-vote threshold. Baal will auto-sponsor the proposal on submission.' : `This submitter does not meet the threshold. A wallet submission would include ${simulation.requiredValueRaw} wei native xDAI proposal offering; a member must sponsor later.`}</p></div>
      <p>Simulated {simulation.simulatedAt} · expires {simulation.expiresAt}. This does not guarantee future DAO execution.</p>
      <Link className="button button--outline" href={`/admin/issuance/${record.snapshotId}`}>Re-simulate from frozen review</Link>
    </section>
    <section className="section-card"><div className="section-heading"><div><span className="eyebrow">Independent app-admin decision</span><h2>Approve the exact artifact hash</h2></div></div>
      {decision ? <p>{decision.decision} · reviewer {decision.reviewerUserId} · {decision.createdAt.toISOString()} · hash {decision.artifactSha256} · {decision.note}</p> : null}
      {mayReview ? <form action={`/api/admin/proposals/${id}/review`} method="post"><label htmlFor="proposal-review-note">Review note (required)</label><textarea id="proposal-review-note" name="note" minLength={10} maxLength={1000} required /><button className="button button--outline" name="decision" value="rejected" type="submit">Reject</button><button className="button button--primary" name="decision" value="approved" type="submit">Approve exact artifact</button></form> : <p>Only a different, currently assigned app admin may decide this live artifact.</p>}
      <p className="fine-print">Approval is an audit gate. Wallet submission is intentionally not connected in this pilot; no transaction is sent by this page.</p>
    </section>
    {ready ? <section className="section-card"><div className="section-heading"><div><span className="eyebrow">Read-only wallet preparation</span><h2>Fresh chain revalidation</h2></div></div><ProposalPreparationPanel artifactId={id} /></section> : null}
  </main></AppShell>
}
