'use client'

import { useEffect, useState } from 'react'

type Checkout = { id: string; status: string; amountUSD: number; periodKey: string; checkoutUrl: string | null; refundedUSD: number; notice: string }

export function MemberContributionPilot({ initial }: { initial: Checkout[] }) {
  const [items, setItems] = useState(initial)
  const [amountUSD, setAmount] = useState(20)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!items.some((item) => ['creating', 'pending'].includes(item.status))) return
    const timer = setInterval(async () => {
      try {
        const response = await fetch('/api/payments/member-contributions', { cache: 'no-store' })
        if (response.ok) setItems((await response.json()).items)
      } catch { /* The server remains the source of truth. */ }
    }, 15_000)
    return () => clearInterval(timer)
  }, [items])
  async function start() {
    setBusy(true); setError('')
    try {
      const response = await fetch('/api/payments/member-contributions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ amountUSD }),
      })
      const value = await response.json()
      if (!response.ok) throw new Error(value.error ?? 'Checkout unavailable.')
      setItems((current) => [value, ...current.filter((item) => item.id !== value.id)])
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Checkout unavailable.')
      try {
        const latest = await fetch('/api/payments/member-contributions', { cache: 'no-store' })
        if (latest.ok) setItems((await latest.json()).items)
      } catch { /* The held authorization remains durable server-side. */ }
    }
    finally { setBusy(false) }
  }
  return <section className="panel" aria-labelledby="contribution-pilot-title">
    <h2 id="contribution-pilot-title">Member contribution card pilot</h2>
    <p>Shopify test checkout only. Use the configured test gateway, never a real card. This does not grant access or RG shares.</p>
    <label>Monthly test amount <select value={amountUSD} onChange={(event) => setAmount(Number(event.target.value))}>
      {Array.from({ length: 10 }, (_, i) => (i + 1) * 20).map((amount) => <option key={amount} value={amount}>${amount}</option>)}
    </select></label>{' '}
    <button type="button" disabled={busy} onClick={start}>{busy ? 'Preparing…' : 'Prepare test checkout'}</button>
    {error ? <p role="alert">{error}</p> : null}
    <ul>{items.map((item) => <li key={item.id}>{item.periodKey}: ${item.amountUSD} test — {item.status}.{' '}
      {item.status === 'creating' ? 'Preparing the invoice. This page will update automatically.' : null}{' '}
      {item.status === 'needs_review' ? 'Do not retry or pay again; contact an admin.' : null}{' '}
      {item.checkoutUrl ? <a href={item.checkoutUrl} rel="noopener noreferrer">Open Shopify test invoice</a> : null}
      {item.refundedUSD ? ` Refunded: $${item.refundedUSD}.` : ''}
    </li>)}</ul>
  </section>
}
