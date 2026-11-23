import { describe, expect, it } from 'vitest'

import { assertIndependentProposalReviewer, equivalentSimulation } from './service'
import { assertPinnedExecutableDependencies, assertPinnedGovernanceParameters, EXECUTABLE_CODE_HASHES, SAFE_MASTER_COPY, SHARES_IMPLEMENTATION, sponsorshipTerms, type ProposalSimulation } from './simulation'

const simulation: ProposalSimulation = {
  config: { chainId: 100, blockNumber: '100', blockHash: '0xabc', dao: '0x1111111111111111111111111111111111111111',
    safe: '0x2222222222222222222222222222222222222222', shares: '0x3333333333333333333333333333333333333333',
    multisend: '0x4444444444444444444444444444444444444444', cloneImplementation: '0x5555555555555555555555555555555555555555',
    multisendCodeHash: '0xdef', proposalOffering: '100', sponsorThreshold: '200', votingPeriod: 10, gracePeriod: 10, proposalCount: 3,
    executableDependencies: {
      baalImplementationCodeHash: EXECUTABLE_CODE_HASHES.baalImplementation,
      safeProxyCodeHash: EXECUTABLE_CODE_HASHES.safeProxy, safeMasterCopy: SAFE_MASTER_COPY,
      safeMasterCopyCodeHash: EXECUTABLE_CODE_HASHES.safeMasterCopy,
      sharesProxyCodeHash: EXECUTABLE_CODE_HASHES.sharesProxy, sharesImplementation: SHARES_IMPLEMENTATION,
      sharesImplementationCodeHash: EXECUTABLE_CODE_HASHES.sharesImplementation,
    } },
  configHash: 'hash', submitter: '0x6666666666666666666666666666666666666666', delegatedVotesRaw: '10',
  autoSponsor: false, proposalOfferingRaw: '100', requiredValueRaw: '100',
  actionSuccess: true, submissionSuccess: true, simulatedProposalId: '4',
  simulatedAt: '2026-11-23T00:00:00.000Z', expiresAt: '2026-11-23T00:05:00.000Z',
}

describe('proposal review safety gates', () => {
  it('prohibits self approval and allows only a different reviewer identity', () => {
    expect(() => assertIndependentProposalReviewer('admin-a', 'admin-a')).toThrow('cannot approve')
    expect(() => assertIndependentProposalReviewer('admin-a', 'admin-b')).not.toThrow()
  })

  it('requires the exact current config, delegated votes and simulation result', () => {
    expect(equivalentSimulation(simulation, { ...simulation, config: { ...simulation.config, blockNumber: '101', blockHash: '0xdef' }, simulatedAt: 'later' })).toBe(true)
    expect(equivalentSimulation(simulation, { ...simulation, config: { ...simulation.config, proposalOffering: '101' } })).toBe(false)
    expect(equivalentSimulation(simulation, { ...simulation, delegatedVotesRaw: '200', autoSponsor: true, requiredValueRaw: '0' })).toBe(false)
    expect(equivalentSimulation(simulation, { ...simulation, actionSuccess: false as true })).toBe(false)
  })

  it('discloses non-sponsor native offering and auto-sponsor threshold boundary', () => {
    expect(sponsorshipTerms(199n, 200n, 100n)).toEqual({ autoSponsor: false, requiredValue: 100n })
    expect(sponsorshipTerms(200n, 200n, 100n)).toEqual({ autoSponsor: true, requiredValue: 0n })
  })

  it('fails closed when DAO governance parameters change', () => {
    const params = { proposalOffering: 10n ** 18n, sponsorThreshold: 100n * 10n ** 18n,
      votingPeriod: 259200, gracePeriod: 172800 }
    expect(() => assertPinnedGovernanceParameters(params)).not.toThrow()
    expect(() => assertPinnedGovernanceParameters({ ...params, proposalOffering: 2n * 10n ** 18n })).toThrow('changed')
    expect(() => assertPinnedGovernanceParameters({ ...params, sponsorThreshold: 0n })).toThrow('changed')
    expect(() => assertPinnedGovernanceParameters({ ...params, votingPeriod: 259201 })).toThrow('changed')
  })

  it('rejects same-address Safe and shares implementation/code changes', () => {
    const deps = simulation.config.executableDependencies
    expect(() => assertPinnedExecutableDependencies(deps)).not.toThrow()
    expect(() => assertPinnedExecutableDependencies({ ...deps, safeProxyCodeHash: '0xdead' })).toThrow('executable dependency')
    expect(() => assertPinnedExecutableDependencies({ ...deps, safeMasterCopyCodeHash: '0xdead' })).toThrow('executable dependency')
    expect(() => assertPinnedExecutableDependencies({ ...deps, safeMasterCopy: SHARES_IMPLEMENTATION })).toThrow('executable dependency')
    expect(() => assertPinnedExecutableDependencies({ ...deps, sharesProxyCodeHash: '0xdead' })).toThrow('executable dependency')
    expect(() => assertPinnedExecutableDependencies({ ...deps, sharesImplementationCodeHash: '0xdead' })).toThrow('executable dependency')
    expect(() => assertPinnedExecutableDependencies({ ...deps, sharesImplementation: SAFE_MASTER_COPY })).toThrow('executable dependency')
    expect(equivalentSimulation(simulation, { ...simulation, config: { ...simulation.config,
      executableDependencies: { ...deps, safeMasterCopyCodeHash: '0xdead' } } })).toBe(false)
  })
})
