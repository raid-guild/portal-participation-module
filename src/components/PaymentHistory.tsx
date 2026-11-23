import type { PaymentHistoryItem } from '@/lib/payments/history'

export function PaymentHistory({ items }: { items: PaymentHistoryItem[] }) {
  return <section className="section-card">
    <div className="section-heading"><div><span className="eyebrow">Treasury contributions</span><h2>Payment history</h2></div></div>
    {items.length ? <div className="capability-list">{items.map((item) => <div className="capability-row" key={item.id}>
      <span><strong>{(item.amountMinorUnits / 100).toFixed(2)} {item.asset} · {item.periodKey}</strong>
        <small>{item.status === 'confirmed' ? `Verified ${item.confirmedAt ? new Date(item.confirmedAt).toLocaleString() : ''}` : `${item.status} · ${item.confirmations}/${item.requiredConfirmations} confirmations`}</small>
        {item.transactionHash ? <small><a href={`https://gnosisscan.io/tx/${item.transactionHash}`} rel="noreferrer" target="_blank">View Gnosis transaction</a></small> : null}
        {item.transactionHash ? <small>Payer {item.payer} · Treasury {item.treasury}</small> : null}
        {item.minedAt ? <small>Mined {new Date(item.minedAt).toLocaleString()} · Gnosis Chain</small> : null}
        {item.status === 'confirmed' ? <small>Payment receipt only. RG shares require a separate DAO proposal.</small> : null}
      </span>
    </div>)}</div> : <p>No payment intents or receipts yet.</p>}
  </section>
}
