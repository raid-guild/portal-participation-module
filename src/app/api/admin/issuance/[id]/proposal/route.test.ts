import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  session: null as null | { id: string; isAppAdmin: boolean },
  originValid: true,
  build: vi.fn(),
}))
vi.mock('@/lib/portal/session', () => ({ getCurrentSession: async () => mocks.session }))
vi.mock('@/lib/http/same-origin', () => ({ hasValidRequestOrigin: () => mocks.originValid }))
vi.mock('@/lib/governance/service', () => ({
  buildProposalArtifact: mocks.build,
  GovernancePreparationError: class GovernancePreparationError extends Error { status = 409 },
}))

import { POST } from './route'

const context = { params: Promise.resolve({ id: 'snapshot-1' }) }
function request(body: object) {
  return new Request('https://participation.example/api/admin/issuance/snapshot-1/proposal', {
    method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' },
  })
}

describe('proposal artifact creation API', () => {
  beforeEach(() => { mocks.session = null; mocks.originValid = true; mocks.build.mockReset() })

  it('refuses anonymous, non-admin and cross-site requests before simulation', async () => {
    expect((await POST(request({ submitterAddress: '0x123' }), context)).status).toBe(401)
    mocks.session = { id: 'user', isAppAdmin: false }
    expect((await POST(request({ submitterAddress: '0x123' }), context)).status).toBe(403)
    mocks.session = { id: 'admin', isAppAdmin: true }; mocks.originValid = false
    expect((await POST(request({ submitterAddress: '0x123' }), context)).status).toBe(403)
    expect(mocks.build).not.toHaveBeenCalled()
  })

  it('uses only the server session identity and snapshot route ID', async () => {
    mocks.session = { id: 'admin', isAppAdmin: true }
    mocks.build.mockResolvedValue({ id: 'artifact-1', artifactSha256: 'hash' })
    const response = await POST(request({ submitterAddress: '0x1111111111111111111111111111111111111111', builderUserId: 'forged', recipients: ['forged'], calldata: '0xdead' }), context)
    expect(response.status).toBe(201)
    expect(mocks.build).toHaveBeenCalledWith('snapshot-1', 'admin', '0x1111111111111111111111111111111111111111')
  })
})
