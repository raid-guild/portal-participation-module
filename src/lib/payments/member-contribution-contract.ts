export const MEMBER_CONTRIBUTION_AMOUNTS = [20, 40, 60, 80, 100, 120, 140, 160, 180, 200] as const

export type MemberContributionEvent = {
  schemaVersion: 1
  eventId: string
  type: 'capture_verified' | 'refund_verified' | 'dispute_observed'
  environment: 'shopify_test'
  authorizationId: string
  commerceCheckoutId: string
  shopDomain: string
  orderId: string
  currency: 'USD'
  productSubtotalMinor: number
  taxMinor: number
  cumulativeRefundedSubtotalMinor: number
  cumulativeRefundedTaxMinor: number
  occurredAt: string
  verifiedAt: string
}

export function contributionAmount(value: unknown): number {
  if (typeof value !== 'number' || !MEMBER_CONTRIBUTION_AMOUNTS.includes(value as typeof MEMBER_CONTRIBUTION_AMOUNTS[number])) {
    throw new Error('Select a member contribution from $20 to $200 in $20 increments.')
  }
  return value
}

export function parseMemberContributionEvent(value: unknown): MemberContributionEvent {
  if (!value || typeof value !== 'object') throw new Error('Invalid billing event.')
  const event = value as Record<string, unknown>
  const integer = (n: unknown) => Number.isSafeInteger(n) && Number(n) >= 0
  const string = (s: unknown) => typeof s === 'string' && s.length > 0 && s.length <= 256
  if (event.schemaVersion !== 1 || !['capture_verified', 'refund_verified', 'dispute_observed'].includes(String(event.type)) ||
    event.environment !== 'shopify_test' || event.currency !== 'USD' ||
    ![event.eventId, event.authorizationId, event.commerceCheckoutId, event.shopDomain, event.orderId].every(string) ||
    ![event.productSubtotalMinor, event.taxMinor, event.cumulativeRefundedSubtotalMinor, event.cumulativeRefundedTaxMinor].every(integer) ||
    Number(event.cumulativeRefundedTaxMinor) > Number(event.taxMinor) ||
    !string(event.occurredAt) || !string(event.verifiedAt) ||
    Number.isNaN(Date.parse(String(event.occurredAt))) || Number.isNaN(Date.parse(String(event.verifiedAt)))) {
    throw new Error('Invalid billing event.')
  }
  return event as MemberContributionEvent
}

export function projectContributionStatus(
  current: string,
  event: MemberContributionEvent,
  authorizedMinor: number,
): 'captured' | 'refunded' | 'disputed' | 'needs_review' {
  if (current === 'disputed' || current === 'needs_review') return current
  if (event.productSubtotalMinor !== authorizedMinor || event.cumulativeRefundedSubtotalMinor > authorizedMinor) return 'needs_review'
  if (current === 'refunded') return 'refunded'
  if (event.type === 'dispute_observed') return 'disputed'
  if (event.cumulativeRefundedSubtotalMinor > 0 || event.type === 'refund_verified') return 'refunded'
  return 'captured'
}
