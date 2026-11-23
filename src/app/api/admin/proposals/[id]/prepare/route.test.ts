import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  session: null as null | { id: string; isAppAdmin: boolean }, originValid: true, prepare: vi.fn(),
}))
vi.mock('@/lib/portal/session', () => ({ getCurrentSession: async () => mocks.session }))
vi.mock('@/lib/http/same-origin', () => ({ hasValidRequestOrigin: () => mocks.originValid }))
vi.mock('@/lib/governance/service', () => ({
  prepareProposalTransaction: mocks.prepare,
  GovernancePreparationError: class GovernancePreparationError extends Error { status = 409 },
}))

import { POST } from './route'

const context = { params: Promise.resolve({ id: 'artifact-1' }) }
const request = () => new Request('https://participation.example/api/admin/proposals/artifact-1/prepare', { method: 'POST' })

describe('wallet transaction preparation API', () => {
  beforeEach(() => { mocks.session = null; mocks.originValid = true; mocks.prepare.mockReset() })

  it('requires current app-admin browser session and valid origin', async () => {
    expect((await POST(request(), context)).status).toBe(401)
    mocks.session = { id: 'user', isAppAdmin: false }
    expect((await POST(request(), context)).status).toBe(403)
    mocks.session = { id: 'admin', isAppAdmin: true }; mocks.originValid = false
    expect((await POST(request(), context)).status).toBe(403)
    expect(mocks.prepare).not.toHaveBeenCalled()
  })

  it('returns server-built fields but has no submission side effect', async () => {
    mocks.session = { id: 'admin', isAppAdmin: true }
    mocks.prepare.mockResolvedValue({ chainId: 100, to: '0xabc', data: '0x1234', valueRaw: '0' })
    const response = await POST(request(), context)
    expect(mocks.prepare).toHaveBeenCalledWith('artifact-1', 'admin')
    expect(await response.json()).toEqual({ transaction: { chainId: 100, to: '0xabc', data: '0x1234', valueRaw: '0' }, submissionEnabled: false })
  })
})
