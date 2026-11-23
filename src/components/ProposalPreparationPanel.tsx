'use client'

import { useState } from 'react'

type PreparedTransaction = {
  chainId: number; from: string; to: string; data: string; valueRaw: string;
  artifactSha256: string; snapshotSha256: string; autoSponsor: boolean;
  proposalOfferingRaw: string; warning: string
}

export function ProposalPreparationPanel({ artifactId }: { artifactId: string }) {
  const [transaction, setTransaction] = useState<PreparedTransaction | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  async function prepare() {
    setBusy(true); setError(null); setTransaction(null)
    try {
      const response = await fetch(`/api/admin/proposals/${artifactId}/prepare`, { method: 'POST', cache: 'no-store' })
      const body = await response.json() as { transaction?: PreparedTransaction; error?: string }
      if (!response.ok || !body.transaction) throw new Error(body.error ?? 'Preparation failed.')
      setTransaction(body.transaction)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Preparation failed.') }
    finally { setBusy(false) }
  }
  return <div>
    <button className="button button--outline" type="button" disabled={busy} onClick={prepare}>{busy ? 'Checking current chain state…' : 'Revalidate and prepare wallet fields'}</button>
    {error ? <div className="admin-warning"><p>{error} Re-simulate from the frozen review if this artifact is stale.</p></div> : null}
    {transaction ? <div>
      <p>{transaction.warning}</p>
      <p>Chain {transaction.chainId} · from <code>{transaction.from}</code> · to <code>{transaction.to}</code></p>
      <p>Native xDAI value (wei) <code>{transaction.valueRaw}</code> · proposal offering (wei) <code>{transaction.proposalOfferingRaw}</code></p>
      <p>Exact calldata: <code>{transaction.data}</code></p>
      <p>Artifact SHA-256: <code>{transaction.artifactSha256}</code> · frozen snapshot SHA-256: <code>{transaction.snapshotSha256}</code></p>
      <p className="fine-print">Display only. This page cannot sign or submit. These fields become stale as chain state changes; do not copy them into an arbitrary transaction builder.</p>
    </div> : null}
  </div>
}
