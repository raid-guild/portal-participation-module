import { afterEach, describe, expect, it, vi } from 'vitest'

import { memberContributionCheckouts, users } from '../db/schema'

const mocks = vi.hoisted(() => ({ database: null as unknown }))
vi.mock('../db/client', () => ({ getDatabase: () => mocks.database }))
vi.mock('../dao/membership', () => ({
  GNOSIS_CHAIN_ID: 100,
  getLatestSuccessfulMembershipRun: async () => ({ id: 'run-1', thresholdRaw: '100000000000000000000' }),
}))

import { beginTestMemberContribution } from './member-contribution-service'

function databaseFixture() {
  let checkout: Record<string, unknown> | null = null
  const database = {
    select: () => ({ from: (table: unknown) => ({
      innerJoin: () => ({ where: () => ({ limit: async () => [{ walletId: 'wallet-1', runId: 'run-1' }] }) }),
      where: () => ({ limit: async () => table === users
        ? [{ id: 'user-1', email: 'member@example.com', portalUserId: 'portal-member-1' }]
        : table === memberContributionCheckouts && checkout ? [checkout] : [] }),
    }) }),
    transaction: async (action: (tx: unknown) => Promise<unknown>) => action(database),
    execute: async () => undefined,
    insert: (table: unknown) => ({ values: (values: Record<string, unknown>) => ({ returning: async () => {
      expect(table).toBe(memberContributionCheckouts)
      checkout = {
        ...values, id: 'a0fd66d5-262d-4305-a8ad-cd15bbc1db0b', status: 'creating',
        commerceCheckoutId: null, checkoutUrl: null, orderId: null, errorCode: null,
        cumulativeRefundedSubtotalMinor: 0, authorizedAt: new Date(),
      }
      return [checkout]
    } }) }),
    update: (table: unknown) => ({ set: (changes: Record<string, unknown>) => ({ where: () => ({ returning: async () => {
      expect(table).toBe(memberContributionCheckouts)
      if (!checkout || checkout.status !== 'creating') return []
      checkout = { ...checkout, ...changes }
      return [checkout]
    } }) }) }),
  }
  mocks.database = database
  return { get checkout() { return checkout } }
}

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

describe('concurrent idempotent contribution checkout', () => {
  it('returns creating to the second caller while the first can still publish pending', async () => {
    vi.stubEnv('MEMBER_CONTRIBUTION_MODE', 'shopify_test')
    vi.stubEnv('COMMERCE_BASE_URL', 'https://commerce.example')
    vi.stubEnv('COMMERCE_CONTRIBUTION_CHECKOUT_KEY', 'test-key')
    vi.stubEnv('COMMERCE_SHOP_DOMAIN', 'example.myshopify.com')
    const fixture = databaseFixture()
    let completeFirst!: (response: Response) => void
    const firstReply = new Promise<Response>((resolve) => { completeFirst = resolve })
    const commerceId = 'mcc_a0fd66d5-262d-4305-a8ad-cd15bbc1db0b'
    const fetchMock = vi.fn()
      .mockImplementationOnce(() => firstReply)
      .mockResolvedValueOnce(Response.json({ commerceCheckoutId: commerceId, status: 'creating', checkoutUrl: null, environment: 'shopify_test' }))
    vi.stubGlobal('fetch', fetchMock)

    const first = beginTestMemberContribution('user-1', 20)
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const second = await beginTestMemberContribution('user-1', 20)
    expect(second.status).toBe('creating')
    expect(second.checkoutUrl).toBeNull()
    expect(fixture.checkout?.status).toBe('creating')

    completeFirst(Response.json({ commerceCheckoutId: commerceId, status: 'pending', checkoutUrl: 'https://example.myshopify.com/invoices/test', environment: 'shopify_test' }))
    const settled = await first
    expect(settled.status).toBe('pending')
    expect(settled.checkoutUrl).toBe('https://example.myshopify.com/invoices/test')
    expect(fixture.checkout?.status).toBe('pending')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
