'use client'

import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  RefreshCw,
  ShieldCheck,
  TriangleAlert,
  Wallet,
} from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'

import {
  MEMBER_SUBSCRIPTION_DISCOUNT_PERCENT,
  MEMBER_SUBSCRIPTION_SHARE_PRICE_USD,
} from '@/lib/domain/participation'
import {
  GNOSIS_CHAIN_ID,
  RAIDGUILD_TREASURY,
  WXDAI_ADDRESS,
} from '@/lib/payments/stablecoin-direct-adapter'

import { StatusPill } from './StatusPill'

type TransactionState = 'confirming' | 'idle' | 'pending_signature' | 'verified'

const MOCK_WALLET = '0x1111111111111111111111111111111111111111'
const MOCK_TX_HASH = `0x${'a81c'.repeat(16)}`
const REQUIRED_CONFIRMATIONS = 12

export function MockStablecoinCheckout({
  amount,
  isMember,
}: {
  amount: number
  isMember: boolean
}) {
  const [connected, setConnected] = useState(false)
  const [chainID, setChainID] = useState(1)
  const [copied, setCopied] = useState('')
  const [transactionState, setTransactionState] = useState<TransactionState>('idle')
  const [confirmations, setConfirmations] = useState(0)
  const eligibleShares = isMember ? amount / MEMBER_SUBSCRIPTION_SHARE_PRICE_USD : 0
  const onGnosis = chainID === GNOSIS_CHAIN_ID

  function connectWallet() {
    setConnected(true)
  }

  function switchNetwork() {
    setChainID(GNOSIS_CHAIN_ID)
    setTransactionState('idle')
  }

  function requestTransfer() {
    setTransactionState('pending_signature')
  }

  function simulateSignature() {
    setTransactionState('confirming')
    setConfirmations(1)
  }

  function advanceConfirmations() {
    const next = Math.min(REQUIRED_CONFIRMATIONS, confirmations + 4)
    setConfirmations(next)
    if (next === REQUIRED_CONFIRMATIONS) setTransactionState('verified')
  }

  async function copyValue(label: string, value: string) {
    await navigator.clipboard?.writeText(value)
    setCopied(label)
  }

  return (
    <main className="web3-checkout-main">
      <Link className="back-link" href="/">
        <ArrowLeft size={15} /> Return to participation dashboard
      </Link>

      <section className="web3-checkout-hero">
        <div>
          <span className="eyebrow">Mock direct stablecoin rail</span>
          <h1>Pay with wxDAI</h1>
          <p>Send this month&apos;s payment directly to the RaidGuild treasury on Gnosis Chain.</p>
        </div>
        <StatusPill tone={transactionState === 'verified' ? 'good' : 'signal'}>
          {transactionState === 'verified' ? 'Payment verified' : 'No real transaction'}
        </StatusPill>
      </section>

      <section className="web3-progress" aria-label="Payment progress">
        {[
          { complete: connected, label: 'Connect' },
          { complete: connected && onGnosis, label: 'Network' },
          { complete: transactionState !== 'idle' && transactionState !== 'pending_signature', label: 'Transfer' },
          { complete: transactionState === 'verified', label: 'Verify' },
        ].map((step, index) => (
          <div className={step.complete ? 'is-complete' : ''} key={step.label}>
            <span>{step.complete ? <Check size={15} /> : index + 1}</span>
            <small>{step.label}</small>
          </div>
        ))}
      </section>

      <section className="web3-grid">
        <article className="section-card web3-payment-card">
          <span className="eyebrow">Payment amount</span>
          <div className="web3-amount"><strong>{amount}.00</strong><span>wxDAI</span></div>
          <p>Approximately ${amount}.00 · one monthly participation period</p>
          <p className="fine-print">This payment does not renew automatically. Portal will prompt you before the next period.</p>
          {isMember ? (
            <div className="web3-discount">
              <StatusPill tone="signal">{MEMBER_SUBSCRIPTION_DISCOUNT_PERCENT}% member discount</StatusPill>
              <span><strong>{eligibleShares} RG</strong> estimated for the monthly proposal</span>
            </div>
          ) : (
            <div className="web3-discount"><span>No RG shares are issued for this participation class.</span></div>
          )}
        </article>

        <article className="section-card web3-wallet-card">
          <div className="section-heading">
            <div><span className="eyebrow">Payer wallet</span><h2>{connected ? 'Wallet connected' : 'Connect a wallet'}</h2></div>
            <Wallet aria-hidden="true" size={25} />
          </div>
          {connected ? (
            <>
              <div className="wallet-identity">
                <span className="wallet-orb" />
                <span><strong>{shorten(MOCK_WALLET)}</strong><small>Mock browser wallet</small></span>
              </div>
              <div className={`network-row ${onGnosis ? 'is-correct' : 'is-wrong'}`}>
                {onGnosis ? <CheckCircle2 size={18} /> : <TriangleAlert size={18} />}
                <span><strong>{onGnosis ? 'Gnosis Chain' : 'Ethereum Mainnet'}</strong><small>Chain ID {chainID}</small></span>
                {!onGnosis ? <button onClick={switchNetwork} type="button">Switch network</button> : null}
              </div>
            </>
          ) : (
            <>
              <p>In production this opens the configured wallet connector. The mock never requests wallet access.</p>
              <button className="button button--primary" onClick={connectWallet} type="button"><Wallet size={16} /> Simulate connect</button>
            </>
          )}
        </article>
      </section>

      <section className="section-card transfer-review-card">
        <div className="section-heading">
          <div><span className="eyebrow">ERC-20 transfer</span><h2>Review transaction</h2></div>
          <ShieldCheck aria-hidden="true" size={25} />
        </div>
        <div className="transfer-fields">
          <TransferField label="Network" value="Gnosis Chain · 100" />
          <TransferField copy={() => copyValue('token', WXDAI_ADDRESS)} copied={copied === 'token'} label="Token" value={`wxDAI · ${shorten(WXDAI_ADDRESS)}`} />
          <TransferField copy={() => copyValue('treasury', RAIDGUILD_TREASURY)} copied={copied === 'treasury'} label="To RaidGuild Safe" value={shorten(RAIDGUILD_TREASURY)} />
          <TransferField label="Amount" value={`${amount}.00 wxDAI`} />
        </div>

        {!connected || !onGnosis ? (
          <div className="transaction-gate"><TriangleAlert size={18} /> Connect a wallet and switch to Gnosis Chain to continue.</div>
        ) : transactionState === 'idle' ? (
          <button className="button button--primary transaction-button" onClick={requestTransfer} type="button">Review in wallet</button>
        ) : transactionState === 'pending_signature' ? (
          <div className="transaction-simulation">
            <span><RefreshCw className="spin-icon" size={20} /><strong>Waiting for wallet confirmation</strong></span>
            <p>A real wallet would show an ERC-20 `transfer` of {amount} wxDAI to the Safe. No approval or unlimited allowance is requested.</p>
            <button className="button button--primary" onClick={simulateSignature} type="button">Simulate confirm</button>
          </div>
        ) : transactionState === 'confirming' ? (
          <div className="transaction-simulation">
            <span><RefreshCw className="spin-icon" size={20} /><strong>Confirming on Gnosis</strong></span>
            <p>{confirmations} of {REQUIRED_CONFIRMATIONS} confirmations · {shorten(MOCK_TX_HASH)}</p>
            <div className="confirmation-track"><span style={{ width: `${(confirmations / REQUIRED_CONFIRMATIONS) * 100}%` }} /></div>
            <button className="button button--primary" onClick={advanceConfirmations} type="button">Advance confirmations</button>
          </div>
        ) : (
          <div className="verified-receipt">
            <CheckCircle2 size={32} />
            <span><strong>Payment independently verified</strong><small>Paid through September 30, 2026</small></span>
            <button className="text-action" type="button">Mock transaction <ExternalLink size={15} /></button>
          </div>
        )}
      </section>

      <div className="admin-warning">
        <TriangleAlert aria-hidden="true" size={20} />
        <p>Simulation only. No wallet library is loaded, no signature is requested, and no wxDAI moves.</p>
      </div>
    </main>
  )
}

function TransferField({
  copy,
  copied,
  label,
  value,
}: {
  copy?: () => void
  copied?: boolean
  label: string
  value: string
}) {
  return (
    <div>
      <small>{label}</small>
      <strong>{value}</strong>
      {copy ? <button aria-label={`Copy ${label}`} onClick={copy} type="button">{copied ? <Check size={15} /> : <Copy size={15} />}</button> : null}
    </div>
  )
}

function shorten(value: string): string {
  return `${value.slice(0, 6)}…${value.slice(-4)}`
}
