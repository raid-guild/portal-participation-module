export type CheckoutHistoryCandidate = {
  id: string
  status: string
  transactionHash: string | null
  confirmations: number
  requiredConfirmations: number
  createdAt: string
  amountMinorUnits: number
}

export function selectCheckoutRecovery(items: CheckoutHistoryCandidate[]) {
  return {
    recoverableIntents: items.filter((item) =>
      !item.transactionHash && ['pending', 'observed', 'expired'].includes(item.status)),
    activeObservation: items.find((item) =>
      item.transactionHash && ['pending', 'confirming', 'observed'].includes(item.status)) ?? null,
    reviewObservation: items.find((item) =>
      item.transactionHash && ['needs_review', 'rejected'].includes(item.status)) ?? null,
  }
}
