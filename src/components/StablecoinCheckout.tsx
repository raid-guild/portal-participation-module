'use client'

import { ArrowLeft, CheckCircle2, ExternalLink, RefreshCw, ShieldCheck, TriangleAlert, Wallet } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { encodeFunctionData, getAddress, parseAbi } from 'viem'

import { MEMBER_SUBSCRIPTION_SHARE_PRICE_USD } from '@/lib/domain/participation'
import type { ParticipationClass } from '@/lib/domain/participation'
import { classifyCheckoutConfirmation } from '@/lib/payments/checkout-confirmation'
import { selectCheckoutRecovery } from '@/lib/payments/checkout-recovery'

import { StatusPill } from './StatusPill'

const transferAbi = parseAbi(['function transfer(address to, uint256 value) returns (bool)'])

type PaymentIntent = {
  amountAtomic: string
  amountMinorUnits: number
  chainId: number
  expectedSender: string
  expiresAt: string
  id: string
  periodKey: string
  planKey: string
  recipient: string
  tokenAddress: string
}

type EthereumProvider = {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>
}

export function StablecoinCheckout({ initialAmount, participationClass }: { initialAmount: number; participationClass: ParticipationClass }) {
  const router = useRouter()
  const isMember = participationClass === 'member'
  const [amount, setAmount] = useState(initialAmount)
  const [intent, setIntent] = useState<PaymentIntent | null>(null)
  const [account, setAccount] = useState('')
  const [transactionHash, setTransactionHash] = useState('')
  const [recoveryHash, setRecoveryHash] = useState('')
  const [status, setStatus] = useState<'idle' | 'preparing' | 'ready' | 'signing' | 'confirming' | 'confirmed' | 'needs_review'>('idle')
  const [confirmations, setConfirmations] = useState(0)
  const [required, setRequired] = useState(12)
  const [trackingIntentId, setTrackingIntentId] = useState('')
  const [recoverableIntents, setRecoverableIntents] = useState<Array<{ id: string; createdAt: string; amountMinorUnits: number }>>([])
  const [error, setError] = useState('')
  const shares = isMember ? amount / MEMBER_SUBSCRIPTION_SHARE_PRICE_USD : 0

  useEffect(() => {
    let canceled = false
    void fetch('/api/payments/history', { cache: 'no-store' }).then((response) => response.json()).then((body) => {
      if (canceled || !Array.isArray(body.items)) return
      const recovery = selectCheckoutRecovery(body.items)
      setRecoverableIntents(recovery.recoverableIntents)
      if (recovery.recoverableIntents[0]) setTrackingIntentId(recovery.recoverableIntents[0].id)
      const latest = recovery.activeObservation
      if (!latest) {
        const exception = recovery.reviewObservation
        if (exception) {
          setTrackingIntentId(exception.id)
          setTransactionHash(exception.transactionHash ?? '')
          setStatus('needs_review')
          setError('Payment requires admin reconciliation. Do not send another transfer.')
        }
        return
      }
      setTrackingIntentId(latest.id)
      setTransactionHash(latest.transactionHash ?? '')
      setConfirmations(latest.confirmations)
      setRequired(latest.requiredConfirmations)
      setStatus('confirming')
    }).catch(() => undefined)
    return () => { canceled = true }
  }, [])

  useEffect(() => {
    if (status !== 'confirming' || !transactionHash || !trackingIntentId) return
    let active = true
    const timer = window.setInterval(async () => {
      try {
        const response = await fetch('/api/payments/confirm', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ intentId: trackingIntentId, transactionHash }),
        })
        const body = await response.json()
        if (!active) return
        const nextStatus = classifyCheckoutConfirmation(response.status, body.status)
        if (nextStatus === 'needs_review') {
          setError(body.error ?? 'Payment requires admin reconciliation. Do not send another transfer.')
          setStatus('needs_review')
          return
        }
        if (!response.ok) { setError(body.error ?? 'Payment verification will retry.'); return }
        setConfirmations(body.confirmations ?? 0)
        setRequired(body.requiredConfirmations ?? 12)
        if (nextStatus === 'confirmed') { setStatus('confirmed'); router.refresh() }
      } catch { if (active) setError('Verification will retry automatically while this page is open.') }
    }, 12_000)
    return () => { active = false; window.clearInterval(timer) }
  }, [status, transactionHash, trackingIntentId, router])

  async function prepare() {
    setError('')
    setStatus('preparing')
    try {
      if (!isMember) throw new Error('Monthly contributions are available to RaidGuild members only.')
      const planKey = `member_share_${amount}`
      const response = await fetch('/api/payments/intents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planKey }),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error ?? 'Unable to prepare payment.')
      const provider = browserProvider()
      const accounts = (await provider.request({ method: 'eth_requestAccounts' })) as string[]
      const selected = getAddress(accounts[0])
      if (selected !== getAddress(body.expectedSender)) {
        throw new Error(`Connect the Portal-verified wallet ${shorten(body.expectedSender)}.`)
      }
      await switchToGnosis(provider)
      setIntent(body)
      setAccount(selected)
      setStatus('ready')
    } catch (cause) {
      setIntent(null)
      setAccount('')
      setStatus('idle')
      setError(cause instanceof Error ? cause.message : 'Unable to connect wallet.')
    }
  }

  async function sendTransfer() {
    if (!intent || !account) return
    setError('')
    setStatus('signing')
    try {
      const hash = await browserProvider().request({
        method: 'eth_sendTransaction',
        params: [{
          data: encodeFunctionData({
            abi: transferAbi,
            functionName: 'transfer',
            args: [getAddress(intent.recipient), BigInt(intent.amountAtomic)],
          }),
          from: account,
          to: intent.tokenAddress,
          value: '0x0',
        }],
      }) as string
      setTransactionHash(hash)
      setTrackingIntentId(intent.id)
      setStatus('confirming')
      await verify(intent.id, hash)
    } catch (cause) {
      setStatus('ready')
      setError(cause instanceof Error ? cause.message : 'Wallet transaction was not submitted.')
    }
  }

  async function verify(intentId = intent?.id, hash = transactionHash) {
    if (!intentId || !hash) return
    setError('')
    try {
      const response = await fetch('/api/payments/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ intentId, transactionHash: hash }),
      })
      const body = await response.json()
      const nextStatus = classifyCheckoutConfirmation(response.status, body.status)
      if (nextStatus === 'needs_review') {
        setTransactionHash(hash)
        setStatus('needs_review')
        setError(body.error ?? 'Payment requires admin reconciliation. Do not send another transfer.')
        return
      }
      if (!response.ok) throw new Error(body.error ?? 'Unable to verify transaction.')
      setTransactionHash(hash)
      setConfirmations(body.confirmations ?? 0)
      setRequired(body.requiredConfirmations ?? 12)
      setStatus(nextStatus)
      if (nextStatus === 'confirmed') router.refresh()
    } catch (cause) {
      setStatus('idle')
      setError(cause instanceof Error ? cause.message : 'Unable to verify transaction.')
    }
  }

  async function recoverSubmittedTransfer() {
    if (!trackingIntentId || !recoveryHash) return
    await verify(trackingIntentId, recoveryHash)
  }

  return (
    <main className="web3-checkout-main">
      <Link className="back-link" href="/"><ArrowLeft size={15} /> Return to participation dashboard</Link>
      <section className="web3-checkout-hero">
        <div><span className="eyebrow">Optional member contribution</span><h1>Pay with wxDAI</h1><p>Send this month&apos;s optional member contribution directly to the RaidGuild treasury on Gnosis Chain.</p></div>
        <StatusPill tone={status === 'confirmed' ? 'good' : status === 'needs_review' ? 'warning' : 'signal'}>{status === 'confirmed' ? 'Payment verified' : status === 'needs_review' ? 'Admin review needed' : 'Non-custodial transfer'}</StatusPill>
      </section>

      <section className="web3-grid">
        <article className="section-card web3-payment-card">
          <span className="eyebrow">Payment amount</span>
          <div className="web3-amount"><strong>{amount}.00</strong><span>wxDAI</span></div>
          {isMember && !intent ? <><label className="range-label" htmlFor="live-member-amount"><span>Monthly amount</span><strong>${amount}</strong></label><input id="live-member-amount" max="200" min="20" onChange={(event) => setAmount(Number(event.target.value))} step="20" type="range" value={amount} /></> : null}
          <p className="fine-print">Manual payment for the current month. No token approval or automatic renewal is requested.</p>
          {isMember ? <div className="web3-discount"><StatusPill tone="signal">Proposed 50% discount</StatusPill><span><strong>{shares} RG estimated</strong> for review in a manual DAO proposal, subject to DAO approval and execution</span></div> : <div className="web3-discount"><span>Cohort participation is free.</span></div>}
        </article>

        <article className="section-card web3-wallet-card">
          <div className="section-heading"><div><span className="eyebrow">Portal-verified payer</span><h2>{account ? shorten(account) : 'Connect your wallet'}</h2></div><Wallet size={25} /></div>
          <p>The connected address must match the verified wallet supplied by Portal. The server validates it again from the transaction.</p>
          {!intent && status !== 'needs_review' ? <button className="button button--primary" disabled={status === 'preparing'} onClick={prepare} type="button"><Wallet size={16} /> {status === 'preparing' ? 'Preparing…' : 'Connect and prepare'}</button> : null}
          {intent && status === 'ready' ? <button className="button button--primary" onClick={sendTransfer} type="button">Send {amount} wxDAI</button> : null}
          {status === 'signing' ? <p><RefreshCw className="spin-icon" size={18} /> Confirm the transfer in your wallet.</p> : null}
          {error ? <div className="transaction-gate"><TriangleAlert size={18} /> {error}</div> : null}
        </article>
      </section>

      <section className="section-card transfer-review-card">
        <div className="section-heading"><div><span className="eyebrow">Independent verification</span><h2>{status === 'confirmed' ? 'Payment confirmed' : 'Transaction status'}</h2></div><ShieldCheck size={25} /></div>
        {status === 'confirming' ? <div className="transaction-simulation"><span><RefreshCw className="spin-icon" size={20} /><strong>Confirming on Gnosis</strong></span><p>{confirmations} of {required} confirmations. This page checks automatically; the server worker can continue after you leave.</p><button className="button button--primary" onClick={() => verify(trackingIntentId, transactionHash)} type="button">Check now</button>{transactionHash ? <a className="text-action" href={`https://gnosisscan.io/tx/${transactionHash}`} rel="noreferrer" target="_blank">View transaction <ExternalLink size={15} /></a> : null}</div> : null}
        {status === 'confirmed' ? <div className="verified-receipt"><CheckCircle2 size={32} /><span><strong>Payment independently verified</strong><small>This record can be reviewed for a manual DAO share proposal. No shares are issued by this payment.</small></span><Link className="text-action" href="/">Return to dashboard</Link></div> : null}
        {status === 'needs_review' ? <div className="transaction-gate"><TriangleAlert size={18} /><span>Verification found a payment exception. Do not submit another transfer. Contact a RaidGuild app admin with your transaction hash; no shares will be proposed while this is under review.</span></div> : null}
        {transactionHash && status === 'idle' ? <button className="button button--primary" onClick={() => verify(trackingIntentId, transactionHash)} type="button">Retry verification</button> : null}
        {recoverableIntents.length > 0 && !transactionHash && status === 'idle' ? <div className="transaction-simulation"><p>Already sent wxDAI? Select the original intent and paste the Gnosis transaction hash. Only an exact, in-window transfer can be credited.</p><label htmlFor="recovery-intent">Original payment intent</label><select id="recovery-intent" onChange={(event) => setTrackingIntentId(event.target.value)} value={trackingIntentId}>{recoverableIntents.map((item) => <option key={item.id} value={item.id}>{new Date(item.createdAt).toLocaleString()} · {item.amountMinorUnits / 100} wxDAI</option>)}</select><label htmlFor="recovery-hash">Transaction hash</label><input id="recovery-hash" onChange={(event) => setRecoveryHash(event.target.value.trim())} placeholder="0x…" value={recoveryHash} /><button className="button button--primary" onClick={recoverSubmittedTransfer} type="button">Verify existing transfer</button></div> : null}
        {status === 'idle' || status === 'preparing' || status === 'ready' || status === 'signing' ? <p>Prepare the intent and approve the exact wxDAI transfer. The app cannot move funds without your wallet signature.</p> : null}
      </section>
    </main>
  )
}

function browserProvider(): EthereumProvider {
  const provider = (window as typeof window & { ethereum?: EthereumProvider }).ethereum
  if (!provider) throw new Error('No browser wallet was found. Install or open a wallet that supports Gnosis Chain.')
  return provider
}

async function switchToGnosis(provider: EthereumProvider) {
  try {
    await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x64' }] })
  } catch (error) {
    if (!(error && typeof error === 'object' && 'code' in error && error.code === 4902)) throw error
    await provider.request({ method: 'wallet_addEthereumChain', params: [{
      blockExplorerUrls: ['https://gnosisscan.io'],
      chainId: '0x64',
      chainName: 'Gnosis',
      nativeCurrency: { decimals: 18, name: 'xDAI', symbol: 'xDAI' },
      rpcUrls: ['https://rpc.gnosischain.com'],
    }] })
  }
}

function shorten(value: string) {
  return `${value.slice(0, 8)}…${value.slice(-6)}`
}
