import { describe, expect, it } from 'vitest'
import { parseUnits } from 'viem'

import { isCanonicalMember } from './membership'

describe('canonical DAO membership', () => {
  const threshold = parseUnits('100', 18)

  it('accepts exactly 100 RG shares', () => {
    expect(isCanonicalMember(threshold, threshold)).toBe(true)
  })

  it('rejects balances below 100 RG shares', () => {
    expect(isCanonicalMember(threshold - 1n, threshold)).toBe(false)
  })
})
