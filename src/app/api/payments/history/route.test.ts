import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  session: null as null | { id: string },
  getPaymentHistory: vi.fn(),
}))

vi.mock('@/lib/portal/session', () => ({ getCurrentSession: async () => mocks.session }))
vi.mock('@/lib/payments/history', () => ({ getPaymentHistory: mocks.getPaymentHistory }))

import { GET } from './route'

describe('owned payment history route', () => {
  beforeEach(() => {
    mocks.session = null
    mocks.getPaymentHistory.mockReset()
  })

  it('rejects unauthenticated callers without reading payment data', async () => {
    const response = await GET()
    expect(response.status).toBe(401)
    expect(mocks.getPaymentHistory).not.toHaveBeenCalled()
  })

  it('passes only the authenticated session user ID to the history query', async () => {
    mocks.session = { id: 'owned-user' }
    mocks.getPaymentHistory.mockResolvedValue([{ id: 'receipt-1' }])
    const response = await GET()
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(mocks.getPaymentHistory).toHaveBeenCalledTimes(1)
    expect(mocks.getPaymentHistory).toHaveBeenCalledWith('owned-user')
    expect(await response.json()).toEqual({ items: [{ id: 'receipt-1' }] })
  })
})
