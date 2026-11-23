import { describe, expect, it } from 'vitest'

import { contributionAmount, parseMemberContributionEvent, projectContributionStatus } from './member-contribution-contract'
import { verifiedInvoiceUrl } from './member-contribution-service'

const event = {
  schemaVersion: 1, eventId: 'event-1', type: 'capture_verified', environment: 'shopify_test',
  authorizationId: 'auth-1', commerceCheckoutId: 'mcc-1', shopDomain: 'example.myshopify.com',
  orderId: 'gid://shopify/Order/1', currency: 'USD', productSubtotalMinor: 2000,
  taxMinor: 0, cumulativeRefundedSubtotalMinor: 0,
  cumulativeRefundedTaxMinor: 0,
  occurredAt: '2026-11-23T12:00:00.000Z', verifiedAt: '2026-11-23T12:01:00.000Z',
} as const

describe('isolated Shopify test contribution contract', () => {
  it('accepts only fixed $20 increments through $200', () => {
    for (const n of [20, 40, 100, 200]) expect(contributionAmount(n)).toBe(n)
    for (const n of [0, 21, 201, '20', null]) expect(() => contributionAmount(n)).toThrow()
  })
  it('rejects live and malformed economic evidence', () => {
    expect(parseMemberContributionEvent(event)).toEqual(event)
    expect(() => parseMemberContributionEvent({ ...event, environment: 'live' })).toThrow()
    expect(() => parseMemberContributionEvent({ ...event, productSubtotalMinor: -1 })).toThrow()
  })
  it('keeps refunds and disputes sticky across out-of-order captures', () => {
    expect(projectContributionStatus('pending', event, 2000)).toBe('captured')
    expect(projectContributionStatus('captured', { ...event, type: 'refund_verified', cumulativeRefundedSubtotalMinor: 1000 }, 2000)).toBe('refunded')
    expect(projectContributionStatus('refunded', { ...event, cumulativeRefundedSubtotalMinor: 1000 }, 2000)).toBe('refunded')
    expect(projectContributionStatus('refunded', event, 2000)).toBe('refunded')
    expect(projectContributionStatus('disputed', event, 2000)).toBe('disputed')
    expect(projectContributionStatus('pending', event, 4000)).toBe('needs_review')
  })
  it('accepts invoice URLs only on the configured shop', () => {
    expect(verifiedInvoiceUrl('https://example.myshopify.com/invoices/test', 'example.myshopify.com')).toBe('https://example.myshopify.com/invoices/test')
    expect(() => verifiedInvoiceUrl('https://other.myshopify.com/invoices/test', 'example.myshopify.com')).toThrow()
    expect(() => verifiedInvoiceUrl('https://example.myshopify.com.evil.test/invoices/test', 'example.myshopify.com')).toThrow()
  })
})
