import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  session: null as null | { id: string; isAppAdmin: boolean },
  freeze: vi.fn(), list: vi.fn(),
}))
vi.mock('@/lib/portal/session', () => ({ getCurrentSession: async () => mocks.session }))
vi.mock('@/lib/http/same-origin', () => ({ hasValidRequestOrigin: () => true }))
vi.mock('@/lib/issuance/service', () => ({
  freezeIssuanceReview: mocks.freeze, listIssuanceReviews: mocks.list,
  IssuanceReviewError: class IssuanceReviewError extends Error { status = 409 },
}))

import { GET, POST } from './route'

describe('frozen issuance admin route', () => {
  beforeEach(() => { mocks.session = null; mocks.freeze.mockReset(); mocks.list.mockReset() })

  it('rejects unauthenticated and non-admin requests without freezing evidence', async () => {
    const request = new Request('https://participation.example/api/admin/issuance', { method: 'POST', body: JSON.stringify({ periodKey: '2026-10' }), headers: { 'content-type': 'application/json' } })
    expect((await POST(request)).status).toBe(401)
    mocks.session = { id: 'user', isAppAdmin: false }
    expect((await POST(request)).status).toBe(403)
    expect(mocks.freeze).not.toHaveBeenCalled()
    expect((await GET()).status).toBe(403)
  })

  it('binds a freeze request to the current app-admin user', async () => {
    mocks.session = { id: 'admin-1', isAppAdmin: true }
    mocks.freeze.mockResolvedValue({ id: 'snapshot-1', revision: 1, payloadSha256: 'a'.repeat(64) })
    const request = new Request('https://participation.example/api/admin/issuance', { method: 'POST', body: JSON.stringify({ periodKey: '2026-10', createdByUserId: 'forged' }), headers: { 'content-type': 'application/json' } })
    const response = await POST(request)
    expect(response.status).toBe(201)
    expect(mocks.freeze).toHaveBeenCalledWith('2026-10', 'admin-1')
  })
})
